import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@odontotrust/db';
import { DEFAULT_PLANTILLA_RECORDATORIO } from '@odontotrust/shared';
import { createApp } from '../api/app';

const url = process.env.DATABASE_URL_MIGRATIONS;
const SUPABASE_URL = 'https://test.supabase.co';

describe.skipIf(!url)('recordatorios wa.me (real DB)', () => {
  const admin = createDb({ url: url!, max: 1 });
  const database = createDb({ url: url!, assumeRole: 'app_user', max: 3 });
  const A = randomUUID();
  const B = randomUUID();
  const users = { adminA: randomUUID(), recA: randomUUID(), adminB: randomUUID() };
  const prof = randomUUID();
  const pac = { ok: randomUUID(), sinCel: randomUUID(), malCel: randomUUID() };
  const tur = { ok: randomUUID(), sinCel: randomUUID(), malCel: randomUUID(), cancelado: randomUUID(), pasado: randomUUID() };
  let app: ReturnType<typeof createApp>;
  let signer: CryptoKey;

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
    const r = (m: 'get' | 'post' | 'put', path: string) =>
      request(app)[m](`/api/v1${path}`).set('Authorization', auth).set('X-Clinica-Id', clinic);
    return {
      get: (p: string) => r('get', p),
      post: (p: string, body?: object) => r('post', p).send(body),
      put: (p: string, body?: object) => r('put', p).send(body),
    };
  };

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    signer = privateKey;
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' }] });
    app = createApp({ env: { CORS_ALLOWED_ORIGINS: 'http://localhost:3000', SUPABASE_URL }, database, jwks });

    // 2035-01-08 12:30Z = Monday 09:30 in Buenos Aires.
    const at = "'2035-01-08T12:30:00Z', '2035-01-08T13:00:00Z'";
    await admin.db.execute(
      sql.raw(`
      insert into clinicas (id, nombre, configuracion) values ('${A}', 'Recordatorios Test A', '{"otraClave": 1}'::jsonb), ('${B}', 'Recordatorios Test B', '{}'::jsonb);
      insert into membresias (clinica_id, user_id, rol) values
        ('${A}', '${users.adminA}', 'admin'), ('${A}', '${users.recA}', 'recepcion'), ('${B}', '${users.adminB}', 'admin');
      insert into profesionales (id, clinica_id, nombre) values ('${prof}', '${A}', 'Dra. Uno');
      insert into pacientes (id, clinica_id, nombre, apellido, celular) values
        ('${pac.ok}', '${A}', 'Ana', 'Test', '1155551234'),
        ('${pac.sinCel}', '${A}', 'Sin', 'Celular', null),
        ('${pac.malCel}', '${A}', 'Mal', 'Celular', '5555 1234');
      insert into turnos (id, clinica_id, paciente_id, profesional_id, inicio, fin, estado) values
        ('${tur.ok}', '${A}', '${pac.ok}', '${prof}', ${at}, 'pendiente'),
        ('${tur.sinCel}', '${A}', '${pac.sinCel}', '${prof}', '2035-01-09T12:30:00Z', '2035-01-09T13:00:00Z', 'pendiente'),
        ('${tur.malCel}', '${A}', '${pac.malCel}', '${prof}', '2035-01-10T12:30:00Z', '2035-01-10T13:00:00Z', 'pendiente'),
        ('${tur.cancelado}', '${A}', '${pac.ok}', '${prof}', '2035-01-11T12:30:00Z', '2035-01-11T13:00:00Z', 'cancelado'),
        ('${tur.pasado}', '${A}', '${pac.ok}', '${prof}', '2020-01-06T12:30:00Z', '2020-01-06T13:00:00Z', 'pendiente');
    `),
    );
  });

  afterAll(async () => {
    const both = `('${A}','${B}')`;
    await admin.db.execute(
      sql.raw(`
      delete from recordatorios where clinica_id in ${both};
      delete from audit_log where clinica_id in ${both};
      delete from turnos where clinica_id in ${both};
      delete from pacientes where clinica_id in ${both};
      delete from profesionales where clinica_id in ${both};
      delete from membresias where clinica_id in ${both};
      delete from clinicas where id in ${both};
    `),
    );
    await Promise.all([admin.close(), database.close()]);
  });

  it('builds a wa.me link with the normalized number and the default message; logs the attempt', async () => {
    const rec = await as('recA', A);
    const res = await rec.post(`/turnos/${tur.ok}/recordatorio`).expect(201);
    expect(res.body.telefono).toBe('5491155551234');
    expect(res.body.url.startsWith('https://wa.me/5491155551234?text=')).toBe(true);
    expect(decodeURIComponent(res.body.url.split('?text=')[1])).toBe(res.body.mensaje);
    expect(res.body.mensaje).toContain('Hola Ana');
    expect(res.body.mensaje).toContain('Recordatorios Test A');
    expect(res.body.mensaje).toContain('lunes 8 de enero');
    expect(res.body.mensaje).toContain('09:30');
    expect(res.body.mensaje).toContain('Dra. Uno');

    const list = await rec.get(`/turnos/${tur.ok}/recordatorios`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ canal: 'whatsapp_link', estado: 'abierto' });
    await rec.post(`/turnos/${tur.ok}/recordatorio`).expect(201); // resending is allowed and logged again
    expect((await rec.get(`/turnos/${tur.ok}/recordatorios`).expect(200)).body).toHaveLength(2);
  });

  it('refuses when there is nothing reliable to send', async () => {
    const rec = await as('recA', A);
    expect((await rec.post(`/turnos/${tur.sinCel}/recordatorio`).expect(400)).body.code).toBe('sin_celular');
    expect((await rec.post(`/turnos/${tur.malCel}/recordatorio`).expect(400)).body.code).toBe('celular_invalido');
    expect((await rec.post(`/turnos/${tur.cancelado}/recordatorio`).expect(409)).body.code).toBe('turno_no_recordable');
    expect((await rec.post(`/turnos/${tur.pasado}/recordatorio`).expect(409)).body.code).toBe('turno_no_recordable');
    await rec.post(`/turnos/${randomUUID()}/recordatorio`).expect(404);
    await rec.post('/turnos/nope/recordatorio').expect(404);
    const none = await rec.get(`/turnos/${tur.sinCel}/recordatorios`).expect(200);
    expect(none.body).toEqual([]); // failed attempts are not logged as sent
  });

  it('template: everyone reads it, only admin edits, unknown variables are rejected', async () => {
    const rec = await as('recA', A);
    const current = await rec.get('/configuracion/recordatorios').expect(200);
    expect(current.body.plantilla).toBe(DEFAULT_PLANTILLA_RECORDATORIO);
    expect(current.body.variables).toContain('paciente');
    await rec.put('/configuracion/recordatorios', { plantilla: 'Hola {paciente}, tu turno es mañana.' }).expect(403);

    const adm = await as('adminA', A);
    await adm.put('/configuracion/recordatorios', { plantilla: 'Hola {nombre}, tu turno es mañana.' }).expect(400);
    await adm.put('/configuracion/recordatorios', { plantilla: 'corto' }).expect(400);
    await adm.put('/configuracion/recordatorios', { plantilla: 'Hola {paciente}, te esperamos el {fecha} a las {hora}.', extra: 1 }).expect(400);
    await adm.put('/configuracion/recordatorios', { plantilla: 'Hola {paciente}, te esperamos el {fecha} a las {hora}.' }).expect(200);

    const link = await rec.post(`/turnos/${tur.ok}/recordatorio`).expect(201);
    expect(link.body.mensaje).toBe('Hola Ana, te esperamos el lunes 8 de enero a las 09:30.');

    // Saving the template does not wipe other clinic settings.
    const rows = await admin.db.execute(sql.raw(`select configuracion from clinicas where id = '${A}'`));
    expect(rows[0]!.configuracion).toMatchObject({ otraClave: 1, plantillaRecordatorio: expect.any(String) });
  });

  it('isolates clinics: B cannot send, list or read A template', async () => {
    const b = await as('adminB', B);
    await b.post(`/turnos/${tur.ok}/recordatorio`).expect(404);
    await b.get(`/turnos/${tur.ok}/recordatorios`).expect(404);
    expect((await b.get('/configuracion/recordatorios').expect(200)).body.plantilla).toBe(DEFAULT_PLANTILLA_RECORDATORIO);
    const asA = await as('adminA', B); // A admin has no membership in B
    await asA.get('/configuracion/recordatorios').expect(403);
  });

  it('stores no message text or phone number, and audits without personal data', async () => {
    const rows = await admin.db.execute(
      sql.raw(`select to_jsonb(r)::text as row from recordatorios r where clinica_id = '${A}'`),
    );
    expect(rows.length).toBeGreaterThan(0);
    const audit = await admin.db.execute(
      sql.raw(`select metadata::text as m from audit_log where clinica_id = '${A}' and entidad in ('recordatorios','clinicas')`),
    );
    const all = JSON.stringify([...rows.map((r) => r.row), ...audit.map((r) => r.m)]);
    expect(all).not.toMatch(/Hola|Ana|1155551234|Dra\. Uno|te esperamos/);
    expect(audit.length).toBeGreaterThan(0);
  });
});
