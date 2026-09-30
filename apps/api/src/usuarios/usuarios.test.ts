import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@odontotrust/db';
import { createApp } from '../api/app';
import type { AuthAdmin, EmailSender, InviteResult } from './ports';

const url = process.env.DATABASE_URL_MIGRATIONS;
const SUPABASE_URL = 'https://test.supabase.co';
const WEB_URL = 'https://app.example.test';

// In-memory stand-ins: nothing real (Supabase Auth, email provider) is contacted.
class FakeAuthAdmin implements AuthAdmin {
  users = new Map<string, { id: string; email: string; signedIn: boolean }>();
  add(email: string, signedIn = true) {
    const id = randomUUID();
    this.users.set(id, { id, email, signedIn });
    return id;
  }
  async invite(email: string): Promise<InviteResult> {
    const existing = [...this.users.values()].find((u) => u.email === email);
    if (existing) return { existed: true, userId: existing.id };
    const id = this.add(email, false);
    return { existed: false, userId: id, hashedToken: `tok-${id}` };
  }
  async recoveryToken(email: string) {
    return `rec-${email}`;
  }
  async getUser(id: string) {
    const u = this.users.get(id);
    return u ? { id: u.id, email: u.email, signedInBefore: u.signedIn } : null;
  }
}

class FakeEmail implements EmailSender {
  readonly configured = true;
  sent: { to: string; subject: string; text: string }[] = [];
  async send(msg: { to: string; subject: string; text: string }) {
    this.sent.push(msg);
    return true;
  }
}

describe.skipIf(!url)('user management API (real DB, fake Auth/email)', () => {
  const admin = createDb({ url: url!, max: 1 });
  const database = createDb({ url: url!, assumeRole: 'app_user', max: 4 });
  const auth = new FakeAuthAdmin();
  const email = new FakeEmail();
  const A = randomUUID();
  const B = randomUUID();
  const C = randomUUID(); // clinic used for the "last admin" rules
  const ids = {
    adminA: auth.add('admin-a@x.test'),
    recA: auth.add('rec-a@x.test'),
    profA: auth.add('prof-a@x.test'),
    legacyA: auth.add('legacy-a@x.test'), // membership without stored email
    adminB: auth.add('admin-b@x.test'),
    c1: auth.add('c1@x.test'),
    c2: auth.add('c2@x.test'),
  };
  const P_LINKED = randomUUID();
  const P_FREE = randomUUID();
  let app: ReturnType<typeof createApp>;
  let appNoAuth: ReturnType<typeof createApp>;
  let signer: CryptoKey;

  const token = (sub: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(sub)
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(signer);

  const as = async (userId: string, clinic: string, target = app) => {
    const auth = `Bearer ${await token(userId)}`;
    const r = (m: 'get' | 'post' | 'patch', path: string) =>
      request(target)[m](`/api/v1${path}`).set('Authorization', auth).set('X-Clinica-Id', clinic);
    return {
      get: (p: string) => r('get', p),
      post: (p: string, body?: object) => r('post', p).send(body),
      patch: (p: string, body?: object) => r('patch', p).send(body),
    };
  };
  const q = (s: string) => admin.db.execute(sql.raw(s));

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    signer = privateKey;
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' }] });
    const base = { env: { CORS_ALLOWED_ORIGINS: 'http://localhost:3000', SUPABASE_URL }, database, jwks };
    app = createApp({ ...base, authAdmin: auth, email, webUrl: WEB_URL });
    appNoAuth = createApp(base); // no service key configured

    const mProf = randomUUID();
    await q(`
      insert into clinicas (id, nombre) values ('${A}', 'Usuarios Test A'), ('${B}', 'Usuarios Test B'), ('${C}', 'Usuarios Test C');
      insert into membresias (id, clinica_id, user_id, rol, email, nombre) values
        (gen_random_uuid(), '${A}', '${ids.adminA}', 'admin', 'admin-a@x.test', 'Admin A'),
        (gen_random_uuid(), '${A}', '${ids.recA}', 'recepcion', 'rec-a@x.test', 'Rec A'),
        ('${mProf}', '${A}', '${ids.profA}', 'profesional', 'prof-a@x.test', 'Prof A'),
        (gen_random_uuid(), '${A}', '${ids.legacyA}', 'recepcion', null, null),
        (gen_random_uuid(), '${B}', '${ids.adminB}', 'admin', 'admin-b@x.test', 'Admin B'),
        (gen_random_uuid(), '${C}', '${ids.c1}', 'admin', 'c1@x.test', 'C1'),
        (gen_random_uuid(), '${C}', '${ids.c2}', 'admin', 'c2@x.test', 'C2');
      insert into profesionales (id, clinica_id, membresia_id, nombre) values ('${P_LINKED}', '${A}', '${mProf}', 'Prof A');
      insert into profesionales (id, clinica_id, nombre) values ('${P_FREE}', '${A}', 'Sin usuario');
    `);
  });

  afterAll(async () => {
    const all = `('${A}','${B}','${C}')`;
    await q(`
      delete from audit_log where clinica_id in ${all};
      delete from profesionales where clinica_id in ${all};
      delete from membresias where clinica_id in ${all};
      delete from clinicas where id in ${all};
    `);
    await Promise.all([admin.close(), database.close()]);
  });

  it('is admin-only and requires authentication', async () => {
    await request(app).get('/api/v1/usuarios').expect(401);
    for (const who of [ids.recA, ids.profA]) {
      const c = await as(who, A);
      await c.get('/usuarios').expect(403);
      await c.post('/usuarios/invitar', { email: 'x@x.test', rol: 'recepcion' }).expect(403);
      await c.patch(`/usuarios/${randomUUID()}`, { activo: false }).expect(403);
      await c.post(`/usuarios/${randomUUID()}/reenviar-invitacion`).expect(403);
    }
  });

  it('lists the clinic members, filling missing emails from Auth and flagging pending invites', async () => {
    const adm = await as(ids.adminA, A);
    const res = await adm.get('/usuarios').expect(200);
    const byEmail = new Map(res.body.map((u: { email: string }) => [u.email, u]));
    expect(byEmail.get('admin-a@x.test')).toMatchObject({ rol: 'admin', esYo: true, activo: true, pendiente: false });
    expect(byEmail.get('rec-a@x.test')).toMatchObject({ esYo: false });
    expect(byEmail.get('legacy-a@x.test')).toBeTruthy(); // email came from Auth
    expect(res.body).toHaveLength(4);
    expect(res.body.some((u: { email: string }) => u.email === 'admin-b@x.test')).toBe(false); // other clinic
  });

  it('invites a new user: creates the membership, returns a one-time link, sends the email, and the invitee can enter', async () => {
    const adm = await as(ids.adminA, A);
    const res = await adm.post('/usuarios/invitar', { email: '  Nueva.Persona@X.test ', rol: 'recepcion', nombre: 'Nueva' }).expect(201);
    expect(res.body.usuario).toMatchObject({ email: 'nueva.persona@x.test', rol: 'recepcion', nombre: 'Nueva', pendiente: true });
    expect(res.body.invitacion).toMatchObject({ cuentaExistente: false, enviadoPorEmail: true });
    expect(res.body.invitacion.link).toMatch(new RegExp(`^${WEB_URL}/auth/confirm\\?token_hash=tok-[0-9a-f-]+&type=invite$`));
    expect(email.sent.at(-1)).toMatchObject({ to: 'nueva.persona@x.test' });
    expect(email.sent.at(-1)!.text).toContain(res.body.invitacion.link);
    expect(email.sent.at(-1)!.subject).toContain('Usuarios Test A');

    // The new account can use the clinic right away (its membership is active).
    const newUserId = [...auth.users.values()].find((u) => u.email === 'nueva.persona@x.test')!.id;
    const asNew = await as(newUserId, A);
    await asNew.get('/clinica').expect(200);
    await asNew.get('/usuarios').expect(403); // recepcion
  });

  it('rejects inviting someone already in the clinic (any letter case)', async () => {
    const adm = await as(ids.adminA, A);
    const dup = await adm.post('/usuarios/invitar', { email: 'REC-A@x.test', rol: 'admin' }).expect(409);
    expect(dup.body.code).toBe('ya_es_miembro');
    await adm.post('/usuarios/invitar', { email: 'legacy-a@x.test', rol: 'admin' }).expect(409); // membership without stored email
  });

  it('validates the invitation input', async () => {
    const adm = await as(ids.adminA, A);
    await adm.post('/usuarios/invitar', { email: 'no-es-un-email', rol: 'admin' }).expect(400);
    await adm.post('/usuarios/invitar', { email: 'a@x.test', rol: 'superadmin' }).expect(400);
    await adm.post('/usuarios/invitar', { email: 'a@x.test', rol: 'profesional' }).expect(400); // needs a name
    await adm.post('/usuarios/invitar', { email: 'a@x.test', rol: 'admin', extra: 1 }).expect(400);
  });

  it('profesional invites create or link the agenda professional', async () => {
    const adm = await as(ids.adminA, A);
    const created = await adm.post('/usuarios/invitar', { email: 'dra.nueva@x.test', rol: 'profesional', nombre: 'Dra. Nueva' }).expect(201);
    let rows = await q(`select p.nombre from profesionales p join membresias m on m.id = p.membresia_id where m.id = '${created.body.usuario.id}'`);
    expect(rows.map((r) => r.nombre)).toEqual(['Dra. Nueva']);

    await adm.post('/usuarios/invitar', { email: 'link@x.test', rol: 'profesional', profesionalId: P_FREE }).expect(201);
    rows = await q(`select membresia_id from profesionales where id = '${P_FREE}'`);
    expect(rows[0]!.membresia_id).not.toBeNull();

    const taken = await adm.post('/usuarios/invitar', { email: 'otro@x.test', rol: 'profesional', profesionalId: P_LINKED }).expect(409);
    expect(taken.body.code).toBe('profesional_ya_vinculado');
    await adm.post('/usuarios/invitar', { email: 'otro2@x.test', rol: 'profesional', profesionalId: randomUUID() }).expect(400);
  });

  it('an account that already exists (other clinic) just gets a membership, no link; it then belongs to both clinics', async () => {
    const adm = await as(ids.adminA, A);
    const res = await adm.post('/usuarios/invitar', { email: 'admin-b@x.test', rol: 'recepcion', nombre: 'Compartido' }).expect(201);
    expect(res.body.invitacion).toEqual({ link: null, enviadoPorEmail: false, cuentaExistente: true });
    const asB = await as(ids.adminB, B);
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${await token(ids.adminB)}`).expect(200);
    expect(me.body.clinicas.map((c: { nombre: string }) => c.nombre).sort()).toEqual(['Usuarios Test A', 'Usuarios Test B']);
    await asB.get('/usuarios').expect(200); // still admin in B, only recepcion in A
    await (await as(ids.adminB, A)).get('/usuarios').expect(403);
  });

  it('updates role and name; becoming a professional creates the agenda entry', async () => {
    const adm = await as(ids.adminA, A);
    const list = await adm.get('/usuarios').expect(200);
    const rec = list.body.find((u: { email: string }) => u.email === 'rec-a@x.test');
    const res = await adm.patch(`/usuarios/${rec.id}`, { rol: 'profesional', nombre: 'Rec Ahora Prof' }).expect(200);
    expect(res.body).toMatchObject({ rol: 'profesional', nombre: 'Rec Ahora Prof' });
    const rows = await q(`select nombre from profesionales where membresia_id = '${rec.id}'`);
    expect(rows.map((r) => r.nombre)).toEqual(['Rec Ahora Prof']);
    await adm.patch(`/usuarios/${rec.id}`, {}).expect(400);
    await adm.patch(`/usuarios/${rec.id}`, { rol: 'dios' }).expect(400);
    await adm.patch('/usuarios/not-a-uuid', { activo: false }).expect(404);
    await adm.patch(`/usuarios/${randomUUID()}`, { activo: false }).expect(404);
  });

  it('deactivating cuts access immediately (and hides the clinic); reactivating restores it', async () => {
    const adm = await as(ids.adminA, A);
    const list = await adm.get('/usuarios').expect(200);
    const target = list.body.find((u: { email: string }) => u.email === 'legacy-a@x.test');
    const asTarget = await as(ids.legacyA, A);
    await asTarget.get('/clinica').expect(200);

    await adm.patch(`/usuarios/${target.id}`, { activo: false }).expect(200);
    await asTarget.get('/clinica').expect(403);
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${await token(ids.legacyA)}`).expect(200);
    expect(me.body.clinicas).toEqual([]);

    await adm.patch(`/usuarios/${target.id}`, { activo: true }).expect(200);
    await asTarget.get('/clinica').expect(200);
  });

  it('never leaves a clinic without an active admin, even with concurrent demotions', async () => {
    const c1 = await as(ids.c1, C);
    const c2 = await as(ids.c2, C);
    const list = await c1.get('/usuarios').expect(200);
    const m1 = list.body.find((u: { email: string }) => u.email === 'c1@x.test').id;
    const m2 = list.body.find((u: { email: string }) => u.email === 'c2@x.test').id;

    // Each admin tries to demote the other at the same time: at most one may succeed.
    const results = await Promise.all([c1.patch(`/usuarios/${m2}`, { rol: 'recepcion' }), c2.patch(`/usuarios/${m1}`, { rol: 'recepcion' })]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const admins = await q(`select count(*)::int as n from membresias where clinica_id = '${C}' and rol = 'admin' and activo`);
    expect(admins[0]!.n).toBe(1);

    // The remaining admin can neither demote nor deactivate themselves.
    // results[0] = c1 demoting c2. If it won, c1 is the admin left; otherwise c2 demoted c1.
    const survivorIsC1 = results[0]!.status === 200;
    const survivor = survivorIsC1 ? c1 : c2;
    const survivorId = survivorIsC1 ? m1 : m2;
    expect((await survivor.patch(`/usuarios/${survivorId}`, { rol: 'recepcion' }).expect(409)).body.code).toBe('ultimo_admin');
    expect((await survivor.patch(`/usuarios/${survivorId}`, { activo: false }).expect(409)).body.code).toBe('ultimo_admin');
  });

  it('isolates clinics: B cannot list, edit or resend for A members', async () => {
    const b = await as(ids.adminB, B);
    const listA = await (await as(ids.adminA, A)).get('/usuarios').expect(200);
    const anyA = listA.body[0].id;
    await b.patch(`/usuarios/${anyA}`, { activo: false }).expect(404);
    await b.post(`/usuarios/${anyA}/reenviar-invitacion`).expect(404);
    const listB = await b.get('/usuarios').expect(200);
    expect(listB.body.map((u: { email: string }) => u.email)).toEqual(['admin-b@x.test']);
    await (await as(ids.adminA, B)).get('/usuarios').expect(403); // no membership in B
  });

  it('resends a link only to people who never signed in (no account takeover)', async () => {
    const adm = await as(ids.adminA, A);
    const invited = await adm.post('/usuarios/invitar', { email: 'pendiente@x.test', rol: 'recepcion' }).expect(201);
    const res = await adm.post(`/usuarios/${invited.body.usuario.id}/reenviar-invitacion`).expect(200);
    expect(res.body.invitacion.link).toBe(`${WEB_URL}/auth/confirm?token_hash=rec-pendiente%40x.test&type=recovery`);

    // Once the invitee signs in, the admin can no longer mint links for that account.
    const userId = [...auth.users.values()].find((u) => u.email === 'pendiente@x.test')!.id;
    auth.users.get(userId)!.signedIn = true;
    const denied = await adm.post(`/usuarios/${invited.body.usuario.id}/reenviar-invitacion`).expect(409);
    expect(denied.body.code).toBe('cuenta_activa');
    const other = (await adm.get('/usuarios').expect(200)).body.find((u: { email: string }) => u.email === 'admin-a@x.test');
    await adm.post(`/usuarios/${other.id}/reenviar-invitacion`).expect(409); // an active admin, also refused
  });

  it('answers 503 for invites when the service key is not configured; listing still works', async () => {
    const adm = await as(ids.adminA, A, appNoAuth);
    const res = await adm.post('/usuarios/invitar', { email: 'z@x.test', rol: 'admin' }).expect(503);
    expect(res.body.code).toBe('no_configurado');
    const list = await adm.get('/usuarios').expect(200);
    expect(list.body[0].pendiente).toBeNull();
  });

  it('audits without emails, names or links', async () => {
    const rows = await q(`select accion, metadata::text as m from audit_log where clinica_id in ('${A}','${C}') and entidad = 'membresias'`);
    const actions = new Set(rows.map((r) => r.accion));
    expect(actions.has('create')).toBe(true);
    expect(actions.has('update')).toBe(true);
    const all = JSON.stringify(rows.map((r) => r.m));
    expect(all).not.toMatch(/@|tok-|rec-|Nueva|Compartido|Dra\./);
  });
});
