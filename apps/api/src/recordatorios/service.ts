import type { Database } from '@odontotrust/db';
import {
  DEFAULT_PLANTILLA_RECORDATORIO,
  PLANTILLA_VARIABLES,
  formatFechaLarga,
  formatHora,
  plantillaSchema,
  renderPlantilla,
  toWhatsAppNumber,
  type RecordatorioDto,
  type RecordatorioLinkDto,
} from '@odontotrust/shared';
import type { AuthContext } from '../api/auth';
import { HttpError } from '../api/errors';
import { conflict, notFound } from '../api/http';
import { audit } from '../audit';
import type { Tx } from '../db-types';
import * as turnosRepo from '../turnos/repository';
import * as repo from './repository';

// Reminders make no sense once the turno is over or was closed/cancelled.
const NOT_REMINDABLE = new Set(['cancelado', 'atendido', 'ausente']);

function plantillaOf(configuracion: unknown): string {
  const raw = (configuracion as { plantillaRecordatorio?: unknown } | null)?.plantillaRecordatorio;
  const parsed = plantillaSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PLANTILLA_RECORDATORIO;
}

export function createRecordatoriosService(database: Database) {
  const inTenant = <T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>) =>
    database.withTenant(ctx.clinicaId, fn, ctx.userId);

  return {
    getPlantilla(ctx: AuthContext) {
      return inTenant(ctx, async (tx) => {
        const clinica = await repo.getClinica(tx, ctx.clinicaId);
        if (!clinica) throw notFound('Clínica');
        return {
          plantilla: plantillaOf(clinica.configuracion),
          predeterminada: DEFAULT_PLANTILLA_RECORDATORIO,
          variables: [...PLANTILLA_VARIABLES],
        };
      });
    },

    setPlantilla(ctx: AuthContext, plantilla: string) {
      return inTenant(ctx, async (tx) => {
        await repo.setPlantilla(tx, ctx.clinicaId, plantilla);
        await audit(tx, ctx, { entidad: 'clinicas', entidadId: ctx.clinicaId, accion: 'update', metadata: { campos: ['plantillaRecordatorio'] } });
        return { plantilla };
      });
    },

    /** Builds the wa.me link for a turno and logs that staff opened it. */
    generarLink(ctx: AuthContext, turnoId: string): Promise<RecordatorioLinkDto> {
      return inTenant(ctx, async (tx) => {
        const row = await turnosRepo.getDetail(tx, ctx.clinicaId, turnoId);
        if (!row) throw notFound('Turno');
        const { t, paciente, profesional } = row;

        if (NOT_REMINDABLE.has(t.estado) || t.inicio.getTime() < Date.now()) {
          throw conflict('turno_no_recordable', 'Este turno ya no admite recordatorios');
        }
        if (!paciente.celular) throw new HttpError(400, 'sin_celular', 'El paciente no tiene celular cargado');
        const telefono = toWhatsAppNumber(paciente.celular);
        if (!telefono) {
          throw new HttpError(400, 'celular_invalido', 'El celular del paciente no tiene un formato válido para WhatsApp (falta el código de área)');
        }

        const clinica = await repo.getClinica(tx, ctx.clinicaId);
        if (!clinica) throw notFound('Clínica');
        const mensaje = renderPlantilla(plantillaOf(clinica.configuracion), {
          paciente: paciente.nombre,
          fecha: formatFechaLarga(t.inicio, clinica.zonaHoraria),
          hora: formatHora(t.inicio, clinica.zonaHoraria),
          profesional: profesional.nombre,
          clinica: clinica.nombre,
        });

        const recordatorioId = await repo.insert(tx, ctx.clinicaId, {
          turnoId,
          canal: 'whatsapp_link',
          estado: 'abierto',
          enviadoAt: new Date(),
          creadoPor: ctx.userId,
        });
        await audit(tx, ctx, { entidad: 'recordatorios', entidadId: recordatorioId, accion: 'create', metadata: { canal: 'whatsapp_link' } });

        return {
          recordatorioId,
          telefono,
          mensaje,
          url: `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
        };
      });
    },

    listar(ctx: AuthContext, turnoId: string): Promise<RecordatorioDto[]> {
      return inTenant(ctx, async (tx) => {
        if (!(await turnosRepo.getRow(tx, ctx.clinicaId, turnoId))) throw notFound('Turno');
        const rows = await repo.listByTurno(tx, ctx.clinicaId, turnoId);
        return rows.map((r) => ({
          id: r.id,
          canal: r.canal as RecordatorioDto['canal'],
          estado: r.estado as RecordatorioDto['estado'],
          creadoAt: r.creadoAt.toISOString(),
        }));
      });
    },
  };
}
