import { foreignKey, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';

export const sedes = pgTable(
  'sedes',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    nombre: text('nombre').notNull(),
    direccion: text('direccion'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [unique('sedes_clinica_id_uk').on(t.clinicaId, t.id)],
);

export const sillones = pgTable(
  'sillones',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    sedeId: uuid('sede_id').notNull(),
    nombre: text('nombre').notNull(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('sillones_clinica_id_uk').on(t.clinicaId, t.id),
    foreignKey({
      name: 'sillones_sede_fk',
      columns: [t.clinicaId, t.sedeId],
      foreignColumns: [sedes.clinicaId, sedes.id],
    }),
  ],
);
