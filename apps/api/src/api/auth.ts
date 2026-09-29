import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { membresias, type Database } from '@odontotrust/db';
import { can, rolSchema, type Permission, type Rol } from '@odontotrust/shared';
import { forbidden, unauthorized } from './errors';

export type AuthContext = {
  userId: string;
  clinicaId: string;
  rol: Rol;
  membresiaId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      auth?: AuthContext;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createJwks(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
}

/** Validates the Supabase JWT (Authorization: Bearer) and sets req.userId. */
export function authenticate(opts: { jwks: JWTVerifyGetKey; supabaseUrl: string }): RequestHandler {
  return async (req, _res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) return next(unauthorized());
    try {
      const { payload } = await jwtVerify(token, opts.jwks, {
        issuer: `${opts.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      if (!payload.sub || !UUID_RE.test(payload.sub)) return next(unauthorized());
      req.userId = payload.sub;
      next();
    } catch {
      next(unauthorized());
    }
  };
}

/**
 * Resolves the active clinic from X-Clinica-Id and validates it against the caller's
 * memberships on EVERY request. No active membership -> 403.
 */
export function resolveClinica(database: Database): RequestHandler {
  return async (req, _res, next) => {
    try {
      const clinicaId = req.header('x-clinica-id');
      const userId = req.userId;
      if (!userId) return next(unauthorized());
      if (!clinicaId || !UUID_RE.test(clinicaId)) return next(forbidden());

      const rows = await database.withTenant(
        clinicaId,
        (tx) =>
          tx
            .select({ id: membresias.id, rol: membresias.rol })
            .from(membresias)
            .where(
              and(
                eq(membresias.clinicaId, clinicaId),
                eq(membresias.userId, userId),
                eq(membresias.activo, true),
              ),
            ),
        userId,
      );
      const membresia = rows[0];
      const rol = membresia && rolSchema.safeParse(membresia.rol);
      if (!membresia || !rol?.success) return next(forbidden());

      req.auth = { userId, clinicaId, rol: rol.data, membresiaId: membresia.id };
      next();
    } catch {
      next(forbidden());
    }
  };
}

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!can(req.auth.rol, permission)) return next(forbidden());
    next();
  };
