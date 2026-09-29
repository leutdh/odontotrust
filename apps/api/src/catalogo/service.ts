import type { z } from 'zod';
import type { Database } from '@odontotrust/db';
import {
  horariosSchema,
  type ProfesionalDto,
  type SillonDto,
  type TipoTratamientoDto,
  type profesionalCreateSchema,
  type profesionalUpdateSchema,
  type tipoTratamientoCreateSchema,
  type tipoTratamientoUpdateSchema,
} from '@odontotrust/shared';
import type { AuthContext } from '../api/auth';
import { notFound } from '../api/http';
import { audit } from '../audit';
import type { Tx } from '../db-types';
import * as repo from './repository';

type Tipo = Awaited<ReturnType<typeof repo.insertTipo>>;
type Prof = Awaited<ReturnType<typeof repo.listProfesionales>>[number];

const tipoDto = (t: Tipo): TipoTratamientoDto => ({
  id: t.id,
  nombre: t.nombre,
  duracionMinutos: t.duracionMinutos,
  precioBaseCentavos: t.precioBaseCentavos,
  activo: t.activo,
});

// `horarios` is jsonb: re-validate on the way out so a bad legacy value can't break the agenda.
const profDto = (p: Prof): ProfesionalDto => {
  const horarios = horariosSchema.safeParse(p.horarios);
  return {
    id: p.id,
    nombre: p.nombre,
    matricula: p.matricula,
    especialidad: p.especialidad,
    color: p.color,
    horarios: horarios.success ? horarios.data : {},
    esYo: p.esYo,
  };
};

async function profesionalById(tx: Tx, ctx: AuthContext, id: string): Promise<ProfesionalDto> {
  const all = await repo.listProfesionales(tx, ctx.clinicaId, ctx.userId);
  const found = all.find((p) => p.id === id);
  if (!found) throw notFound('Profesional');
  return profDto(found);
}

export function createCatalogoService(database: Database) {
  const inTenant = <T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>) =>
    database.withTenant(ctx.clinicaId, fn, ctx.userId);

  return {
    async listTipos(ctx: AuthContext): Promise<TipoTratamientoDto[]> {
      return (await inTenant(ctx, (tx) => repo.listTipos(tx, ctx.clinicaId))).map(tipoDto);
    },

    createTipo(ctx: AuthContext, input: z.infer<typeof tipoTratamientoCreateSchema>): Promise<TipoTratamientoDto> {
      return inTenant(ctx, async (tx) => {
        const row = await repo.insertTipo(tx, ctx.clinicaId, { ...input, clinicaId: ctx.clinicaId });
        await audit(tx, ctx, { entidad: 'tipos_tratamiento', entidadId: row.id, accion: 'create' });
        return tipoDto(row);
      });
    },

    updateTipo(ctx: AuthContext, id: string, input: z.infer<typeof tipoTratamientoUpdateSchema>): Promise<TipoTratamientoDto> {
      return inTenant(ctx, async (tx) => {
        const row = await repo.updateTipo(tx, ctx.clinicaId, id, input);
        if (!row) throw notFound('Tipo de tratamiento');
        await audit(tx, ctx, {
          entidad: 'tipos_tratamiento',
          entidadId: id,
          accion: 'update',
          metadata: { campos: Object.keys(input) },
        });
        return tipoDto(row);
      });
    },

    listSillones(ctx: AuthContext): Promise<SillonDto[]> {
      return inTenant(ctx, (tx) => repo.listSillones(tx, ctx.clinicaId));
    },

    createSillon(ctx: AuthContext, input: { nombre: string; sedeId?: string }): Promise<SillonDto> {
      return inTenant(ctx, async (tx) => {
        let sedeId = input.sedeId;
        if (sedeId) {
          if (!(await repo.findSede(tx, ctx.clinicaId, sedeId))) throw notFound('Sede');
        } else {
          sedeId = await repo.ensureDefaultSede(tx, ctx.clinicaId);
        }
        const row = await repo.insertSillon(tx, ctx.clinicaId, sedeId, input.nombre);
        await audit(tx, ctx, { entidad: 'sillones', entidadId: row.id, accion: 'create' });
        return row;
      });
    },

    async listProfesionales(ctx: AuthContext): Promise<ProfesionalDto[]> {
      return (await inTenant(ctx, (tx) => repo.listProfesionales(tx, ctx.clinicaId, ctx.userId))).map(profDto);
    },

    createProfesional(ctx: AuthContext, input: z.infer<typeof profesionalCreateSchema>): Promise<ProfesionalDto> {
      return inTenant(ctx, async (tx) => {
        const row = await repo.insertProfesional(tx, ctx.clinicaId, {
          ...input,
          horarios: input.horarios ?? {},
          clinicaId: ctx.clinicaId,
        });
        await audit(tx, ctx, { entidad: 'profesionales', entidadId: row.id, accion: 'create' });
        return profesionalById(tx, ctx, row.id);
      });
    },

    updateProfesional(ctx: AuthContext, id: string, input: z.infer<typeof profesionalUpdateSchema>): Promise<ProfesionalDto> {
      return inTenant(ctx, async (tx) => {
        const row = await repo.updateProfesional(tx, ctx.clinicaId, id, input);
        if (!row) throw notFound('Profesional');
        await audit(tx, ctx, {
          entidad: 'profesionales',
          entidadId: id,
          accion: 'update',
          metadata: { campos: Object.keys(input) },
        });
        return profesionalById(tx, ctx, id);
      });
    },
  };
}
