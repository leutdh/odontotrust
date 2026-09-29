import { date, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';

export const pacientes = pgTable(
  'pacientes',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    nombre: text('nombre').notNull(),
    apellido: text('apellido').notNull(),
    dni: text('dni'),
    fechaNacimiento: date('fecha_nacimiento'),
    celular: text('celular'),
    email: text('email'),
    domicilio: text('domicilio'),
    antecedentes: text('antecedentes'),
    alergias: text('alergias'),
    notas: text('notas'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [unique('pacientes_clinica_id_uk').on(t.clinicaId, t.id)],
);
