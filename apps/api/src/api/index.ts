import { createDb } from '@odontotrust/db';
import { loadEnv } from '../config/env';
import { createApp } from './app';
import { createJwks } from './auth';

const env = loadEnv();
const database = createDb({ url: env.DATABASE_URL });
await database.assertRlsEnforced();
const app = createApp({ env, database, jwks: createJwks(env.SUPABASE_URL) });

app.listen(env.API_PORT, () => {
  console.log(`api listening on :${env.API_PORT}`);
});
