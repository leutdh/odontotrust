import { foreignKey, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';
import { membresias } from './membresias';

export const profesionales = pgTable(
  'profesionales',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    membresiaId: uuid('membresia_id'),
    nombre: text('nombre').notNull(),
    matricula: text('matricula'),
    especialidad: text('especialidad'),
    color: text('color'),
    horarios: jsonb('horarios').notNull().default({}),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('profesionales_clinica_id_uk').on(t.clinicaId, t.id),
    foreignKey({
      name: 'profesionales_membresia_fk',
      columns: [t.clinicaId, t.membresiaId],
      foreignColumns: [membresias.clinicaId, membresias.id],
    }),
  ],
);
