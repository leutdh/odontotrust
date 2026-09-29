import { Router, type RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { Database } from '@odontotrust/db';
import {
  pacienteCreateSchema,
  pacienteListQuerySchema,
  pacienteUpdateSchema,
} from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { HttpError } from '../api/errors';
import { createPacientesService } from './service';

// Zod messages name the field, never echo the submitted value (no personal data in errors).
function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join('.') || 'body';
    throw new HttpError(400, 'validation_error', `${where}: ${issue?.message ?? 'inválido'}`);
  }
  return result.data;
}

const idParam: RequestHandler = (req, _res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return next(new HttpError(404, 'not_found', 'Paciente no encontrado'));
  }
  next();
};

/** Mounted behind authenticate + resolveClinica, so req.auth is always set. */
export function pacientesRouter(database: Database) {
  const service = createPacientesService(database);
  const router = Router();

  router.get('/', requirePermission('pacientes:read'), async (req, res) => {
    res.json(await service.list(req.auth!, parse(pacienteListQuerySchema, req.query)));
  });

  router.post('/', requirePermission('pacientes:write'), async (req, res) => {
    res.status(201).json(await service.create(req.auth!, parse(pacienteCreateSchema, req.body)));
  });

  router.get('/:id', idParam, requirePermission('pacientes:read'), async (req, res) => {
    res.json(await service.get(req.auth!, req.params.id as string));
  });

  router.patch('/:id', idParam, requirePermission('pacientes:write'), async (req, res) => {
    res.json(await service.update(req.auth!, req.params.id as string, parse(pacienteUpdateSchema, req.body)));
  });

  router.delete('/:id', idParam, requirePermission('pacientes:delete'), async (req, res) => {
    await service.remove(req.auth!, req.params.id as string);
    res.status(204).end();
  });

  router.get('/:id/turnos', idParam, requirePermission('pacientes:read'), requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.turnos(req.auth!, req.params.id as string));
  });

  return router;
}
