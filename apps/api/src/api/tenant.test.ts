import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@odontotrust/db';
import { createApp } from './app';

const url = process.env.DATABASE_URL_MIGRATIONS;
const SUPABASE_URL = 'https://test.supabase.co';

describe.skipIf(!url)('API auth + tenant resolution', () => {
  const admin = createDb({ url: url!, max: 1 });
  const database = createDb({ url: url!, assumeRole: 'app_user', max: 2 });
  const A = randomUUID();
  const B = randomUUID();
  const userA = randomUUID(); // member of A only
  const userB = randomUUID(); // member of B only
  const userInactive = randomUUID(); // inactive member of A
  let app: ReturnType<typeof createApp>;
  let signer: CryptoKey;

  const token = (sub: string, opts: { aud?: string; iss?: string; key?: CryptoKey } = {}) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(sub)
      .setIssuer(opts.iss ?? `${SUPABASE_URL}/auth/v1`)
      .setAudience(opts.aud ?? 'authenticated')
      .setExpirationTime('5m')
      .sign(opts.key ?? signer);

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    signer = privateKey;
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' }] });
    app = createApp({ env: { CORS_ALLOWED_ORIGINS: 'http://localhost:3000', SUPABASE_URL }, database, jwks });
    await admin.db.execute(
      sql.raw(`
      insert into clinicas (id, nombre) values ('${A}', 'API Clinica A'), ('${B}', 'API Clinica B');
      insert into membresias (clinica_id, user_id, rol) values ('${A}', '${userA}', 'recepcion'), ('${B}', '${userB}', 'admin');
      insert into membresias (clinica_id, user_id, rol, activo) values ('${A}', '${userInactive}', 'admin', false);
    `),
    );
  });

  afterAll(async () => {
    await admin.db.execute(
      sql.raw(`delete from membresias where clinica_id in ('${A}','${B}'); delete from clinicas where id in ('${A}','${B}');`),
    );
    await Promise.all([admin.close(), database.close()]);
  });

  it('401 without token, with garbage, wrong audience/issuer or foreign signing key', async () => {
    await request(app).get('/api/v1/me').expect(401);
    await request(app).get('/api/v1/me').set('Authorization', 'Bearer nope').expect(401);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${await token(userA, { aud: 'anon' })}`).expect(401);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${await token(userA, { iss: 'https://evil/auth/v1' })}`).expect(401);
    const other = await generateKeyPair('ES256');
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${await token(userA, { key: other.privateKey })}`).expect(401);
  });

  it('/me lists only the caller memberships', async () => {
    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${await token(userA)}`).expect(200);
    expect(res.body.clinicas.map((c: { clinicaId: string }) => c.clinicaId)).toEqual([A]);
  });

  it('member reads own clinic', async () => {
    const res = await request(app)
      .get('/api/v1/clinica')
      .set('Authorization', `Bearer ${await token(userA)}`)
      .set('X-Clinica-Id', A)
      .expect(200);
    expect(res.body.id).toBe(A);
  });

  it('403 when the user has no membership in the requested clinic (A -> B)', async () => {
    const res = await request(app)
      .get('/api/v1/clinica')
      .set('Authorization', `Bearer ${await token(userA)}`)
      .set('X-Clinica-Id', B)
      .expect(403);
    expect(res.body).toEqual({ code: 'forbidden', message: 'Not allowed' });
    await request(app)
      .get('/api/v1/clinica')
      .set('Authorization', `Bearer ${await token(userB)}`)
      .set('X-Clinica-Id', A)
      .expect(403);
  });

  it('403 without X-Clinica-Id, with a malformed one, or with an inactive membership', async () => {
    const t = await token(userA);
    await request(app).get('/api/v1/clinica').set('Authorization', `Bearer ${t}`).expect(403);
    await request(app).get('/api/v1/clinica').set('Authorization', `Bearer ${t}`).set('X-Clinica-Id', "x'; drop table").expect(403);
    await request(app)
      .get('/api/v1/clinica')
      .set('Authorization', `Bearer ${await token(userInactive)}`)
      .set('X-Clinica-Id', A)
      .expect(403);
  });
});
