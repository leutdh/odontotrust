import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const minimal = {
  REDIS_URL: 'redis://x',
  CORS_ALLOWED_ORIGINS: 'http://a',
  DATABASE_URL: 'postgresql://x',
  SUPABASE_URL: 'https://abc.supabase.co',
};

describe('loadEnv', () => {
  it('fails clearly when required vars are missing', () => {
    expect(() => loadEnv({})).toThrow(/REDIS_URL/);
  });
  it('accepts a minimal valid env', () => {
    expect(loadEnv(minimal).API_PORT).toBe(4000);
  });
});
