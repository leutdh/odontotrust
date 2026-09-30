import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST points at a throwaway Postgres (docker compose `db`, or the CI service).
// When set, DB tests use it instead of the Supabase project from .env: no network latency, and
// files can run in parallel because each one works on its own random clinics.
const testDbUrl = process.env.DATABASE_URL_TEST;

export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    // DB tests read connection URLs from the root .env (skipped when absent).
    env: {
      ...loadEnv('test', process.cwd(), ''),
      ...(testDbUrl && { DATABASE_URL_MIGRATIONS: testDbUrl }),
    },
    testTimeout: 60_000,
    // Against the shared remote Supabase project run files serially; against a local DB, in parallel.
    fileParallelism: Boolean(testDbUrl),
  },
});
