import { z } from 'zod';
import type { Database } from '@odontotrust/db';
import {
  CLINICAL_FIELDS,
  can,
  type Cobertura,
  type Page,
  type PacienteCreate,
  type PacienteDto,
  type PacienteListItem,
  type PacienteUpdate,
  type TurnoResumen,
} from '@odontotrust/shared';
import type { AuthContext } from '../api/auth';
import { HttpError, forbidden } from '../api/errors';
import { audit } from '../audit';
import * as repo from './repository';

const notFound = () => new HttpError(404, 'not_found', 'Paciente no encontrado');
const cursorSchema = z.tuple([z.string(), z.string(), z.string().uuid()]);

const encodeCursor = (c: repo.Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string): repo.Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
  } catch {
    throw new HttpError(400, 'invalid_cursor', 'Cursor inválido');
  }
}

const isUniqueViolation = (e: unknown) =>
  (e as { cause?: { code?: string } })?.cause?.code === '23505';
const dniDuplicado = () => new HttpError(409, 'dni_duplicado', 'Ya existe un paciente con ese DNI');

function toDto(
  { paciente: p, cobertura: c }: NonNullable<Awaited<ReturnType<typeof repo.get>>>,
  ctx: AuthContext,
): PacienteDto {
  const dto: PacienteDto = {
    id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    dni: p.dni,
    fechaNacimiento: p.fechaNacimiento,
    celular: p.celular,
    email: p.email,
    domicilio: p.domicilio,
    notas: p.notas,
    cobertura: c ? { obraSocial: c.obraSocial, plan: c.plan, nroAfiliado: c.nroAfiliado } : null,
  };
  // Field-level access: recepcion never receives clinical fields.
  if (can(ctx.rol, 'clinico:read')) {
    dto.antecedentes = p.antecedentes;
    dto.alergias = p.alergias;
  }
  return dto;
}

function assertClinicalWriteAllowed(input: PacienteCreate | PacienteUpdate, ctx: AuthContext) {
  const touchesClinical = CLINICAL_FIELDS.some((f) => f in input && input[f] !== undefined);
  if (touchesClinical && !can(ctx.rol, 'clinico:write')) throw forbidden();
}

function splitInput<T extends PacienteCreate | PacienteUpdate>(input: T) {
  const { cobertura, ...fields } = input;
  return { cobertura, fields };
}

export function createPacientesService(database: Database) {
  return {
    async list(ctx: AuthContext, query: { q?: string; cursor?: string; limit: number }): Promise<Page<PacienteListItem>> {
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await database.withTenant(
        ctx.clinicaId,
        (tx) => repo.list(tx, ctx.clinicaId, { q: query.q, cursor, limit: query.limit }),
        ctx.userId,
      );
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      const nextCursor =
        rows.length > query.limit && last
          ? encodeCursor([last.apellido.toLowerCase(), last.nombre.toLowerCase(), last.id])
          : null;
      return { items, nextCursor };
    },

    async get(ctx: AuthContext, id: string): Promise<PacienteDto> {
      return database.withTenant(
        ctx.clinicaId,
        async (tx) => {
          const row = await repo.get(tx, ctx.clinicaId, id);
          if (!row) throw notFound();
          await audit(tx, ctx, { entidad: 'pacientes', entidadId: id, accion: 'view' });
          return toDto(row, ctx);
        },
        ctx.userId,
      );
    },

    async create(ctx: AuthContext, input: PacienteCreate): Promise<PacienteDto> {
      assertClinicalWriteAllowed(input, ctx);
      const { cobertura, fields } = splitInput(input);
      try {
        return await database.withTenant(
          ctx.clinicaId,
          async (tx) => {
            const id = await repo.insert(tx, ctx.clinicaId, fields);
            if (cobertura) await repo.upsertCobertura(tx, ctx.clinicaId, id, normalizeCobertura(cobertura));
            await audit(tx, ctx, {
              entidad: 'pacientes',
              entidadId: id,
              accion: 'create',
              metadata: { campos: Object.keys(input) },
            });
            const row = await repo.get(tx, ctx.clinicaId, id);
            return toDto(row!, ctx);
          },
          ctx.userId,
        );
      } catch (e) {
        if (isUniqueViolation(e)) throw dniDuplicado();
        throw e;
      }
    },

    async update(ctx: AuthContext, id: string, input: PacienteUpdate): Promise<PacienteDto> {
      assertClinicalWriteAllowed(input, ctx);
      const { cobertura, fields } = splitInput(input);
      try {
        return await database.withTenant(
          ctx.clinicaId,
          async (tx) => {
            if (!(await repo.get(tx, ctx.clinicaId, id))) throw notFound();
            if (Object.keys(fields).length > 0) await repo.update(tx, ctx.clinicaId, id, fields);
            if (cobertura === null) await repo.removeCobertura(tx, ctx.clinicaId, id);
            else if (cobertura) await repo.upsertCobertura(tx, ctx.clinicaId, id, normalizeCobertura(cobertura));
            await audit(tx, ctx, {
              entidad: 'pacientes',
              entidadId: id,
              accion: 'update',
              metadata: { campos: Object.keys(input) },
            });
            const row = await repo.get(tx, ctx.clinicaId, id);
            return toDto(row!, ctx);
          },
          ctx.userId,
        );
      } catch (e) {
        if (isUniqueViolation(e)) throw dniDuplicado();
        throw e;
      }
    },

    async remove(ctx: AuthContext, id: string): Promise<void> {
      await database.withTenant(
        ctx.clinicaId,
        async (tx) => {
          if (!(await repo.softDelete(tx, ctx.clinicaId, id))) throw notFound();
          await audit(tx, ctx, { entidad: 'pacientes', entidadId: id, accion: 'delete' });
        },
        ctx.userId,
      );
    },

    async turnos(ctx: AuthContext, id: string): Promise<TurnoResumen[]> {
      return database.withTenant(
        ctx.clinicaId,
        async (tx) => {
          if (!(await repo.get(tx, ctx.clinicaId, id))) throw notFound();
          const rows = await repo.turnosDe(tx, ctx.clinicaId, id, 50);
          return rows.map((r) => ({
            id: r.id,
            inicio: r.inicio.toISOString(),
            fin: r.fin.toISOString(),
            estado: r.estado,
            profesional: r.profesional,
            tipoTratamiento: r.tipoTratamiento,
          }));
        },
        ctx.userId,
      );
    },
  };
}

function normalizeCobertura(c: { obraSocial: string; plan?: string | null; nroAfiliado?: string | null }): Cobertura {
  return { obraSocial: c.obraSocial, plan: c.plan ?? null, nroAfiliado: c.nroAfiliado ?? null };
}

export type PacientesService = ReturnType<typeof createPacientesService>;
