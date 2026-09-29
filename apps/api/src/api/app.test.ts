import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLocalJWKSet } from 'jose';
import type { Database } from '@odontotrust/db';
import { createApp } from './app';

describe('GET /api/v1/health', () => {
  it('returns ok without auth', async () => {
    const app = createApp({
      env: { CORS_ALLOWED_ORIGINS: 'http://localhost:3000', SUPABASE_URL: 'https://x.supabase.co' },
      database: {} as Database,
      jwks: createLocalJWKSet({ keys: [] }),
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
