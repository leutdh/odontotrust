import { boolean, check, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';

export const tiposTratamiento = pgTable(
  'tipos_tratamiento',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    nombre: text('nombre').notNull(),
    duracionMinutos: integer('duracion_minutos').notNull(),
    // Money as integer cents, never floats.
    precioBaseCentavos: integer('precio_base_centavos'),
    activo: boolean('activo').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('tipos_tratamiento_clinica_id_uk').on(t.clinicaId, t.id),
    check('tipos_tratamiento_duracion_ck', sql`${t.duracionMinutos} > 0`),
  ],
);
