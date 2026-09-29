import type { Rol } from './constants';

// Single source of truth for role permissions. Enforced by API middleware.
export const PERMISSIONS = {
  'clinica:read': ['admin', 'profesional', 'recepcion'],
  'clinica:update': ['admin'],
  'usuarios:manage': ['admin'],
  'pacientes:read': ['admin', 'profesional', 'recepcion'],
  'pacientes:write': ['admin', 'profesional', 'recepcion'],
  'pacientes:delete': ['admin', 'profesional'],
  // Clinical fields of a patient (antecedentes, alergias) and evoluciones: no recepcion.
  'clinico:read': ['admin', 'profesional'],
  'clinico:write': ['admin', 'profesional'],
  'turnos:read': ['admin', 'profesional', 'recepcion'],
  'turnos:write': ['admin', 'profesional', 'recepcion'],
  'bloqueos:write': ['admin', 'profesional', 'recepcion'],
  // Treatment types, chairs, professionals and their working hours.
  'agenda:config': ['admin'],
} as const satisfies Record<string, readonly Rol[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(rol: Rol, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Rol[]).includes(rol);
}
