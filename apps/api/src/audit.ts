import { auditLog } from '@odontotrust/db';
import type { AuthContext } from './api/auth';
import type { Tx } from './db-types';

export type AuditEntry = {
  entidad: string;
  entidadId?: string;
  accion: 'create' | 'update' | 'delete' | 'view';
  /** Never personal or clinical data: field NAMES and counters only. */
  metadata?: Record<string, string | number | boolean | string[]>;
};

/** Written in the same transaction as the change it records. */
export async function audit(tx: Tx, ctx: AuthContext, entry: AuditEntry) {
  await tx.insert(auditLog).values({
    clinicaId: ctx.clinicaId,
    userId: ctx.userId,
    entidad: entry.entidad,
    entidadId: entry.entidadId,
    accion: entry.accion,
    metadata: entry.metadata ?? {},
  });
}
