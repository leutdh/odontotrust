import { createDb } from '@odontotrust/db';
import { loadEnv } from '../config/env';
import { createResendSender, noEmailSender } from '../usuarios/email';
import { createSupabaseAuthAdmin } from '../usuarios/auth-admin';
import { createApp } from './app';
import { createJwks } from './auth';

const env = loadEnv();
const database = createDb({ url: env.DATABASE_URL });
await database.assertRlsEnforced();

const app = createApp({
  env,
  database,
  jwks: createJwks(env.SUPABASE_URL),
  authAdmin: env.SUPABASE_SERVICE_ROLE_KEY ? createSupabaseAuthAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : null,
  email: env.RESEND_API_KEY && env.EMAIL_FROM ? createResendSender(env.RESEND_API_KEY, env.EMAIL_FROM) : noEmailSender,
  webUrl: env.WEB_URL,
});

app.listen(env.API_PORT, () => {
  console.log(`api listening on :${env.API_PORT}`);
});
