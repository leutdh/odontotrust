import { and, desc, eq, sql } from 'drizzle-orm';
import { clinicas, recordatorios } from '@odontotrust/db';
import type { Tx } from '../db-types';

export async function getClinica(tx: Tx, clinicaId: string) {
  const [row] = await tx
    .select({ nombre: clinicas.nombre, zonaHoraria: clinicas.zonaHoraria, configuracion: clinicas.configuracion })
    .from(clinicas)
    .where(eq(clinicas.id, clinicaId));
  return row ?? null;
}

/** Merges one key into the clinic's `configuracion` jsonb without touching the rest. */
export async function setPlantilla(tx: Tx, clinicaId: string, plantilla: string) {
  await tx
    .update(clinicas)
    .set({
      configuracion: sql`${clinicas.configuracion} || jsonb_build_object('plantillaRecordatorio', ${plantilla}::text)`,
      updatedAt: new Date(),
    })
    .where(eq(clinicas.id, clinicaId));
}

export async function insert(
  tx: Tx,
  clinicaId: string,
  v: Omit<typeof recordatorios.$inferInsert, 'clinicaId'>,
) {
  const [row] = await tx.insert(recordatorios).values({ ...v, clinicaId }).returning({ id: recordatorios.id });
  return row!.id;
}

export function listByTurno(tx: Tx, clinicaId: string, turnoId: string) {
  return tx
    .select({
      id: recordatorios.id,
      canal: recordatorios.canal,
      estado: recordatorios.estado,
      creadoAt: recordatorios.createdAt,
    })
    .from(recordatorios)
    .where(and(eq(recordatorios.clinicaId, clinicaId), eq(recordatorios.turnoId, turnoId)))
    .orderBy(desc(recordatorios.createdAt));
}
