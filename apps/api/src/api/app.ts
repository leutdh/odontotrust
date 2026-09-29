import cors from 'cors';
import express from 'express';
import type { Env } from '../config/env';

export function createApp(env: Pick<Env, 'CORS_ALLOWED_ORIGINS'>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: env.CORS_ALLOWED_ORIGINS.split(','), credentials: true }));
  app.use(express.json());
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}
