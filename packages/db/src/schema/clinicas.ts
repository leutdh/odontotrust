import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { deletedAt, id, timestamps } from './_common';

export const clinicas = pgTable('clinicas', {
  id: id(),
  nombre: text('nombre').notNull(),
  cuit: text('cuit'),
  zonaHoraria: text('zona_horaria').notNull().default('America/Argentina/Buenos_Aires'),
  configuracion: jsonb('configuracion').notNull().default({}),
  ...timestamps(),
  deletedAt: deletedAt(),
});
