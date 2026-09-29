import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { requireMigrationsUrl } from './require-url';

const url = requireMigrationsUrl();
const client = postgres(url, { max: 1, prepare: false });

await migrate(drizzle(client), { migrationsFolder: new URL('../migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

// Optional: set app_user's password (never stored in migrations). Needed only when the API
// connects as app_user via DATABASE_URL.
const appPassword = process.env.APP_USER_PASSWORD;
if (appPassword) {
  const literal = `'${appPassword.replace(/'/g, "''")}'`;
  await client.unsafe(`ALTER ROLE app_user WITH PASSWORD ${literal}`);
  console.log('app_user password set.');
}

await client.end();
console.log('Migrations applied.');
