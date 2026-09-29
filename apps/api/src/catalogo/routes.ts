import { Router } from 'express';
import type { Database } from '@odontotrust/db';
import {
  profesionalCreateSchema,
  profesionalUpdateSchema,
  sillonCreateSchema,
  tipoTratamientoCreateSchema,
  tipoTratamientoUpdateSchema,
} from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { idParam, parse } from '../api/http';
import { createCatalogoService } from './service';

/** Treatment types, chairs and professionals: readable by anyone who reads the agenda; admin writes. */
export function catalogoRouters(database: Database) {
  const service = createCatalogoService(database);
  const read = requirePermission('turnos:read');
  const write = requirePermission('agenda:config');

  const tipos = Router();
  tipos.get('/', read, async (req, res) => res.json(await service.listTipos(req.auth!)));
  tipos.post('/', write, async (req, res) => {
    res.status(201).json(await service.createTipo(req.auth!, parse(tipoTratamientoCreateSchema, req.body)));
  });
  tipos.patch('/:id', idParam('Tipo de tratamiento'), write, async (req, res) => {
    res.json(await service.updateTipo(req.auth!, req.params.id as string, parse(tipoTratamientoUpdateSchema, req.body)));
  });

  const sillones = Router();
  sillones.get('/', read, async (req, res) => res.json(await service.listSillones(req.auth!)));
  sillones.post('/', write, async (req, res) => {
    res.status(201).json(await service.createSillon(req.auth!, parse(sillonCreateSchema, req.body)));
  });

  const profesionales = Router();
  profesionales.get('/', read, async (req, res) => res.json(await service.listProfesionales(req.auth!)));
  profesionales.post('/', write, async (req, res) => {
    res.status(201).json(await service.createProfesional(req.auth!, parse(profesionalCreateSchema, req.body)));
  });
  profesionales.patch('/:id', idParam('Profesional'), write, async (req, res) => {
    res.json(await service.updateProfesional(req.auth!, req.params.id as string, parse(profesionalUpdateSchema, req.body)));
  });

  return { tipos, sillones, profesionales };
}
