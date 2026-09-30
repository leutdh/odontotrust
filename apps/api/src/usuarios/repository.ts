import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { membresias, profesionales } from '@odontotrust/db';
import type { Tx } from '../db-types';

export type MembresiaRow = typeof membresias.$inferSelect;

// Every query filters by clinica_id even though RLS already does (second layer).

export const list = (tx: Tx, clinicaId: string) =>
  tx.select().from(membresias).where(eq(membresias.clinicaId, clinicaId)).orderBy(asc(membresias.createdAt), asc(membresias.id));

export async function getById(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx.select().from(membresias).where(and(eq(membresias.clinicaId, clinicaId), eq(membresias.id, id)));
  return row ?? null;
}

export async function findByEmail(tx: Tx, clinicaId: string, email: string) {
  const [row] = await tx
    .select()
    .from(membresias)
    .where(and(eq(membresias.clinicaId, clinicaId), sql`lower(${membresias.email}) = ${email.toLowerCase()}`));
  return row ?? null;
}

export async function findByUser(tx: Tx, clinicaId: string, userId: string) {
  const [row] = await tx
    .select()
    .from(membresias)
    .where(and(eq(membresias.clinicaId, clinicaId), eq(membresias.userId, userId)));
  return row ?? null;
}

export async function insert(tx: Tx, clinicaId: string, v: Omit<typeof membresias.$inferInsert, 'clinicaId'>) {
  const [row] = await tx.insert(membresias).values({ ...v, clinicaId }).returning();
  return row!;
}

export async function update(tx: Tx, clinicaId: string, id: string, v: Partial<typeof membresias.$inferInsert>) {
  const [row] = await tx
    .update(membresias)
    .set({ ...v, updatedAt: new Date() })
    .where(and(eq(membresias.clinicaId, clinicaId), eq(membresias.id, id)))
    .returning();
  return row!;
}

/**
 * Locks the clinic's active admins (stable order, so concurrent callers queue instead of
 * deadlocking). Two simultaneous "demote an admin" requests therefore cannot both succeed.
 */
export async function lockActiveAdmins(tx: Tx, clinicaId: string) {
  return tx
    .select({ id: membresias.id })
    .from(membresias)
    .where(and(eq(membresias.clinicaId, clinicaId), eq(membresias.rol, 'admin'), eq(membresias.activo, true)))
    .orderBy(asc(membresias.id))
    .for('update');
}

// ---- Linked professional -------------------------------------------------------------
export async function linkedProfesional(tx: Tx, clinicaId: string, membresiaId: string) {
  const [row] = await tx
    .select({ id: profesionales.id })
    .from(profesionales)
    .where(
      and(
        eq(profesionales.clinicaId, clinicaId),
        eq(profesionales.membresiaId, membresiaId),
        isNull(profesionales.deletedAt),
      ),
    );
  return row ?? null;
}

export async function getProfesional(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select({ id: profesionales.id, membresiaId: profesionales.membresiaId })
    .from(profesionales)
    .where(and(eq(profesionales.clinicaId, clinicaId), eq(profesionales.id, id), isNull(profesionales.deletedAt)));
  return row ?? null;
}

export async function createProfesional(tx: Tx, clinicaId: string, nombre: string, membresiaId: string) {
  await tx.insert(profesionales).values({ clinicaId, nombre, membresiaId });
}

export async function linkProfesional(tx: Tx, clinicaId: string, profesionalId: string, membresiaId: string) {
  await tx
    .update(profesionales)
    .set({ membresiaId, updatedAt: new Date() })
    .where(and(eq(profesionales.clinicaId, clinicaId), eq(profesionales.id, profesionalId)));
}
