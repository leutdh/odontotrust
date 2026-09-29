import { Router } from 'express';
import type { Database } from '@odontotrust/db';
import { plantillaUpdateSchema } from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { idParam, parse } from '../api/http';
import { createRecordatoriosService } from './service';

/** /api/v1/turnos/:id/recordatorio(s): registered on the turnos router (single tenant middleware pass). */
export function mountTurnoRecordatorios(router: Router, database: Database) {
  const service = createRecordatoriosService(database);
  const id = idParam('Turno');

  router.post('/:id/recordatorio', id, requirePermission('recordatorios:send'), async (req, res) => {
    res.status(201).json(await service.generarLink(req.auth!, req.params.id as string));
  });
  router.get('/:id/recordatorios', id, requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.listar(req.auth!, req.params.id as string));
  });
}

/** /api/v1/configuracion/recordatorios */
export function configuracionRouter(database: Database) {
  const service = createRecordatoriosService(database);
  const router = Router();

  router.get('/recordatorios', requirePermission('turnos:read'), async (req, res) => {
    res.json(await service.getPlantilla(req.auth!));
  });
  router.put('/recordatorios', requirePermission('clinica:update'), async (req, res) => {
    res.json(await service.setPlantilla(req.auth!, parse(plantillaUpdateSchema, req.body).plantilla));
  });

  return router;
}
