import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('fails clearly when required vars are missing', () => {
    expect(() => loadEnv({})).toThrow(/REDIS_URL/);
  });
  it('accepts a minimal valid env', () => {
    const env = loadEnv({ REDIS_URL: 'redis://x', CORS_ALLOWED_ORIGINS: 'http://a' });
    expect(env.API_PORT).toBe(4000);
  });
});
