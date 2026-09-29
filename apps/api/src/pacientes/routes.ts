import { Router } from 'express';
import type { Database } from '@odontotrust/db';
import {
  pacienteCreateSchema,
  pacienteListQuerySchema,
  pacienteUpdateSchema,
} from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { idParam, parse } from '../api/http';
import { createPacientesService } from './service';

/** Mounted behind authenticate + resolveClinica, so req.auth is always set. */
export function pacientesRouter(database: Database) {
  const service = createPacientesService(database);
  const router = Router();
  const id = idParam('Paciente');

  router.get('/', requirePermission('pacientes:read'), async (req, res) => {
    res.json(await service.list(req.auth!, parse(pacienteListQuerySchema, req.query)));
  });

  router.post('/', requirePermission('pacientes:write'), async (req, res) => {
    res.status(201).json(await service.create(req.auth!, parse(pacienteCreateSchema, req.body)));
  });

  router.get('/:id', id, requirePermission('pacientes:read'), async (req, res) => {
    res.json(await service.get(req.auth!, req.params.id as string));
  });

  router.patch('/:id', id, requirePermission('pacientes:write'), async (req, res) => {
    res.json(await service.update(req.auth!, req.params.id as string, parse(pacienteUpdateSchema, req.body)));
  });

  router.delete('/:id', id, requirePermission('pacientes:delete'), async (req, res) => {
    await service.remove(req.auth!, req.params.id as string);
    res.status(204).end();
  });

  router.get('/:id/turnos', id, requirePermission('pacientes:read'), requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.turnos(req.auth!, req.params.id as string));
  });

  return router;
}
