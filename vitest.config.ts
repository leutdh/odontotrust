import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    // DB tests read connection URLs from the root .env (skipped when absent, e.g. in CI).
    env: loadEnv('test', process.cwd(), ''),
    testTimeout: 60_000,
    // DB tests share one Supabase project; run files serially.
    fileParallelism: false,
  },
});
