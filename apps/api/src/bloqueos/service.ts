import { and, eq, isNull } from 'drizzle-orm';
import { profesionales, type Database } from '@odontotrust/db';
import type { BloqueoCreate, BloqueoDto, BloqueoUpdate } from '@odontotrust/shared';
import type { AuthContext } from '../api/auth';
import { HttpError } from '../api/errors';
import { notFound } from '../api/http';
import { audit } from '../audit';
import type { Tx } from '../db-types';
import * as repo from './repository';

const toDto = (b: repo.BloqueoRow): BloqueoDto => ({
  id: b.id,
  profesionalId: b.profesionalId,
  inicio: b.inicio.toISOString(),
  fin: b.fin.toISOString(),
  motivo: b.motivo,
});

async function assertProfesional(tx: Tx, clinicaId: string, id: string | null | undefined) {
  if (!id) return;
  const [row] = await tx
    .select({ id: profesionales.id })
    .from(profesionales)
    .where(and(eq(profesionales.clinicaId, clinicaId), eq(profesionales.id, id), isNull(profesionales.deletedAt)));
  if (!row) throw new HttpError(400, 'referencia_invalida', 'Profesional no encontrado');
}

export function createBloqueosService(database: Database) {
  const inTenant = <T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>) =>
    database.withTenant(ctx.clinicaId, fn, ctx.userId);

  return {
    async list(ctx: AuthContext, q: { desde: string; hasta: string; profesionalId?: string }): Promise<BloqueoDto[]> {
      const rows = await inTenant(ctx, (tx) =>
        repo.overlapping(tx, ctx.clinicaId, new Date(q.desde), new Date(q.hasta), q.profesionalId),
      );
      return rows.map(toDto);
    },

    create(ctx: AuthContext, input: BloqueoCreate): Promise<BloqueoDto> {
      return inTenant(ctx, async (tx) => {
        await assertProfesional(tx, ctx.clinicaId, input.profesionalId);
        const row = await repo.insert(tx, ctx.clinicaId, {
          profesionalId: input.profesionalId ?? null,
          inicio: new Date(input.inicio),
          fin: new Date(input.fin),
          motivo: input.motivo ?? null,
        });
        await audit(tx, ctx, { entidad: 'bloqueos', entidadId: row.id, accion: 'create' });
        return toDto(row);
      });
    },

    update(ctx: AuthContext, id: string, input: BloqueoUpdate): Promise<BloqueoDto> {
      return inTenant(ctx, async (tx) => {
        const current = await repo.get(tx, ctx.clinicaId, id);
        if (!current) throw notFound('Bloqueo');
        await assertProfesional(tx, ctx.clinicaId, input.profesionalId);
        const inicio = input.inicio ? new Date(input.inicio) : current.inicio;
        const fin = input.fin ? new Date(input.fin) : current.fin;
        if (fin <= inicio) throw new HttpError(400, 'validation_error', 'fin: debe ser posterior al inicio');
        const row = await repo.update(tx, ctx.clinicaId, id, {
          ...(input.profesionalId !== undefined && { profesionalId: input.profesionalId }),
          ...(input.motivo !== undefined && { motivo: input.motivo }),
          inicio,
          fin,
        });
        await audit(tx, ctx, {
          entidad: 'bloqueos',
          entidadId: id,
          accion: 'update',
          metadata: { campos: Object.keys(input) },
        });
        return toDto(row!);
      });
    },

    remove(ctx: AuthContext, id: string): Promise<void> {
      return inTenant(ctx, async (tx) => {
        if (!(await repo.softDelete(tx, ctx.clinicaId, id))) throw notFound('Bloqueo');
        await audit(tx, ctx, { entidad: 'bloqueos', entidadId: id, accion: 'delete' });
      });
    },
  };
}
