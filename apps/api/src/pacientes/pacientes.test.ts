import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@odontotrust/db';
import { createApp } from '../api/app';

const url = process.env.DATABASE_URL_MIGRATIONS;
const SUPABASE_URL = 'https://test.supabase.co';

describe.skipIf(!url)('pacientes API (real DB)', () => {
  const admin = createDb({ url: url!, max: 1 });
  const database = createDb({ url: url!, assumeRole: 'app_user', max: 2 });
  const A = randomUUID();
  const B = randomUUID();
  const profA = randomUUID(); // profesional in A
  const recA = randomUUID(); // recepcion in A
  const adminB = randomUUID(); // admin in B
  const users = { profA, recA, adminB };
  let app: ReturnType<typeof createApp>;
  let signer: CryptoKey;
  let profesionalRowId: string;

  const token = (sub: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(sub)
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(signer);

  // Small typed client: as(user, clinic).get('/pacientes')...
  const as = async (user: keyof typeof users, clinic: string) => {
    const auth = `Bearer ${await token(users[user])}`;
    const r = (m: 'get' | 'post' | 'patch' | 'delete', path: string) =>
      request(app)[m](`/api/v1${path}`).set('Authorization', auth).set('X-Clinica-Id', clinic);
    return {
      get: (p: string) => r('get', p),
      post: (p: string, body?: object) => r('post', p).send(body),
      patch: (p: string, body?: object) => r('patch', p).send(body),
      delete: (p: string) => r('delete', p),
    };
  };

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    signer = privateKey;
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' }] });
    app = createApp({ env: { CORS_ALLOWED_ORIGINS: 'http://localhost:3000', SUPABASE_URL }, database, jwks });
    profesionalRowId = randomUUID();
    await admin.db.execute(
      sql.raw(`
      insert into clinicas (id, nombre) values ('${A}', 'Pacientes Test A'), ('${B}', 'Pacientes Test B');
      insert into membresias (clinica_id, user_id, rol) values
        ('${A}', '${profA}', 'profesional'), ('${A}', '${recA}', 'recepcion'), ('${B}', '${adminB}', 'admin');
      insert into profesionales (id, clinica_id, nombre) values ('${profesionalRowId}', '${A}', 'Dra. Test');
    `),
    );
  });

  afterAll(async () => {
    const both = `('${A}','${B}')`;
    await admin.db.execute(
      sql.raw(`
      delete from audit_log where clinica_id in ${both};
      delete from turnos where clinica_id in ${both};
      delete from coberturas where clinica_id in ${both};
      delete from pacientes where clinica_id in ${both};
      delete from profesionales where clinica_id in ${both};
      delete from membresias where clinica_id in ${both};
      delete from clinicas where id in ${both};
    `),
    );
    await Promise.all([admin.close(), database.close()]);
  });

  const base = { nombre: 'María', apellido: 'Gómez' };
  let mariaId: string;

  it('requires auth and an active clinic membership', async () => {
    await request(app).get('/api/v1/pacientes').expect(401);
    const prof = await as('profA', B); // profA is not a member of B
    await prof.get('/pacientes').expect(403);
  });

  it('profesional creates a patient with clinical fields; input is normalized', async () => {
    const prof = await as('profA', A);
    const res = await prof
      .post('/pacientes', {
        ...base,
        dni: '12.345.678',
        celular: '+54 9 11 5555-1234',
        email: '',
        fechaNacimiento: '1990-05-17',
        antecedentes: 'Hipertensión',
        alergias: 'Penicilina',
        cobertura: { obraSocial: 'OSDE', plan: '210', nroAfiliado: '123' },
      })
      .expect(201);
    mariaId = res.body.id;
    expect(res.body).toMatchObject({
      dni: '12345678',
      celular: '+5491155551234',
      email: null,
      antecedentes: 'Hipertensión',
      alergias: 'Penicilina',
      cobertura: { obraSocial: 'OSDE', plan: '210', nroAfiliado: '123' },
    });
  });

  it('recepcion sees the patient WITHOUT clinical fields', async () => {
    const rec = await as('recA', A);
    const res = await rec.get(`/pacientes/${mariaId}`).expect(200);
    expect(res.body.nombre).toBe('María');
    expect(res.body.cobertura.obraSocial).toBe('OSDE');
    expect(res.body).not.toHaveProperty('antecedentes');
    expect(res.body).not.toHaveProperty('alergias');
    expect(JSON.stringify(res.body)).not.toMatch(/Penicilina|Hipertensión/);
  });

  it('recepcion cannot write clinical fields, but can create/edit administrative data', async () => {
    const rec = await as('recA', A);
    await rec.post('/pacientes', { ...base, nombre: 'Otro', alergias: 'x' }).expect(403);
    await rec.patch(`/pacientes/${mariaId}`, { antecedentes: 'x' }).expect(403);
    const created = await rec.post('/pacientes', { nombre: 'Carlos', apellido: 'Pérez', celular: '11 4444 5555' }).expect(201);
    expect(created.body).not.toHaveProperty('antecedentes');
    await rec.patch(`/pacientes/${mariaId}`, { notas: 'Prefiere turnos a la tarde' }).expect(200);
  });

  it('validates input without echoing submitted values', async () => {
    const prof = await as('profA', A);
    const res = await prof.post('/pacientes', { ...base, dni: 'abc-SECRETO', extra: 1 }).expect(400);
    expect(res.body.code).toBe('validation_error');
    expect(JSON.stringify(res.body)).not.toContain('SECRETO');
    await prof.post('/pacientes', { nombre: '', apellido: 'X' }).expect(400);
    await prof.post('/pacientes', { ...base, fechaNacimiento: '2999-01-01' }).expect(400);
    await prof.get('/pacientes/not-a-uuid').expect(404);
  });

  it('searches by name, surname, DNI and phone (any formatting), with multiple tokens', async () => {
    const prof = await as('profA', A);
    const names = async (q: string) =>
      (await prof.get(`/pacientes?q=${encodeURIComponent(q)}`).expect(200)).body.items.map(
        (p: { nombre: string }) => p.nombre,
      );
    expect(await names('mar')).toEqual(['María']);
    expect(await names('GÓMEZ')).toEqual(['María']);
    expect(await names('12.345')).toEqual(['María']);
    expect(await names('1155551234')).toEqual(['María']);
    expect(await names('4444 5555')).toEqual(['Carlos']);
    expect(await names('maría gómez')).toEqual(['María']);
    expect(await names('maría pérez')).toEqual([]);
    expect(await names('100%')).toEqual([]); // LIKE wildcards are escaped
  });

  it('paginates with a cursor, ordered by surname', async () => {
    const prof = await as('profA', A);
    for (const n of ['Ana', 'Beto', 'Carla']) await prof.post('/pacientes', { nombre: n, apellido: 'Zeta' }).expect(201);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const res: request.Response = await prof.get(`/pacientes?limit=2${cursor ? `&cursor=${cursor}` : ''}`).expect(200);
      seen.push(...res.body.items.map((p: { apellido: string; nombre: string }) => `${p.apellido} ${p.nombre}`));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual([
      'Gómez María',
      'Pérez Carlos',
      'Zeta Ana',
      'Zeta Beto',
      'Zeta Carla',
    ]);
    await prof.get('/pacientes?cursor=garbage').expect(400);
  });

  it('rejects a duplicate DNI within a clinic (409) but allows it in another clinic', async () => {
    const prof = await as('profA', A);
    const dup = await prof.post('/pacientes', { nombre: 'Otra', apellido: 'Persona', dni: '12345678' }).expect(409);
    expect(dup.body.code).toBe('dni_duplicado');
    const other = await as('adminB', B);
    await other.post('/pacientes', { nombre: 'Otra', apellido: 'Persona', dni: '12345678' }).expect(201);
  });

  it('updates partially and manages the coverage (change, remove)', async () => {
    const prof = await as('profA', A);
    let res: request.Response = await prof.patch(`/pacientes/${mariaId}`, { domicilio: 'Calle Falsa 123', cobertura: { obraSocial: 'Swiss Medical' } }).expect(200);
    expect(res.body.domicilio).toBe('Calle Falsa 123');
    expect(res.body.nombre).toBe('María'); // untouched
    expect(res.body.cobertura).toEqual({ obraSocial: 'Swiss Medical', plan: null, nroAfiliado: null });
    res = await prof.patch(`/pacientes/${mariaId}`, { cobertura: null }).expect(200);
    expect(res.body.cobertura).toBeNull();
    res = await prof.patch(`/pacientes/${mariaId}`, { cobertura: { obraSocial: 'OSDE', nroAfiliado: '9' } }).expect(200);
    expect(res.body.cobertura.obraSocial).toBe('OSDE');
    await prof.patch(`/pacientes/${mariaId}`, {}).expect(400);
  });

  it('lists the patient turnos', async () => {
    await admin.db.execute(
      sql.raw(`insert into turnos (clinica_id, paciente_id, profesional_id, inicio, fin)
        values ('${A}', '${mariaId}', '${profesionalRowId}', '2030-03-03T13:00Z', '2030-03-03T13:30Z')`),
    );
    const rec = await as('recA', A);
    const res = await rec.get(`/pacientes/${mariaId}/turnos`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ profesional: 'Dra. Test', estado: 'pendiente' });
  });

  it('isolates clinics: B cannot see, list, edit or delete A patients', async () => {
    const b = await as('adminB', B);
    await b.get(`/pacientes/${mariaId}`).expect(404);
    await b.get(`/pacientes/${mariaId}/turnos`).expect(404);
    await b.patch(`/pacientes/${mariaId}`, { notas: 'hack' }).expect(404);
    await b.delete(`/pacientes/${mariaId}`).expect(404);
    const list = await b.get('/pacientes?q=mar').expect(200);
    expect(list.body.items.every((p: { nombre: string }) => p.nombre !== 'María')).toBe(true);
    // And A's patient is untouched.
    const prof = await as('profA', A);
    expect((await prof.get(`/pacientes/${mariaId}`).expect(200)).body.notas).toBe('Prefiere turnos a la tarde');
  });

  it('only admin/profesional can delete; delete is soft and frees the DNI', async () => {
    const rec = await as('recA', A);
    await rec.delete(`/pacientes/${mariaId}`).expect(403);
    const prof = await as('profA', A);
    await prof.delete(`/pacientes/${mariaId}`).expect(204);
    await prof.get(`/pacientes/${mariaId}`).expect(404);
    await prof.delete(`/pacientes/${mariaId}`).expect(404);
    const q = await prof.get('/pacientes?q=mar').expect(200);
    expect(q.body.items).toHaveLength(0);
    // The row is still there (never physically deleted).
    const rows = await admin.db.execute(sql.raw(`select deleted_at from pacientes where id = '${mariaId}'`));
    expect(rows[0]!.deleted_at).not.toBeNull();
    await prof.post('/pacientes', { nombre: 'María', apellido: 'Nueva', dni: '12345678' }).expect(201);
  });

  it('writes an audit trail without personal or clinical data', async () => {
    const rows = await admin.db.execute(
      sql.raw(`select accion, entidad, user_id, metadata::text as metadata from audit_log where clinica_id = '${A}' and entidad = 'pacientes'`),
    );
    const actions = new Set(rows.map((r) => r.accion));
    for (const a of ['create', 'update', 'delete', 'view']) expect(actions.has(a)).toBe(true);
    expect(rows.every((r) => r.user_id === profA || r.user_id === recA)).toBe(true);
    const all = JSON.stringify(rows.map((r) => r.metadata));
    expect(all).not.toMatch(/María|Gómez|Penicilina|Hipertensión|12345678|OSDE|Calle Falsa/);
  });
});
