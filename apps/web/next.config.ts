import type { NextConfig } from 'next';

// Monorepo: the single .env lives at the repo root. Absent in CI/production (env comes from the host).
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // no root .env
}

const nextConfig: NextConfig = {};

export default nextConfig;
