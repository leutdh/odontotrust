import { Router } from 'express';
import type { Database } from '@odontotrust/db';
import { rangeQuerySchema, turnoCreateSchema, turnoUpdateSchema } from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { idParam, parse } from '../api/http';
import { createTurnosService } from './service';

export function turnosRouter(database: Database) {
  const service = createTurnosService(database);
  const router = Router();
  const id = idParam('Turno');

  router.get('/', requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.list(req.auth!, parse(rangeQuerySchema, req.query)));
  });
  router.post('/', requirePermission('turnos:write'), async (req, res) => {
    res.status(201).json(await service.create(req.auth!, parse(turnoCreateSchema, req.body)));
  });
  router.get('/:id', id, requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.get(req.auth!, req.params.id as string));
  });
  router.patch('/:id', id, requirePermission('turnos:write'), async (req, res) => {
    res.json(await service.update(req.auth!, req.params.id as string, parse(turnoUpdateSchema, req.body)));
  });

  return router;
}
