import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';
import { profesionales } from './profesionales';

// Time blocks (lunch, vacations, congresses). profesional_id NULL = the whole clinic.
export const bloqueos = pgTable(
  'bloqueos',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    profesionalId: uuid('profesional_id'),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    motivo: text('motivo'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('bloqueos_clinica_id_uk').on(t.clinicaId, t.id),
    check('bloqueos_fin_ck', sql`${t.fin} > ${t.inicio}`),
    foreignKey({
      name: 'bloqueos_profesional_fk',
      columns: [t.clinicaId, t.profesionalId],
      foreignColumns: [profesionales.clinicaId, profesionales.id],
    }),
  ],
);
