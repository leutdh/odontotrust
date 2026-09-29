export * from './audit-log';
export * from './clinicas';
export * from './membresias';
export * from './pacientes';
export * from './profesionales';
export * from './sedes';
export * from './tipos-tratamiento';
export * from './turnos';

/** Tables holding tenant data (all carry `clinica_id`, except `clinicas` whose `id` is the tenant). */
export const TENANT_TABLES = [
  'membresias',
  'profesionales',
  'sedes',
  'sillones',
  'pacientes',
  'tipos_tratamiento',
  'turnos',
  'audit_log',
] as const;
