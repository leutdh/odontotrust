import { and, asc, eq, isNull } from 'drizzle-orm';
import { membresias, profesionales, sedes, sillones, tiposTratamiento } from '@odontotrust/db';
import type { Horarios } from '@odontotrust/shared';
import type { Tx } from '../db-types';

// ---- Treatment types ----
export const listTipos = (tx: Tx, clinicaId: string) =>
  tx
    .select()
    .from(tiposTratamiento)
    .where(and(eq(tiposTratamiento.clinicaId, clinicaId), isNull(tiposTratamiento.deletedAt)))
    .orderBy(asc(tiposTratamiento.nombre));

export async function insertTipo(tx: Tx, clinicaId: string, v: typeof tiposTratamiento.$inferInsert) {
  const [row] = await tx.insert(tiposTratamiento).values({ ...v, clinicaId }).returning();
  return row!;
}

export async function updateTipo(tx: Tx, clinicaId: string, id: string, v: Partial<typeof tiposTratamiento.$inferInsert>) {
  const [row] = await tx
    .update(tiposTratamiento)
    .set({ ...v, updatedAt: new Date() })
    .where(
      and(eq(tiposTratamiento.clinicaId, clinicaId), eq(tiposTratamiento.id, id), isNull(tiposTratamiento.deletedAt)),
    )
    .returning();
  return row ?? null;
}

// ---- Chairs ----
export const listSillones = (tx: Tx, clinicaId: string) =>
  tx
    .select({ id: sillones.id, nombre: sillones.nombre, sedeId: sillones.sedeId })
    .from(sillones)
    .where(and(eq(sillones.clinicaId, clinicaId), isNull(sillones.deletedAt)))
    .orderBy(asc(sillones.nombre));

export async function findSede(tx: Tx, clinicaId: string, sedeId: string) {
  const [row] = await tx
    .select({ id: sedes.id })
    .from(sedes)
    .where(and(eq(sedes.clinicaId, clinicaId), eq(sedes.id, sedeId), isNull(sedes.deletedAt)));
  return row ?? null;
}

/** First sede of the clinic, created on demand ("Sede principal") so chairs can be added right away. */
export async function ensureDefaultSede(tx: Tx, clinicaId: string): Promise<string> {
  const [existing] = await tx
    .select({ id: sedes.id })
    .from(sedes)
    .where(and(eq(sedes.clinicaId, clinicaId), isNull(sedes.deletedAt)))
    .orderBy(asc(sedes.createdAt))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(sedes)
    .values({ clinicaId, nombre: 'Sede principal' })
    .returning({ id: sedes.id });
  return created!.id;
}

export async function insertSillon(tx: Tx, clinicaId: string, sedeId: string, nombre: string) {
  const [row] = await tx
    .insert(sillones)
    .values({ clinicaId, sedeId, nombre })
    .returning({ id: sillones.id, nombre: sillones.nombre, sedeId: sillones.sedeId });
  return row!;
}

// ---- Professionals ----
export async function listProfesionales(tx: Tx, clinicaId: string, userId: string) {
  const rows = await tx
    .select({ p: profesionales, membresiaUserId: membresias.userId })
    .from(profesionales)
    .leftJoin(
      membresias,
      and(eq(membresias.clinicaId, profesionales.clinicaId), eq(membresias.id, profesionales.membresiaId)),
    )
    .where(and(eq(profesionales.clinicaId, clinicaId), isNull(profesionales.deletedAt)))
    .orderBy(asc(profesionales.nombre));
  return rows.map(({ p, membresiaUserId }) => ({ ...p, esYo: membresiaUserId === userId }));
}

export async function insertProfesional(tx: Tx, clinicaId: string, v: typeof profesionales.$inferInsert) {
  const [row] = await tx.insert(profesionales).values({ ...v, clinicaId }).returning();
  return row!;
}

export async function updateProfesional(
  tx: Tx,
  clinicaId: string,
  id: string,
  v: Partial<typeof profesionales.$inferInsert> & { horarios?: Horarios },
) {
  const [row] = await tx
    .update(profesionales)
    .set({ ...v, updatedAt: new Date() })
    .where(and(eq(profesionales.clinicaId, clinicaId), eq(profesionales.id, id), isNull(profesionales.deletedAt)))
    .returning();
  return row ?? null;
}
