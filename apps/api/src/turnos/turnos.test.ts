import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@odontotrust/db';
import { isoWeekdayOf, zonedToUtc } from '@odontotrust/shared';
import { createApp } from '../api/app';

const url = process.env.DATABASE_URL_MIGRATIONS;
const SUPABASE_URL = 'https://test.supabase.co';
const TZ = 'America/Argentina/Buenos_Aires';

// First Monday of 2035, so every test date is in the future and the weekday is known.
let monday = 1;
while (isoWeekdayOf(2035, 1, monday) !== 1) monday++;
/** Local (Buenos Aires) wall-clock -> ISO UTC. `dayOffset` 0 = Monday, 6 = Sunday. */
const at = (dayOffset: number, h: number, m = 0) => zonedToUtc(2035, 1, monday + dayOffset, h, m, TZ).toISOString();

describe.skipIf(!url)('agenda API: turnos, bloqueos, catalog (real DB)', () => {
  const admin = createDb({ url: url!, max: 1 });
  const database = createDb({ url: url!, assumeRole: 'app_user', max: 6 });
  const A = randomUUID();
  const B = randomUUID();
  const users = { adminA: randomUUID(), recA: randomUUID(), profA: randomUUID(), adminB: randomUUID() };
  const P1 = randomUUID(); // Mon-Fri 09-13 / 14-18, linked to profA
  const P2 = randomUUID(); // no working hours configured
  const PB = randomUUID(); // professional of clinic B
  const S1 = randomUUID();
  const S2 = randomUUID();
  const pacientes = { ana: randomUUID(), beto: randomUUID(), borrado: randomUUID(), deB: randomUUID() };
  const horarios = JSON.stringify(
    Object.fromEntries(['1', '2', '3', '4', '5'].map((d) => [d, [['09:00', '13:00'], ['14:00', '18:00']]])),
  );
  let app: ReturnType<typeof createApp>;
  let signer: CryptoKey;
  let tipo30: string;

  const token = (sub: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(sub)
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(signer);

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

  const turno = (over: Record<string, unknown> = {}) => ({
    pacienteId: pacientes.ana,
    profesionalId: P1,
    inicio: at(0, 10),
    fin: at(0, 10, 30),
    ...over,
  });

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    signer = privateKey;
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' }] });
    app = createApp({ env: { CORS_ALLOWED_ORIGINS: 'http://localhost:3000', SUPABASE_URL }, database, jwks });

    const membProf = randomUUID();
    const sede = randomUUID();
    const sedeB = randomUUID();
    await admin.db.execute(
      sql.raw(`
      insert into clinicas (id, nombre) values ('${A}', 'Agenda Test A'), ('${B}', 'Agenda Test B');
      insert into membresias (id, clinica_id, user_id, rol) values
        (gen_random_uuid(), '${A}', '${users.adminA}', 'admin'),
        (gen_random_uuid(), '${A}', '${users.recA}', 'recepcion'),
        ('${membProf}', '${A}', '${users.profA}', 'profesional'),
        (gen_random_uuid(), '${B}', '${users.adminB}', 'admin');
      insert into profesionales (id, clinica_id, membresia_id, nombre, color, horarios) values
        ('${P1}', '${A}', '${membProf}', 'Dra. Uno', '#0ea5e9', '${horarios}'::jsonb);
      insert into profesionales (id, clinica_id, nombre) values ('${P2}', '${A}', 'Dr. Dos');
      insert into profesionales (id, clinica_id, nombre) values ('${PB}', '${B}', 'Dr. B');
      insert into sedes (id, clinica_id, nombre) values ('${sede}', '${A}', 'Sede'), ('${sedeB}', '${B}', 'Sede B');
      insert into sillones (id, clinica_id, sede_id, nombre) values ('${S1}', '${A}', '${sede}', 'Sillón 1'), ('${S2}', '${A}', '${sede}', 'Sillón 2');
      insert into pacientes (id, clinica_id, nombre, apellido) values
        ('${pacientes.ana}', '${A}', 'Ana', 'Test'), ('${pacientes.beto}', '${A}', 'Beto', 'Test'),
        ('${pacientes.deB}', '${B}', 'Otro', 'Clinica B');
      insert into pacientes (id, clinica_id, nombre, apellido, deleted_at) values ('${pacientes.borrado}', '${A}', 'Borrado', 'Test', now());
    `),
    );
  });

  afterAll(async () => {
    const both = `('${A}','${B}')`;
    await admin.db.execute(
      sql.raw(`
      delete from audit_log where clinica_id in ${both};
      delete from turnos where clinica_id in ${both};
      delete from bloqueos where clinica_id in ${both};
      delete from tipos_tratamiento where clinica_id in ${both};
      delete from sillones where clinica_id in ${both};
      delete from sedes where clinica_id in ${both};
      delete from pacientes where clinica_id in ${both};
      delete from profesionales where clinica_id in ${both};
      delete from membresias where clinica_id in ${both};
      delete from clinicas where id in ${both};
    `),
    );
    await Promise.all([admin.close(), database.close()]);
  });

  it('catalog: admin configures treatment types; recepcion reads but cannot write', async () => {
    const rec = await as('recA', A);
    await rec.post('/tipos-tratamiento', { nombre: 'X', duracionMinutos: 30 }).expect(403);
    await rec.post('/sillones', { nombre: 'X' }).expect(403);
    const adm = await as('adminA', A);
    const created = await adm.post('/tipos-tratamiento', { nombre: 'Consulta', duracionMinutos: 30 }).expect(201);
    tipo30 = created.body.id;
    await adm.post('/tipos-tratamiento', { nombre: 'Malo', duracionMinutos: 1 }).expect(400);
    const updated = await adm.patch(`/tipos-tratamiento/${tipo30}`, { duracionMinutos: 30, activo: true }).expect(200);
    expect(updated.body.duracionMinutos).toBe(30);
    const list = await rec.get('/tipos-tratamiento').expect(200);
    expect(list.body.map((t: { nombre: string }) => t.nombre)).toContain('Consulta');
  });

  it('catalog: professionals list flags the logged-in one; admin edits working hours', async () => {
    const prof = await as('profA', A);
    const list = await prof.get('/profesionales').expect(200);
    expect(list.body.find((p: { id: string }) => p.id === P1).esYo).toBe(true);
    expect(list.body.find((p: { id: string }) => p.id === P2).esYo).toBe(false);
    const adm = await as('adminA', A);
    await adm.patch(`/profesionales/${P2}`, { horarios: { '1': [['13:00', '09:00']] } }).expect(400);
    const ok = await adm.patch(`/profesionales/${P2}`, { color: '#22c55e' }).expect(200);
    expect(ok.body.color).toBe('#22c55e');
    await prof.patch(`/profesionales/${P2}`, { color: '#000000' }).expect(403);
  });

  it('catalog: adding a chair creates the default sede on demand', async () => {
    const adm = await as('adminB', B);
    const before = await adm.get('/sillones').expect(200);
    expect(before.body).toEqual([]);
    const created = await adm.post('/sillones', { nombre: 'Sillón B' }).expect(201);
    expect(created.body.nombre).toBe('Sillón B');
  });

  it('creates a turno; end defaults to the treatment duration; response is enriched', async () => {
    const rec = await as('recA', A);
    const res = await rec
      .post('/turnos', { pacienteId: pacientes.ana, profesionalId: P1, sillonId: S1, tipoTratamientoId: tipo30, inicio: at(0, 9) })
      .expect(201);
    expect(res.body.fin).toBe(at(0, 9, 30));
    expect(res.body).toMatchObject({
      estado: 'pendiente',
      paciente: { nombre: 'Ana' },
      profesional: { nombre: 'Dra. Uno', color: '#0ea5e9' },
      sillon: { nombre: 'Sillón 1' },
      tipoTratamiento: { nombre: 'Consulta' },
    });
  });

  it('rejects overlaps per professional and per chair; back-to-back is fine', async () => {
    const rec = await as('recA', A);
    const dup = await rec.post('/turnos', turno({ inicio: at(0, 9, 15), fin: at(0, 9, 45) })).expect(409);
    expect(dup.body.code).toBe('turno_solapado_profesional');
    // Same chair, other professional (P2 has no hours configured).
    const chair = await rec
      .post('/turnos', turno({ profesionalId: P2, sillonId: S1, inicio: at(0, 9, 10), fin: at(0, 9, 20) }))
      .expect(409);
    expect(chair.body.code).toBe('turno_solapado_sillon');
    await rec.post('/turnos', turno({ inicio: at(0, 9, 30), fin: at(0, 10) })).expect(201); // starts when the other ends
    await rec.post('/turnos', turno({ profesionalId: P2, inicio: at(0, 9), fin: at(0, 9, 30) })).expect(201); // other professional
  });

  it('concurrent requests for the same slot: exactly one wins', async () => {
    const rec = await as('recA', A);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => rec.post('/turnos', turno({ inicio: at(1, 10), fin: at(1, 10, 30) }))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
    const list = await rec.get(`/turnos?desde=${at(1, 0)}&hasta=${at(1, 23)}&profesionalId=${P1}`).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('blocks: always reject (even as sobreturno); clinic-wide blocks apply to everyone; deleting frees the slot', async () => {
    const rec = await as('recA', A);
    const lunch = await rec.post('/bloqueos', { profesionalId: P1, inicio: at(2, 12), fin: at(2, 13), motivo: 'Almuerzo' }).expect(201);
    const blocked = await rec.post('/turnos', turno({ inicio: at(2, 12, 30), fin: at(2, 12, 45) })).expect(409);
    expect(blocked.body.code).toBe('bloqueado');
    await rec.post('/turnos', turno({ inicio: at(2, 12, 30), fin: at(2, 12, 45), sobreturno: true })).expect(409);
    // Another professional is not affected by P1's block...
    await rec.post('/turnos', turno({ profesionalId: P2, inicio: at(2, 12, 30), fin: at(2, 12, 45) })).expect(201);
    // ...but a clinic-wide block (no professional) is.
    await rec.post('/bloqueos', { inicio: at(2, 15), fin: at(2, 16), motivo: 'Congreso' }).expect(201);
    await rec.post('/turnos', turno({ profesionalId: P2, inicio: at(2, 15, 10), fin: at(2, 15, 30) })).expect(409);
    await rec.delete(`/bloqueos/${lunch.body.id}`).expect(204);
    await rec.post('/turnos', turno({ inicio: at(2, 12, 30), fin: at(2, 12, 45) })).expect(201);
    const list = await rec.get(`/bloqueos?desde=${at(2, 0)}&hasta=${at(2, 23)}`).expect(200);
    expect(list.body).toHaveLength(1); // the clinic-wide one; the lunch block was soft-deleted
  });

  it('working hours: reject outside them unless sobreturno; days off; unconfigured professional is free', async () => {
    const rec = await as('recA', A);
    const early = await rec.post('/turnos', turno({ inicio: at(3, 8), fin: at(3, 8, 30) })).expect(409);
    expect(early.body.code).toBe('fuera_de_horario');
    await rec.post('/turnos', turno({ inicio: at(3, 8), fin: at(3, 8, 30), sobreturno: true })).expect(201);
    await rec.post('/turnos', turno({ inicio: at(3, 12, 45), fin: at(3, 13, 15) })).expect(409); // crosses closing time
    const sunday = await rec.post('/turnos', turno({ inicio: at(6, 10), fin: at(6, 10, 30) })).expect(409);
    expect(sunday.body.code).toBe('fuera_de_horario');
    await rec.post('/turnos', turno({ profesionalId: P2, inicio: at(6, 10), fin: at(6, 10, 30) })).expect(201);
  });

  it('moves a turno (drag & drop): keeps duration, respects conflicts, leaves the original untouched on failure', async () => {
    const rec = await as('recA', A);
    const created = await rec.post('/turnos', turno({ inicio: at(4, 9), fin: at(4, 9, 45) })).expect(201);
    const moved = await rec.patch(`/turnos/${created.body.id}`, { inicio: at(4, 11) }).expect(200);
    expect(moved.body.inicio).toBe(at(4, 11));
    expect(moved.body.fin).toBe(at(4, 11, 45)); // duration preserved
    await rec.post('/turnos', turno({ inicio: at(4, 15), fin: at(4, 15, 30) })).expect(201);
    const clash = await rec.patch(`/turnos/${created.body.id}`, { inicio: at(4, 15, 15), fin: at(4, 16) }).expect(409);
    expect(clash.body.code).toBe('turno_solapado_profesional');
    const after = await rec.get(`/turnos/${created.body.id}`).expect(200);
    expect(after.body.inicio).toBe(at(4, 11)); // unchanged
    // Move to another professional (day column change in the UI).
    const other = await rec.patch(`/turnos/${created.body.id}`, { profesionalId: P2 }).expect(200);
    expect(other.body.profesional.nombre).toBe('Dr. Dos');
    await rec.patch(`/turnos/${created.body.id}`, { inicio: at(4, 7), fin: at(4, 7, 30) }).expect(200); // P2: no hours
    await rec.patch(`/turnos/${created.body.id}`, { profesionalId: P1 }).expect(409); // P1 works from 9: fuera_de_horario
  });

  it('states: cancel frees the slot; reactivating onto a taken slot conflicts', async () => {
    const rec = await as('recA', A);
    const first = await rec.post('/turnos', turno({ inicio: at(4, 16), fin: at(4, 16, 30) })).expect(201);
    await rec.patch(`/turnos/${first.body.id}`, { estado: 'confirmado' }).expect(200);
    await rec.patch(`/turnos/${first.body.id}`, { estado: 'cancelado' }).expect(200);
    await rec.post('/turnos', turno({ pacienteId: pacientes.beto, inicio: at(4, 16), fin: at(4, 16, 30) })).expect(201);
    await rec.patch(`/turnos/${first.body.id}`, { estado: 'pendiente' }).expect(409);
    await rec.patch(`/turnos/${first.body.id}`, { estado: 'inventado' }).expect(400);
  });

  it('validates references and input', async () => {
    const rec = await as('recA', A);
    for (const bad of [
      { pacienteId: pacientes.deB }, // patient of another clinic
      { pacienteId: pacientes.borrado }, // soft-deleted patient
      { profesionalId: PB }, // professional of another clinic
      { sillonId: randomUUID() },
      { tipoTratamientoId: randomUUID() },
    ]) {
      const res = await rec.post('/turnos', turno({ inicio: at(3, 15), fin: at(3, 15, 30), ...bad })).expect(400);
      expect(res.body.code).toBe('referencia_invalida');
    }
    await rec.post('/turnos', turno({ fin: at(0, 9) })).expect(400); // ends before it starts
    await rec.post('/turnos', turno({ inicio: at(3, 9), fin: at(3, 19) })).expect(400); // longer than 8h
    await rec.post('/turnos', { pacienteId: pacientes.ana, profesionalId: P1, inicio: 'mañana' }).expect(400);
    await rec.get('/turnos').expect(400); // range required
    await rec.get(`/turnos?desde=${at(0, 0)}&hasta=2036-12-31T00:00:00Z`).expect(400); // > 62 days
    await rec.get('/turnos/nope').expect(404);
  });

  it('lists a range, optionally by professional', async () => {
    const rec = await as('recA', A);
    const all = await rec.get(`/turnos?desde=${at(0, 0)}&hasta=${at(0, 23)}`).expect(200);
    const p2 = await rec.get(`/turnos?desde=${at(0, 0)}&hasta=${at(0, 23)}&profesionalId=${P2}`).expect(200);
    expect(all.body.length).toBeGreaterThan(p2.body.length);
    expect(p2.body.every((t: { profesional: { id: string } }) => t.profesional.id === P2)).toBe(true);
    const times = all.body.map((t: { inicio: string }) => t.inicio);
    expect(times).toEqual([...times].sort());
  });

  it('isolates clinics: B cannot see or touch A turnos, bloqueos or catalog', async () => {
    const adm = await as('adminA', A);
    const t = await adm.get(`/turnos?desde=${at(0, 0)}&hasta=${at(0, 23)}`).expect(200);
    const turnoId = t.body[0].id;
    const b = await as('adminB', B);
    await b.get(`/turnos/${turnoId}`).expect(404);
    await b.patch(`/turnos/${turnoId}`, { estado: 'cancelado' }).expect(404);
    expect((await b.get(`/turnos?desde=${at(0, 0)}&hasta=${at(0, 23)}`).expect(200)).body).toEqual([]);
    expect((await b.get(`/bloqueos?desde=${at(0, 0)}&hasta=${at(6, 23)}`).expect(200)).body).toEqual([]);
    expect((await b.get('/tipos-tratamiento').expect(200)).body).toEqual([]);
    expect((await b.get('/profesionales').expect(200)).body.map((p: { id: string }) => p.id)).toEqual([PB]);
    // B admin cannot book A's professional or patient.
    await b.post('/turnos', { pacienteId: pacientes.deB, profesionalId: P1, inicio: at(0, 10), fin: at(0, 10, 30) }).expect(400);
    await b.patch(`/tipos-tratamiento/${tipo30}`, { nombre: 'hack' }).expect(404);
    // A member of A cannot use B as clinic.
    const asA = await as('adminA', B);
    await asA.get('/turnos?desde=x').expect(403);
  });

  it('writes an audit trail without notes or personal data', async () => {
    const rec = await as('recA', A);
    await rec.post('/turnos', turno({ inicio: at(3, 16), fin: at(3, 16, 30), notas: 'SECRETO-CLINICO' })).expect(201);
    const rows = await admin.db.execute(
      sql.raw(`select accion, entidad, metadata::text as metadata from audit_log where clinica_id = '${A}' and entidad in ('turnos','bloqueos','tipos_tratamiento','profesionales')`),
    );
    const actions = new Set(rows.map((r) => `${r.entidad}:${r.accion}`));
    for (const a of ['turnos:create', 'turnos:update', 'bloqueos:create', 'bloqueos:delete', 'tipos_tratamiento:create']) {
      expect(actions.has(a)).toBe(true);
    }
    expect(JSON.stringify(rows.map((r) => r.metadata))).not.toMatch(/SECRETO|Ana|Test/);
  });
});
