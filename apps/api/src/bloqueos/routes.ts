import { Router } from 'express';
import type { Database } from '@odontotrust/db';
import { bloqueoCreateSchema, bloqueoUpdateSchema, rangeQuerySchema } from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { idParam, parse } from '../api/http';
import { createBloqueosService } from './service';

export function bloqueosRouter(database: Database) {
  const service = createBloqueosService(database);
  const router = Router();
  const id = idParam('Bloqueo');
  const write = requirePermission('bloqueos:write');

  router.get('/', requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.list(req.auth!, parse(rangeQuerySchema, req.query)));
  });
  router.post('/', write, async (req, res) => {
    res.status(201).json(await service.create(req.auth!, parse(bloqueoCreateSchema, req.body)));
  });
  router.patch('/:id', id, write, async (req, res) => {
    res.json(await service.update(req.auth!, req.params.id as string, parse(bloqueoUpdateSchema, req.body)));
  });
  router.delete('/:id', id, write, async (req, res) => {
    await service.remove(req.auth!, req.params.id as string);
    res.status(204).end();
  });

  return router;
}
