import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const app = createApp({ CORS_ALLOWED_ORIGINS: 'http://localhost:3000' });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
