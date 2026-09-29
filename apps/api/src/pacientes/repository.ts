import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  coberturas,
  pacientes,
  profesionales,
  tiposTratamiento,
  turnos,
} from '@odontotrust/db';
import type { Cobertura } from '@odontotrust/shared';
import type { Tx } from '../db-types';

// Second layer of isolation: every query filters by clinica_id even though RLS already does.

export type PacienteRow = typeof pacientes.$inferSelect;
export type Cursor = [apellido: string, nombre: string, id: string];

const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

function searchConditions(q: string | undefined): SQL[] {
  const conds: SQL[] = [];
  for (const token of (q ?? '').split(/\s+/).filter(Boolean)) {
    const digits = token.replace(/\D/g, '');
    const byNumber =
      digits.length >= 3
        ? [
            ilike(pacientes.dni, like(digits)),
            sql`regexp_replace(${pacientes.celular}, '[^0-9]', '', 'g') like ${like(digits)}`,
          ]
        : [];
    const cond = or(
      ilike(pacientes.nombre, like(token)),
      ilike(pacientes.apellido, like(token)),
      ...byNumber,
    );
    if (cond) conds.push(cond);
  }
  return conds;
}

export async function list(
  tx: Tx,
  clinicaId: string,
  opts: { q?: string; cursor?: Cursor; limit: number },
) {
  const lowerApellido = sql`lower(${pacientes.apellido})`;
  const lowerNombre = sql`lower(${pacientes.nombre})`;
  const after = opts.cursor
    ? sql`(${lowerApellido}, ${lowerNombre}, ${pacientes.id}) > (${opts.cursor[0]}, ${opts.cursor[1]}, ${opts.cursor[2]}::uuid)`
    : undefined;

  return tx
    .select({
      id: pacientes.id,
      nombre: pacientes.nombre,
      apellido: pacientes.apellido,
      dni: pacientes.dni,
      celular: pacientes.celular,
    })
    .from(pacientes)
    .where(
      and(
        eq(pacientes.clinicaId, clinicaId),
        isNull(pacientes.deletedAt),
        ...searchConditions(opts.q),
        after,
      ),
    )
    .orderBy(asc(lowerApellido), asc(lowerNombre), asc(pacientes.id))
    .limit(opts.limit + 1);
}

export async function get(tx: Tx, clinicaId: string, id: string) {
  const rows = await tx
    .select({ paciente: pacientes, cobertura: coberturas })
    .from(pacientes)
    .leftJoin(
      coberturas,
      and(
        eq(coberturas.clinicaId, pacientes.clinicaId),
        eq(coberturas.pacienteId, pacientes.id),
        isNull(coberturas.deletedAt),
      ),
    )
    .where(and(eq(pacientes.clinicaId, clinicaId), eq(pacientes.id, id), isNull(pacientes.deletedAt)));
  return rows[0] ?? null;
}

export async function insert(tx: Tx, clinicaId: string, values: Partial<PacienteRow> & { nombre: string; apellido: string }) {
  const [row] = await tx
    .insert(pacientes)
    .values({ ...values, clinicaId })
    .returning({ id: pacientes.id });
  return row!.id;
}

export async function update(tx: Tx, clinicaId: string, id: string, values: Partial<PacienteRow>) {
  await tx
    .update(pacientes)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(pacientes.clinicaId, clinicaId), eq(pacientes.id, id), isNull(pacientes.deletedAt)));
}

export async function softDelete(tx: Tx, clinicaId: string, id: string) {
  const rows = await tx
    .update(pacientes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pacientes.clinicaId, clinicaId), eq(pacientes.id, id), isNull(pacientes.deletedAt)))
    .returning({ id: pacientes.id });
  return rows.length > 0;
}

export async function upsertCobertura(tx: Tx, clinicaId: string, pacienteId: string, c: Cobertura) {
  const values = { obraSocial: c.obraSocial, plan: c.plan, nroAfiliado: c.nroAfiliado };
  await tx
    .insert(coberturas)
    .values({ clinicaId, pacienteId, ...values })
    .onConflictDoUpdate({
      target: [coberturas.clinicaId, coberturas.pacienteId],
      set: { ...values, deletedAt: null, updatedAt: new Date() },
    });
}

export async function removeCobertura(tx: Tx, clinicaId: string, pacienteId: string) {
  await tx
    .update(coberturas)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(coberturas.clinicaId, clinicaId),
        eq(coberturas.pacienteId, pacienteId),
        isNull(coberturas.deletedAt),
      ),
    );
}

export async function turnosDe(tx: Tx, clinicaId: string, pacienteId: string, limit: number) {
  return tx
    .select({
      id: turnos.id,
      inicio: turnos.inicio,
      fin: turnos.fin,
      estado: turnos.estado,
      profesional: profesionales.nombre,
      tipoTratamiento: tiposTratamiento.nombre,
    })
    .from(turnos)
    .innerJoin(
      profesionales,
      and(eq(profesionales.clinicaId, turnos.clinicaId), eq(profesionales.id, turnos.profesionalId)),
    )
    .leftJoin(
      tiposTratamiento,
      and(
        eq(tiposTratamiento.clinicaId, turnos.clinicaId),
        eq(tiposTratamiento.id, turnos.tipoTratamientoId),
      ),
    )
    .where(
      and(eq(turnos.clinicaId, clinicaId), eq(turnos.pacienteId, pacienteId), isNull(turnos.deletedAt)),
    )
    .orderBy(desc(turnos.inicio))
    .limit(limit);
}
