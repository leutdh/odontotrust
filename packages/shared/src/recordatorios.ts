import { z } from 'zod';

// Placeholders a clinic can use in its reminder template.
export const PLANTILLA_VARIABLES = ['paciente', 'fecha', 'hora', 'profesional', 'clinica'] as const;
export type PlantillaVariable = (typeof PLANTILLA_VARIABLES)[number];
export type PlantillaVars = Record<PlantillaVariable, string>;

export const DEFAULT_PLANTILLA_RECORDATORIO =
  'Hola {paciente}, te recordamos tu turno en {clinica} el {fecha} a las {hora} con {profesional}. ¿Nos confirmás tu asistencia? ¡Gracias!';

const PLACEHOLDER = /\{([^{}]*)\}/g;

export const plantillaSchema = z
  .string()
  .trim()
  .min(10, 'El mensaje es muy corto')
  .max(800, 'El mensaje es muy largo (máximo 800 caracteres)')
  .refine(
    (t) => [...t.matchAll(PLACEHOLDER)].every((m) => (PLANTILLA_VARIABLES as readonly string[]).includes(m[1]!)),
    { message: `Variables permitidas: ${PLANTILLA_VARIABLES.map((v) => `{${v}}`).join(', ')}` },
  );

export const plantillaUpdateSchema = z.object({ plantilla: plantillaSchema }).strict();

export function renderPlantilla(template: string, vars: PlantillaVars): string {
  return template.replace(PLACEHOLDER, (whole, key: string) =>
    (PLANTILLA_VARIABLES as readonly string[]).includes(key) ? vars[key as PlantillaVariable] : whole,
  );
}

export function formatFechaLarga(date: Date, tz: string): string {
  // e.g. "lunes 5 de octubre"
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
    .format(date)
    .replace(',', '');
}

export function formatHora(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export type RecordatorioLinkDto = {
  recordatorioId: string;
  url: string; // https://wa.me/<number>?text=<message>
  mensaje: string;
  telefono: string;
};

export type RecordatorioDto = {
  id: string;
  canal: 'whatsapp_link' | 'whatsapp_api';
  estado: 'abierto' | 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido';
  creadoAt: string;
};
