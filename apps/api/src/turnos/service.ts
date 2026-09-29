import type { Database } from '@odontotrust/db';
import {
  MAX_TURNO_MINUTES,
  dentroDeHorario,
  horariosSchema,
  type TurnoCreate,
  type TurnoDto,
  type TurnoEstado,
  type TurnoUpdate,
} from '@odontotrust/shared';
import type { AuthContext } from '../api/auth';
import { HttpError } from '../api/errors';
import { conflict, notFound, pgCode, pgConstraint } from '../api/http';
import { audit } from '../audit';
import * as bloqueos from '../bloqueos/repository';
import type { Tx } from '../db-types';
import * as repo from './repository';

const invalidRef = (what: string) => new HttpError(400, 'referencia_invalida', `${what} no encontrado`);

function toDto({ t, paciente, profesional, sillon, tipo }: repo.TurnoDetailRow): TurnoDto {
  return {
    id: t.id,
    inicio: t.inicio.toISOString(),
    fin: t.fin.toISOString(),
    estado: t.estado as TurnoEstado,
    notas: t.notas,
    paciente,
    profesional,
    sillon,
    tipoTratamiento: tipo,
  };
}

/** Maps the Postgres exclusion violation (23P01) to a domain conflict. */
function mapOverlap(e: unknown): never {
  if (pgCode(e) === '23P01') {
    if (pgConstraint(e) === 'turnos_no_overlap_sillon') {
      throw conflict('turno_solapado_sillon', 'El sillón ya está ocupado en ese horario');
    }
    throw conflict('turno_solapado_profesional', 'El profesional ya tiene un turno en ese horario');
  }
  throw e;
}

function checkSpan(inicio: Date, fin: Date) {
  if (fin <= inicio) throw new HttpError(400, 'validation_error', 'fin: debe ser posterior al inicio');
  if (fin.getTime() - inicio.getTime() > MAX_TURNO_MINUTES * 60_000) {
    throw new HttpError(400, 'validation_error', `fin: un turno no puede durar más de ${MAX_TURNO_MINUTES / 60} horas`);
  }
}

export function createTurnosService(database: Database) {
  const inTenant = <T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>) =>
    database.withTenant(ctx.clinicaId, fn, ctx.userId);

  /** Blocks always reject; working hours reject unless the caller explicitly confirms a sobreturno. */
  async function assertDisponible(
    tx: Tx,
    ctx: AuthContext,
    p: { profesional: { id: string; horarios: unknown }; inicio: Date; fin: Date; sobreturno?: boolean },
  ) {
    const blocks = await bloqueos.overlapping(tx, ctx.clinicaId, p.inicio, p.fin, p.profesional.id);
    if (blocks.length > 0) throw conflict('bloqueado', 'El horario está bloqueado');
    if (!p.sobreturno) {
      const horarios = horariosSchema.safeParse(p.profesional.horarios);
      const tz = await repo.clinicTimeZone(tx, ctx.clinicaId);
      if (horarios.success && !dentroDeHorario(horarios.data, p.inicio, p.fin, tz)) {
        throw conflict('fuera_de_horario', 'Fuera del horario de atención del profesional');
      }
    }
  }

  async function loadOrFail(tx: Tx, ctx: AuthContext, id: string): Promise<TurnoDto> {
    const row = await repo.getDetail(tx, ctx.clinicaId, id);
    if (!row) throw notFound('Turno');
    return toDto(row);
  }

  return {
    async list(ctx: AuthContext, q: { desde: string; hasta: string; profesionalId?: string }): Promise<TurnoDto[]> {
      const rows = await inTenant(ctx, (tx) =>
        repo.listRange(tx, ctx.clinicaId, new Date(q.desde), new Date(q.hasta), q.profesionalId),
      );
      return rows.map(toDto);
    },

    get(ctx: AuthContext, id: string): Promise<TurnoDto> {
      return inTenant(ctx, (tx) => loadOrFail(tx, ctx, id));
    },

    async create(ctx: AuthContext, input: TurnoCreate): Promise<TurnoDto> {
      try {
        return await inTenant(ctx, async (tx) => {
          const [paciente, profesional, sillon, tipo] = await Promise.all([
            repo.findPaciente(tx, ctx.clinicaId, input.pacienteId),
            repo.findProfesional(tx, ctx.clinicaId, input.profesionalId),
            input.sillonId ? repo.findSillon(tx, ctx.clinicaId, input.sillonId) : null,
            input.tipoTratamientoId ? repo.findTipo(tx, ctx.clinicaId, input.tipoTratamientoId) : null,
          ]);
          if (!paciente) throw invalidRef('Paciente');
          if (!profesional) throw invalidRef('Profesional');
          if (input.sillonId && !sillon) throw invalidRef('Sillón');
          if (input.tipoTratamientoId && !tipo) throw invalidRef('Tipo de tratamiento');

          const inicio = new Date(input.inicio);
          const fin = input.fin ? new Date(input.fin) : new Date(inicio.getTime() + tipo!.duracionMinutos * 60_000);
          checkSpan(inicio, fin);
          await assertDisponible(tx, ctx, { profesional, inicio, fin, sobreturno: input.sobreturno });

          const id = await repo.insert(tx, ctx.clinicaId, {
            pacienteId: input.pacienteId,
            profesionalId: input.profesionalId,
            sillonId: input.sillonId ?? null,
            tipoTratamientoId: input.tipoTratamientoId ?? null,
            inicio,
            fin,
            notas: input.notas ?? null,
          });
          await audit(tx, ctx, {
            entidad: 'turnos',
            entidadId: id,
            accion: 'create',
            metadata: { sobreturno: Boolean(input.sobreturno) },
          });
          return loadOrFail(tx, ctx, id);
        });
      } catch (e) {
        return mapOverlap(e);
      }
    },

    async update(ctx: AuthContext, id: string, input: TurnoUpdate): Promise<TurnoDto> {
      try {
        return await inTenant(ctx, async (tx) => {
          const current = await repo.getRow(tx, ctx.clinicaId, id);
          if (!current) throw notFound('Turno');

          const profesionalId = input.profesionalId ?? current.profesionalId;
          const inicio = input.inicio ? new Date(input.inicio) : current.inicio;
          let fin = input.fin ? new Date(input.fin) : current.fin;
          // Moving without an explicit end keeps the duration (drag & drop sends both, forms may not).
          if (input.inicio && !input.fin) fin = new Date(inicio.getTime() + (current.fin.getTime() - current.inicio.getTime()));
          checkSpan(inicio, fin);

          const [profesional, paciente, sillon, tipo] = await Promise.all([
            repo.findProfesional(tx, ctx.clinicaId, profesionalId),
            input.pacienteId ? repo.findPaciente(tx, ctx.clinicaId, input.pacienteId) : true,
            input.sillonId ? repo.findSillon(tx, ctx.clinicaId, input.sillonId) : true,
            input.tipoTratamientoId ? repo.findTipo(tx, ctx.clinicaId, input.tipoTratamientoId) : true,
          ]);
          if (!profesional) throw invalidRef('Profesional');
          if (!paciente) throw invalidRef('Paciente');
          if (!sillon) throw invalidRef('Sillón');
          if (!tipo) throw invalidRef('Tipo de tratamiento');

          const timeOrProfChanged =
            inicio.getTime() !== current.inicio.getTime() ||
            fin.getTime() !== current.fin.getTime() ||
            profesionalId !== current.profesionalId;
          const reactivated = current.estado === 'cancelado' && input.estado && input.estado !== 'cancelado';
          if ((timeOrProfChanged || reactivated) && (input.estado ?? current.estado) !== 'cancelado') {
            await assertDisponible(tx, ctx, { profesional, inicio, fin, sobreturno: input.sobreturno });
          }

          // `sobreturno` is a request flag, not a column.
          const fields = { ...input };
          delete fields.sobreturno;
          await repo.update(tx, ctx.clinicaId, id, { ...fields, profesionalId, inicio, fin });
          await audit(tx, ctx, {
            entidad: 'turnos',
            entidadId: id,
            accion: 'update',
            metadata: { campos: Object.keys(fields), ...(input.estado && { estado: input.estado }) },
          });
          return loadOrFail(tx, ctx, id);
        });
      } catch (e) {
        return mapOverlap(e);
      }
    },
  };
}
