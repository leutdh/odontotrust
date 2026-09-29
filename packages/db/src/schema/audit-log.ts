import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clinicaId, id } from './_common';
import { clinicas } from './clinicas';

// Append-only. `metadata` must never contain personal or clinical data.
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    userId: uuid('user_id').notNull(),
    entidad: text('entidad').notNull(),
    entidadId: uuid('entidad_id'),
    accion: text('accion').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (t) => [index('audit_log_clinica_ts_idx').on(t.clinicaId, t.timestamp)],
);
