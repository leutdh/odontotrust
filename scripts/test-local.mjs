// pnpm test:local [vitest args]
// Starts the throwaway Postgres (docker compose `db`), applies the migrations and runs the whole
// suite against it. Much faster than the remote Supabase project (no network round trips).
import { spawnSync } from 'node:child_process';

const url = 'postgresql://postgres:postgres@localhost:54322/odontotrust_test';
const env = { ...process.env, DATABASE_URL_TEST: url, DATABASE_URL_MIGRATIONS: url };

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('docker', ['compose', 'up', '-d', '--wait', 'db']);
run('pnpm', ['db:migrate']);
run('pnpm', ['exec', 'vitest', 'run', ...process.argv.slice(2)]);
