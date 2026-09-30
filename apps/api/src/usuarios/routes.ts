import { Router } from 'express';
import { usuarioActualizarSchema, usuarioInvitarSchema } from '@odontotrust/shared';
import { requirePermission } from '../api/auth';
import { idParam, parse } from '../api/http';
import { createUsuariosService, type UsuariosDeps } from './service';

/** Mounted behind authenticate + resolveClinica. Admin only. */
export function usuariosRouter(deps: UsuariosDeps) {
  const service = createUsuariosService(deps);
  const router = Router();
  const id = idParam('Usuario');
  const admin = requirePermission('usuarios:manage');

  router.get('/', admin, async (req, res) => {
    res.json(await service.list(req.auth!));
  });
  router.post('/invitar', admin, async (req, res) => {
    res.status(201).json(await service.invitar(req.auth!, parse(usuarioInvitarSchema, req.body)));
  });
  router.patch('/:id', id, admin, async (req, res) => {
    res.json(await service.actualizar(req.auth!, req.params.id as string, parse(usuarioActualizarSchema, req.body)));
  });
  router.post('/:id/reenviar-invitacion', id, admin, async (req, res) => {
    res.json(await service.reenviarInvitacion(req.auth!, req.params.id as string));
  });

  return router;
}
