import { z } from 'zod';
import { hhmmToMinutes, zonedDateKey, zonedParts } from './time';
import { required, text } from './zod-helpers';

export const TURNO_ESTADOS = ['pendiente', 'confirmado', 'atendido', 'ausente', 'cancelado'] as const;
export type TurnoEstado = (typeof TURNO_ESTADOS)[number];

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

// ---- Working hours -------------------------------------------------------------------
// { "1": [["09:00","13:00"],["14:00","18:00"]], ... } keyed by ISO weekday (1 = Monday),
// in the clinic's local time. No entry for a weekday = does not work that day. An EMPTY object
// means "not configured": no restriction.
export const horariosSchema = z
  .record(z.enum(['1', '2', '3', '4', '5', '6', '7']), z.array(z.tuple([hhmm, hhmm])).max(6))
  .superRefine((h, ctx) => {
    for (const [day, ranges] of Object.entries(h)) {
      const sorted = [...ranges].sort((a, b) => hhmmToMinutes(a[0]) - hhmmToMinutes(b[0]));
      sorted.forEach(([from, to], i) => {
        if (hhmmToMinutes(to) <= hhmmToMinutes(from)) {
          ctx.addIssue({ code: 'custom', message: `Día ${day}: el fin debe ser posterior al inicio` });
        }
        const next = sorted[i + 1];
        if (next && hhmmToMinutes(next[0]) < hhmmToMinutes(to)) {
          ctx.addIssue({ code: 'custom', message: `Día ${day}: franjas superpuestas` });
        }
      });
    }
  });
export type Horarios = z.infer<typeof horariosSchema>;

/** True if [inicio, fin) fits inside a single working range of that local day. */
export function dentroDeHorario(horarios: Horarios, inicio: Date, fin: Date, tz: string): boolean {
  if (Object.keys(horarios).length === 0) return true; // not configured
  if (zonedDateKey(inicio, tz) !== zonedDateKey(fin, tz)) {
    // A turno ending exactly at local midnight still belongs to the previous day.
    const endParts = zonedParts(fin, tz);
    const endsAtMidnight = endParts.hour === 0 && endParts.minute === 0;
    const nextDay = zonedDateKey(new Date(inicio.getTime() + 24 * 3600_000), tz);
    if (!(endsAtMidnight && zonedDateKey(fin, tz) === nextDay)) return false;
  }
  const s = zonedParts(inicio, tz);
  const e = zonedParts(fin, tz);
  const start = s.hour * 60 + s.minute;
  const end = zonedDateKey(inicio, tz) === zonedDateKey(fin, tz) ? e.hour * 60 + e.minute : 24 * 60;
  const ranges = horarios[String(s.isoWeekday) as keyof Horarios] ?? [];
  return ranges.some(([from, to]) => start >= hhmmToMinutes(from) && end <= hhmmToMinutes(to));
}

// ---- Turnos --------------------------------------------------------------------------
export const MAX_TURNO_MINUTES = 8 * 60;

const turnoFields = {
  pacienteId: uuid,
  profesionalId: uuid,
  sillonId: uuid.nullable(),
  tipoTratamientoId: uuid.nullable(),
  inicio: instant,
  fin: instant,
  estado: z.enum(TURNO_ESTADOS),
  notas: text(2000),
};

export const turnoCreateSchema = z
  .object({
    pacienteId: turnoFields.pacienteId,
    profesionalId: turnoFields.profesionalId,
    sillonId: turnoFields.sillonId.optional(),
    tipoTratamientoId: turnoFields.tipoTratamientoId.optional(),
    inicio: turnoFields.inicio,
    // Optional: defaults to inicio + the treatment type's duration.
    fin: turnoFields.fin.optional(),
    notas: turnoFields.notas.optional(),
    // Explicit confirmation to book outside the professional's working hours.
    sobreturno: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.fin || v.tipoTratamientoId, { message: 'Indicá el fin o el tipo de tratamiento', path: ['fin'] });

export const turnoUpdateSchema = z
  .object({
    pacienteId: turnoFields.pacienteId,
    profesionalId: turnoFields.profesionalId,
    sillonId: turnoFields.sillonId,
    tipoTratamientoId: turnoFields.tipoTratamientoId,
    inicio: turnoFields.inicio,
    fin: turnoFields.fin,
    estado: turnoFields.estado,
    notas: turnoFields.notas,
    sobreturno: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios');

const MAX_RANGE_DAYS = 62;
export const rangeQuerySchema = z
  .object({ desde: instant, hasta: instant, profesionalId: uuid.optional() })
  .refine((v) => new Date(v.hasta) > new Date(v.desde), { message: 'hasta debe ser posterior a desde', path: ['hasta'] })
  .refine((v) => new Date(v.hasta).getTime() - new Date(v.desde).getTime() <= MAX_RANGE_DAYS * 86400_000, {
    message: `El rango máximo es ${MAX_RANGE_DAYS} días`,
    path: ['hasta'],
  });

export type TurnoCreate = z.infer<typeof turnoCreateSchema>;
export type TurnoUpdate = z.infer<typeof turnoUpdateSchema>;

export type TurnoDto = {
  id: string;
  inicio: string;
  fin: string;
  estado: TurnoEstado;
  notas: string | null;
  paciente: { id: string; nombre: string; apellido: string; celular: string | null };
  profesional: { id: string; nombre: string; color: string | null };
  sillon: { id: string; nombre: string } | null;
  tipoTratamiento: { id: string; nombre: string } | null;
};

// ---- Bloqueos ------------------------------------------------------------------------
export const bloqueoCreateSchema = z
  .object({
    profesionalId: uuid.nullable().optional(), // null / absent = whole clinic
    inicio: instant,
    fin: instant,
    motivo: text(200).optional(),
  })
  .strict()
  .refine((v) => new Date(v.fin) > new Date(v.inicio), { message: 'El fin debe ser posterior al inicio', path: ['fin'] });

export const bloqueoUpdateSchema = z
  .object({ profesionalId: uuid.nullable(), inicio: instant, fin: instant, motivo: text(200) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios');

export type BloqueoCreate = z.infer<typeof bloqueoCreateSchema>;
export type BloqueoUpdate = z.infer<typeof bloqueoUpdateSchema>;
export type BloqueoDto = {
  id: string;
  profesionalId: string | null;
  inicio: string;
  fin: string;
  motivo: string | null;
};

// ---- Catalog (configuration) ---------------------------------------------------------
export const tipoTratamientoCreateSchema = z
  .object({
    nombre: required(100),
    duracionMinutos: z.number().int().min(5).max(MAX_TURNO_MINUTES),
    precioBaseCentavos: z.number().int().min(0).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .strict();
export const tipoTratamientoUpdateSchema = tipoTratamientoCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios');
export type TipoTratamientoDto = {
  id: string;
  nombre: string;
  duracionMinutos: number;
  precioBaseCentavos: number | null;
  activo: boolean;
};

export const sillonCreateSchema = z.object({ nombre: required(60), sedeId: uuid.optional() }).strict();
export type SillonDto = { id: string; nombre: string; sedeId: string };

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');
export const profesionalCreateSchema = z
  .object({
    nombre: required(100),
    matricula: text(40).optional(),
    especialidad: text(100).optional(),
    color: color.nullable().optional(),
    horarios: horariosSchema.optional(),
  })
  .strict();
export const profesionalUpdateSchema = profesionalCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios');
export type ProfesionalDto = {
  id: string;
  nombre: string;
  matricula: string | null;
  especialidad: string | null;
  color: string | null;
  horarios: Horarios;
  // True if this professional is the logged-in user (agenda defaults to it).
  esYo: boolean;
};
