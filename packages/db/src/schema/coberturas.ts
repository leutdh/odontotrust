import { foreignKey, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';
import { pacientes } from './pacientes';

// MVP: affiliation data only (no service codes or authorizations). One per patient for now.
export const coberturas = pgTable(
  'coberturas',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    pacienteId: uuid('paciente_id').notNull(),
    obraSocial: text('obra_social').notNull(),
    plan: text('plan'),
    nroAfiliado: text('nro_afiliado'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('coberturas_clinica_paciente_uk').on(t.clinicaId, t.pacienteId),
    foreignKey({
      name: 'coberturas_paciente_fk',
      columns: [t.clinicaId, t.pacienteId],
      foreignColumns: [pacientes.clinicaId, pacientes.id],
    }),
  ],
);
