import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import { createDb } from './client';
import { requireMigrationsUrl } from './require-url';

// Demo data for local/dev projects only. Idempotent: safe to run more than once.
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create demo users.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}

const DEMO_CLINICA_ID = '00000000-0000-4000-8000-000000000001';
const password = process.env.SEED_DEMO_PASSWORD ?? randomBytes(9).toString('base64url');

async function ensureUser(auth: SupabaseClient['auth'], email: string): Promise<string> {
  const created = await auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  // Already exists: find it.
  for (let page = 1; page < 20; page++) {
    const { data, error } = await auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) {
      // Dev-only demo users: keep the printed password valid on every run.
      await auth.admin.updateUserById(found.id, { password });
      return found.id;
    }
    if (data.users.length < 100) break;
  }
  throw new Error(`Could not create or find demo user ${email}: ${created.error?.message}`);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const adminId = await ensureUser(supabase.auth, 'admin@demo.odontotrust.test');
const profId = await ensureUser(supabase.auth, 'profesional@demo.odontotrust.test');

const admin = createDb({ url: requireMigrationsUrl(), max: 1 });
const c = DEMO_CLINICA_ID;
const run = (q: ReturnType<typeof sql>) => admin.db.execute(q);
await run(sql`insert into clinicas (id, nombre) values (${c}, 'Consultorio Demo') on conflict (id) do nothing`);
await run(sql`insert into membresias (clinica_id, user_id, rol) values (${c}, ${adminId}, 'admin'), (${c}, ${profId}, 'profesional')
  on conflict (clinica_id, user_id) do nothing`);
await run(sql`insert into profesionales (clinica_id, membresia_id, nombre, especialidad, color)
  select ${c}::uuid, m.id, 'Dra. Demo', 'Odontología general', '#0ea5e9'
  from membresias m where m.clinica_id = ${c} and m.user_id = ${profId}
  and not exists (select 1 from profesionales p where p.clinica_id = ${c})`);
await run(sql`insert into tipos_tratamiento (clinica_id, nombre, duracion_minutos)
  select ${c}::uuid, t.nombre, t.dur from (values ('Consulta', 30), ('Limpieza', 45), ('Endodoncia', 90)) as t(nombre, dur)
  where not exists (select 1 from tipos_tratamiento x where x.clinica_id = ${c})`);
await run(sql`insert into pacientes (clinica_id, nombre, apellido, celular)
  select ${c}::uuid, p.n, p.a, p.c from (values
    ('Ana', 'Ficticia', '+5491100000001'), ('Luis', 'Ejemplo', '+5491100000002'), ('Marta', 'Prueba', '+5491100000003')
  ) as p(n, a, c)
  where not exists (select 1 from pacientes x where x.clinica_id = ${c})`);
await admin.close();

console.log('Seed done. Demo clinic:', DEMO_CLINICA_ID);
console.log('Users: admin@demo.odontotrust.test, profesional@demo.odontotrust.test');
console.log(`Password (both users): ${password}`);
