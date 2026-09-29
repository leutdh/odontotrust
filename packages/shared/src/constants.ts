export const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const ROLES = ['admin', 'profesional', 'recepcion'] as const;
export type Rol = (typeof ROLES)[number];
