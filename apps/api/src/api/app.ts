import cors from 'cors';
import { and, eq } from 'drizzle-orm';
import express from 'express';
import type { JWTVerifyGetKey } from 'jose';
import { clinicas, membresias, type Database } from '@odontotrust/db';
import type { Env } from '../config/env';
import { bloqueosRouter } from '../bloqueos/routes';
import { catalogoRouters } from '../catalogo/routes';
import { pacientesRouter } from '../pacientes/routes';
import { configuracionRouter } from '../recordatorios/routes';
import { turnosRouter } from '../turnos/routes';
import { noEmailSender } from '../usuarios/email';
import type { AuthAdmin, EmailSender } from '../usuarios/ports';
import { usuariosRouter } from '../usuarios/routes';
import { authenticate, requirePermission, resolveClinica } from './auth';
import { errorHandler } from './errors';

export type AppDeps = {
  env: Pick<Env, 'CORS_ALLOWED_ORIGINS' | 'SUPABASE_URL'>;
  database: Database;
  jwks: JWTVerifyGetKey;
  // User management (optional so tests that don't need it stay simple).
  authAdmin?: AuthAdmin | null;
  email?: EmailSender;
  webUrl?: string;
};

export function createApp({ env, database, jwks, authAdmin = null, email = noEmailSender, webUrl = 'http://localhost:3000' }: AppDeps) {
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
          // Deactivated memberships must not show up (nor be selectable) in the clinic picker.
          .where(and(eq(membresias.userId, userId), eq(membresias.activo, true))),
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
  app.use('/api/v1/turnos', ...tenant, turnosRouter(database));
  app.use('/api/v1/bloqueos', ...tenant, bloqueosRouter(database));
  app.use('/api/v1/configuracion', ...tenant, configuracionRouter(database));
  app.use('/api/v1/usuarios', ...tenant, usuariosRouter({ database, authAdmin, email, webUrl }));
  const catalogo = catalogoRouters(database);
  app.use('/api/v1/tipos-tratamiento', ...tenant, catalogo.tipos);
  app.use('/api/v1/sillones', ...tenant, catalogo.sillones);
  app.use('/api/v1/profesionales', ...tenant, catalogo.profesionales);

  app.use(errorHandler);
  return app;
}
