import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinicaId, id, timestamps } from './_common';
import { clinicas } from './clinicas';
import { turnos } from './turnos';

// One row per reminder attempt. `whatsapp_link` (wa.me, opened by staff) today; `whatsapp_api`
// (automated worker) later share the same table. `error` holds an error CODE, never message text.
export const recordatorios = pgTable(
  'recordatorios',
  {
    id: id(),
    clinicaId: clinicaId().references(() => clinicas.id),
    turnoId: uuid('turno_id').notNull(),
    canal: text('canal').notNull(),
    estado: text('estado').notNull(),
    enviadoAt: timestamp('enviado_at', { withTimezone: true }),
    error: text('error'),
    idempotencyKey: text('idempotency_key'),
    creadoPor: uuid('creado_por'),
    ...timestamps(),
  },
  (t) => [
    unique('recordatorios_clinica_idem_uk').on(t.clinicaId, t.idempotencyKey),
    check('recordatorios_canal_ck', sql`${t.canal} in ('whatsapp_link','whatsapp_api')`),
    check(
      'recordatorios_estado_ck',
      sql`${t.estado} in ('abierto','pendiente','enviado','entregado','leido','fallido')`,
    ),
    foreignKey({
      name: 'recordatorios_turno_fk',
      columns: [t.clinicaId, t.turnoId],
      foreignColumns: [turnos.clinicaId, turnos.id],
    }),
  ],
);
