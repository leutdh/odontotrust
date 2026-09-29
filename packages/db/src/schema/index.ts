export * from './audit-log';
export * from './bloqueos';
export * from './clinicas';
export * from './coberturas';
export * from './membresias';
export * from './pacientes';
export * from './profesionales';
export * from './recordatorios';
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
  'coberturas',
  'tipos_tratamiento',
  'turnos',
  'bloqueos',
  'recordatorios',
  'audit_log',
] as const;
