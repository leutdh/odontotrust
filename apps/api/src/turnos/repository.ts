import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm';
import {
  clinicas,
  pacientes,
  profesionales,
  sillones,
  tiposTratamiento,
  turnos,
} from '@odontotrust/db';
import type { Tx } from '../db-types';

export type TurnoRow = typeof turnos.$inferSelect;

// Every query filters by clinica_id even though RLS already does (second layer).

const detailed = (tx: Tx) =>
  tx
    .select({
      t: turnos,
      paciente: {
        id: pacientes.id,
        nombre: pacientes.nombre,
        apellido: pacientes.apellido,
        celular: pacientes.celular,
      },
      profesional: { id: profesionales.id, nombre: profesionales.nombre, color: profesionales.color },
      sillon: { id: sillones.id, nombre: sillones.nombre },
      tipo: { id: tiposTratamiento.id, nombre: tiposTratamiento.nombre },
    })
    .from(turnos)
    .innerJoin(pacientes, and(eq(pacientes.clinicaId, turnos.clinicaId), eq(pacientes.id, turnos.pacienteId)))
    .innerJoin(
      profesionales,
      and(eq(profesionales.clinicaId, turnos.clinicaId), eq(profesionales.id, turnos.profesionalId)),
    )
    .leftJoin(sillones, and(eq(sillones.clinicaId, turnos.clinicaId), eq(sillones.id, turnos.sillonId)))
    .leftJoin(
      tiposTratamiento,
      and(eq(tiposTratamiento.clinicaId, turnos.clinicaId), eq(tiposTratamiento.id, turnos.tipoTratamientoId)),
    );

export type TurnoDetailRow = Awaited<ReturnType<typeof listRange>>[number];

export function listRange(tx: Tx, clinicaId: string, desde: Date, hasta: Date, profesionalId?: string) {
  return detailed(tx)
    .where(
      and(
        eq(turnos.clinicaId, clinicaId),
        isNull(turnos.deletedAt),
        lt(turnos.inicio, hasta),
        gt(turnos.fin, desde),
        profesionalId ? eq(turnos.profesionalId, profesionalId) : undefined,
      ),
    )
    .orderBy(asc(turnos.inicio), asc(turnos.id));
}

export async function getDetail(tx: Tx, clinicaId: string, id: string) {
  const rows = await detailed(tx).where(
    and(eq(turnos.clinicaId, clinicaId), eq(turnos.id, id), isNull(turnos.deletedAt)),
  );
  return rows[0] ?? null;
}

export async function getRow(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select()
    .from(turnos)
    .where(and(eq(turnos.clinicaId, clinicaId), eq(turnos.id, id), isNull(turnos.deletedAt)));
  return row ?? null;
}

export async function insert(tx: Tx, clinicaId: string, v: Omit<typeof turnos.$inferInsert, 'clinicaId'>) {
  const [row] = await tx.insert(turnos).values({ ...v, clinicaId }).returning({ id: turnos.id });
  return row!.id;
}

export async function update(tx: Tx, clinicaId: string, id: string, v: Partial<typeof turnos.$inferInsert>) {
  await tx
    .update(turnos)
    .set({ ...v, updatedAt: new Date() })
    .where(and(eq(turnos.clinicaId, clinicaId), eq(turnos.id, id), isNull(turnos.deletedAt)));
}

// ---- Reference lookups (existence within the tenant, not soft-deleted) ----
export async function clinicTimeZone(tx: Tx, clinicaId: string): Promise<string> {
  const [row] = await tx.select({ tz: clinicas.zonaHoraria }).from(clinicas).where(eq(clinicas.id, clinicaId));
  return row?.tz ?? 'America/Argentina/Buenos_Aires';
}

export async function findPaciente(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select({ id: pacientes.id })
    .from(pacientes)
    .where(and(eq(pacientes.clinicaId, clinicaId), eq(pacientes.id, id), isNull(pacientes.deletedAt)));
  return row ?? null;
}

export async function findProfesional(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select({ id: profesionales.id, horarios: profesionales.horarios })
    .from(profesionales)
    .where(and(eq(profesionales.clinicaId, clinicaId), eq(profesionales.id, id), isNull(profesionales.deletedAt)));
  return row ?? null;
}

export async function findSillon(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select({ id: sillones.id })
    .from(sillones)
    .where(and(eq(sillones.clinicaId, clinicaId), eq(sillones.id, id), isNull(sillones.deletedAt)));
  return row ?? null;
}

export async function findTipo(tx: Tx, clinicaId: string, id: string) {
  const [row] = await tx
    .select({ id: tiposTratamiento.id, duracionMinutos: tiposTratamiento.duracionMinutos })
    .from(tiposTratamiento)
    .where(
      and(eq(tiposTratamiento.clinicaId, clinicaId), eq(tiposTratamiento.id, id), isNull(tiposTratamiento.deletedAt)),
    );
  return row ?? null;
}
