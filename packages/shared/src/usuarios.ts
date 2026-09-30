import { z } from 'zod';
import { rolSchema } from './schemas';
import { text } from './zod-helpers';

export const MIN_PASSWORD_LENGTH = 8;

export const usuarioInvitarSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email inválido').max(200),
    rol: rolSchema,
    nombre: text(100).optional(),
    // Link an existing professional (agenda history) instead of creating a new one.
    profesionalId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => v.rol !== 'profesional' || v.profesionalId || v.nombre, {
    message: 'Indicá el nombre del profesional',
    path: ['nombre'],
  });

export const usuarioActualizarSchema = z
  .object({ rol: rolSchema, activo: z.boolean(), nombre: text(100) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios');

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(72);

export type UsuarioInvitar = z.infer<typeof usuarioInvitarSchema>;
export type UsuarioActualizar = z.infer<typeof usuarioActualizarSchema>;

export type UsuarioDto = {
  id: string; // membership id
  email: string | null;
  nombre: string | null;
  rol: z.infer<typeof rolSchema>;
  activo: boolean;
  esYo: boolean;
  // true = invited but never signed in (an invite link can be regenerated). null = unknown.
  pendiente: boolean | null;
};

export type InvitacionDto = {
  usuario: UsuarioDto;
  invitacion: {
    // One-time link to set the password. null when the account already existed.
    link: string | null;
    enviadoPorEmail: boolean;
    cuentaExistente: boolean;
  };
};
