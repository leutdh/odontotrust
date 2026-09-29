import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { TENANT_TABLES } from './schema';

const url = process.env.DATABASE_URL_MIGRATIONS;

// Real database, no mocks: RLS is what is under test.
describe.skipIf(!url)('tenant isolation (RLS)', () => {
  const admin = createDb({ url: url!, max: 2 }); // owner/BYPASSRLS: fixtures only
  const app = createDb({ url: url!, assumeRole: 'app_user', max: 1 }); // single connection on purpose
  const A = randomUUID();
  const B = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const errText = (e: unknown) => {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
  };
  const run = (q: string) => sql.raw(q);

  async function seedClinic(id: string, userId: string, name: string) {
    const prof = randomUUID();
    const sede = randomUUID();
    const sillon = randomUUID();
    const pac = randomUUID();
    const tipo = randomUUID();
    const memb = randomUUID();
    await admin.db.execute(run(`
      insert into clinicas (id, nombre) values ('${id}', '${name}');
      insert into membresias (id, clinica_id, user_id, rol) values ('${memb}', '${id}', '${userId}', 'admin');
      insert into profesionales (id, clinica_id, membresia_id, nombre) values ('${prof}', '${id}', '${memb}', 'Prof');
      insert into sedes (id, clinica_id, nombre) values ('${sede}', '${id}', 'Sede');
      insert into sillones (id, clinica_id, sede_id, nombre) values ('${sillon}', '${id}', '${sede}', 'S1');
      insert into pacientes (id, clinica_id, nombre, apellido, dni) values ('${pac}', '${id}', 'Test', 'Paciente', '${Math.floor(Math.random() * 1e8)}');
      insert into coberturas (clinica_id, paciente_id, obra_social) values ('${id}', '${pac}', 'OSDE');
      insert into tipos_tratamiento (id, clinica_id, nombre, duracion_minutos) values ('${tipo}', '${id}', 'Consulta', 30);
      insert into turnos (clinica_id, paciente_id, profesional_id, sillon_id, tipo_tratamiento_id, inicio, fin)
        values ('${id}', '${pac}', '${prof}', '${sillon}', '${tipo}', '2030-01-01T10:00Z', '2030-01-01T10:30Z');
      insert into audit_log (clinica_id, user_id, entidad, accion) values ('${id}', '${userId}', 'pacientes', 'read');
    `));
    return { prof, pac, sillon };
  }

  let fixA: Awaited<ReturnType<typeof seedClinic>>;

  beforeAll(async () => {
    fixA = await seedClinic(A, userA, 'Clinica A (test)');
    await seedClinic(B, userB, 'Clinica B (test)');
  });

  afterAll(async () => {
    await admin.db.execute(run(`
      delete from turnos where clinica_id in ('${A}','${B}');
      delete from audit_log where clinica_id in ('${A}','${B}');
      delete from sillones where clinica_id in ('${A}','${B}');
      delete from sedes where clinica_id in ('${A}','${B}');
      delete from profesionales where clinica_id in ('${A}','${B}');
      delete from coberturas where clinica_id in ('${A}','${B}');
      delete from pacientes where clinica_id in ('${A}','${B}');
      delete from tipos_tratamiento where clinica_id in ('${A}','${B}');
      delete from membresias where clinica_id in ('${A}','${B}');
      delete from clinicas where id in ('${A}','${B}');
    `));
    await Promise.all([admin.close(), app.close()]);
  });

  describe.each([...TENANT_TABLES])('%s', (table) => {
    it('A cannot read B rows, but reads its own', async () => {
      const [own, foreign] = await app.withTenant(A, async (tx) => [
        await tx.execute(run(`select 1 from ${table} where clinica_id = '${A}'`)),
        await tx.execute(run(`select 1 from ${table} where clinica_id = '${B}'`)),
      ]);
      expect(own!.length).toBeGreaterThan(0);
      expect(foreign!.length).toBe(0);
    });

    it('A cannot insert a row into B', async () => {
      await expect(
        app.withTenant(A, (tx) =>
          tx.execute(
            run(`insert into ${table}
              select (jsonb_populate_record(null::${table},
                to_jsonb(r) || jsonb_build_object('clinica_id', '${B}'::text, 'id', gen_random_uuid()::text))).*
              from ${table} r where r.clinica_id = '${A}' limit 1`),
          ),
        ),
      ).rejects.toSatisfy((e) => /row-level security/.test(errText(e)));
    });

    it('A cannot update B rows', async () => {
      if (table === 'audit_log') return; // append-only: UPDATE not granted (see below)
      const rows = await app.withTenant(A, (tx) =>
        tx.execute(run(`update ${table} set created_at = created_at where clinica_id = '${B}' returning 1`)),
      );
      expect(rows.length).toBe(0);
    });

    it('no set_config => no rows', async () => {
      const rows = await app.db.transaction(async (tx) => {
        await tx.execute(run('set local role app_user'));
        return tx.execute(run(`select 1 from ${table}`));
      });
      expect(rows.length).toBe(0);
    });
  });

  it('clinicas: A sees only itself; no tenant => nothing', async () => {
    const rows = await app.withTenant(A, (tx) => tx.execute(run('select id from clinicas')));
    expect(rows.map((r) => r.id)).toEqual([A]);
    const none = await app.db.transaction(async (tx) => {
      await tx.execute(run('set local role app_user'));
      return tx.execute(run('select id from clinicas'));
    });
    expect(none.length).toBe(0);
    const upd = await app.withTenant(A, (tx) =>
      tx.execute(run(`update clinicas set nombre = nombre where id = '${B}' returning 1`)),
    );
    expect(upd.length).toBe(0);
  });

  it('tenant setting does not leak between transactions on the same pooled connection', async () => {
    await app.withTenant(A, (tx) => tx.execute(run('select 1')));
    const rows = await app.db.transaction(async (tx) => {
      await tx.execute(run('set local role app_user'));
      return tx.execute(run('select 1 from pacientes'));
    });
    expect(rows.length).toBe(0);
  });

  it('withUser lists only the caller memberships across clinics', async () => {
    const rows = await app.withUser(userA, (tx) => tx.execute(run('select clinica_id from membresias')));
    expect(rows.map((r) => r.clinica_id)).toEqual([A]);
    const clinicas = await app.withUser(userA, (tx) => tx.execute(run('select id from clinicas')));
    expect(clinicas.map((r) => r.id)).toEqual([A]);
  });

  it('is append-only / soft-delete only: DELETE is not granted, audit_log UPDATE neither', async () => {
    await expect(app.withTenant(A, (tx) => tx.execute(run('delete from pacientes')))).rejects.toSatisfy(
      (e) => /permission denied/.test(errText(e)),
    );
    await expect(app.withTenant(A, (tx) => tx.execute(run('update audit_log set accion = accion')))).rejects.toSatisfy(
      (e) => /permission denied/.test(errText(e)),
    );
  });

  it('rejects cross-tenant references (composite FKs)', async () => {
    await expect(
      admin.db.execute(
        run(`insert into turnos (clinica_id, paciente_id, profesional_id, inicio, fin)
          values ('${B}', (select id from pacientes where clinica_id = '${A}' limit 1), '${fixA.prof}', '2031-01-01T10:00Z', '2031-01-01T10:30Z')`),
      ),
    ).rejects.toSatisfy((e) => /foreign key/.test(errText(e)));
  });

  it('rejects overlapping turnos, even when concurrent', async () => {
    const insert = () =>
      admin.db.execute(
        run(`insert into turnos (clinica_id, paciente_id, profesional_id, inicio, fin)
          values ('${A}', '${fixA.pac}', '${fixA.prof}', '2032-05-05T10:00Z', '2032-05-05T10:30Z')`),
      );
    const results = await Promise.allSettled([insert(), insert()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(errText(failed.reason)).toMatch(/exclusion|conflicting/);
  });
});
