import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinicaId, deletedAt, id, timestamps } from './_common';
import { clinicas } from './clinicas';
import { pacientes } from './pacientes';
import { profesionales } from './profesionales';
import { sillones } from './sedes';
import { tiposTratamiento } from './tipos-tratamiento';

// The anti-overlap exclusion constraints (profesional / sillon) are created in the
// custom SQL migration: drizzle-kit cannot express EXCLUDE USING gist.
export const turnos = pgTable(
  'turnos',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    pacienteId: uuid('paciente_id').notNull(),
    profesionalId: uuid('profesional_id').notNull(),
    sillonId: uuid('sillon_id'),
    tipoTratamientoId: uuid('tipo_tratamiento_id'),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    estado: text('estado').notNull().default('pendiente'),
    notas: text('notas'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('turnos_clinica_id_uk').on(t.clinicaId, t.id),
    check('turnos_fin_ck', sql`${t.fin} > ${t.inicio}`),
    check(
      'turnos_estado_ck',
      sql`${t.estado} in ('pendiente','confirmado','atendido','ausente','cancelado')`,
    ),
    foreignKey({
      name: 'turnos_paciente_fk',
      columns: [t.clinicaId, t.pacienteId],
      foreignColumns: [pacientes.clinicaId, pacientes.id],
    }),
    foreignKey({
      name: 'turnos_profesional_fk',
      columns: [t.clinicaId, t.profesionalId],
      foreignColumns: [profesionales.clinicaId, profesionales.id],
    }),
    foreignKey({
      name: 'turnos_sillon_fk',
      columns: [t.clinicaId, t.sillonId],
      foreignColumns: [sillones.clinicaId, sillones.id],
    }),
    foreignKey({
      name: 'turnos_tipo_tratamiento_fk',
      columns: [t.clinicaId, t.tipoTratamientoId],
      foreignColumns: [tiposTratamiento.clinicaId, tiposTratamiento.id],
    }),
  ],
);
