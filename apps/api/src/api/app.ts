import cors from 'cors';
import { eq } from 'drizzle-orm';
import express from 'express';
import type { JWTVerifyGetKey } from 'jose';
import { clinicas, membresias, type Database } from '@odontotrust/db';
import type { Env } from '../config/env';
import { pacientesRouter } from '../pacientes/routes';
import { authenticate, requirePermission, resolveClinica } from './auth';
import { errorHandler } from './errors';

export type AppDeps = {
  env: Pick<Env, 'CORS_ALLOWED_ORIGINS' | 'SUPABASE_URL'>;
  database: Database;
  jwks: JWTVerifyGetKey;
};

export function createApp({ env, database, jwks }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: env.CORS_ALLOWED_ORIGINS.split(','), credentials: true }));
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const authn = authenticate({ jwks, supabaseUrl: env.SUPABASE_URL });
  const tenant = [authn, resolveClinica(database)];

  // Caller's own memberships across clinics (front uses it to pick the active clinic).
  app.get('/api/v1/me', authn, async (req, res, next) => {
    try {
      const userId = req.userId!;
      const rows = await database.withUser(userId, (tx) =>
        tx
          .select({ clinicaId: membresias.clinicaId, rol: membresias.rol, nombre: clinicas.nombre })
          .from(membresias)
          .innerJoin(clinicas, eq(clinicas.id, membresias.clinicaId))
          .where(eq(membresias.userId, userId)),
      );
      res.json({ userId, clinicas: rows });
    } catch (err) {
      next(err);
    }
  });

  // Active clinic (tenant-scoped).
  app.get('/api/v1/clinica', ...tenant, requirePermission('clinica:read'), async (req, res, next) => {
    try {
      const { clinicaId, userId } = req.auth!;
      const rows = await database.withTenant(
        clinicaId,
        (tx) =>
          tx
            .select({ id: clinicas.id, nombre: clinicas.nombre, zonaHoraria: clinicas.zonaHoraria })
            .from(clinicas)
            .where(eq(clinicas.id, clinicaId)),
        userId,
      );
      res.json(rows[0] ?? null);
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/v1/pacientes', ...tenant, pacientesRouter(database));

  app.use(errorHandler);
  return app;
}
