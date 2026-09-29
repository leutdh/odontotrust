import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { bloqueos } from '@odontotrust/db';
import type { Tx } from '../db-types';

export type BloqueoRow = typeof bloqueos.$inferSelect;

/** Live blocks overlapping [desde, hasta) that apply to the professional (or to the whole clinic). */
export function overlapping(tx: Tx, clinicaId: string, desde: Date, hasta: Date, profesionalId?: string) {
  return tx
    .select()
    .from(bloqueos)
    .where(
      and(
        eq(bloqueos.clinicaId, clinicaId),
        isNull(bloqueos.deletedAt),
        lt(bloqueos.inicio, hasta),
        gt(bloqueos.fin, desde),
        profesionalId ? or(isNull(bloqueos.profesionalId), eq(bloqueos.profesionalId, profesionalId)) : undefined,
      ),
    )
    .orderBy(asc(bloqueos.inicio));
}

export async function get(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select()
    .from(bloqueos)
    .where(and(eq(bloqueos.clinicaId, clinicaId), eq(bloqueos.id, id), isNull(bloqueos.deletedAt)));
  return row ?? null;
}

export async function insert(tx: Tx, clinicaId: string, v: Omit<typeof bloqueos.$inferInsert, 'clinicaId'>) {
  const [row] = await tx.insert(bloqueos).values({ ...v, clinicaId }).returning();
  return row!;
}

export async function update(tx: Tx, clinicaId: string, id: string, v: Partial<typeof bloqueos.$inferInsert>) {
  const [row] = await tx
    .update(bloqueos)
    .set({ ...v, updatedAt: new Date() })
    .where(and(eq(bloqueos.clinicaId, clinicaId), eq(bloqueos.id, id), isNull(bloqueos.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDelete(tx: Tx, clinicaId: string, id: string) {
  const rows = await tx
    .update(bloqueos)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bloqueos.clinicaId, clinicaId), eq(bloqueos.id, id), isNull(bloqueos.deletedAt)))
    .returning({ id: bloqueos.id });
  return rows.length > 0;
}
