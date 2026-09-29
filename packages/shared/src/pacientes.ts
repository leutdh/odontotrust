import { z } from 'zod';
import { required, text } from './zod-helpers';

/** Clinical fields of a patient: never exposed to (nor writable by) roles without `clinico:*`. */
export const CLINICAL_FIELDS = ['antecedentes', 'alergias'] as const;

const dni = z
  .string()
  .trim()
  .transform((v) => v.replace(/[.\s-]/g, ''))
  .refine((v) => v === '' || /^\d{6,9}$/.test(v), 'DNI inválido')
  .transform((v) => (v === '' ? null : v))
  .nullable();

// Keep digits and an optional leading "+" (WhatsApp / wa.me needs the international number).
const celular = z
  .string()
  .trim()
  .transform((v) => v.replace(/(?!^\+)[^\d]/g, ''))
  .refine((v) => v === '' || /^\+?\d{8,15}$/.test(v), 'Celular inválido')
  .transform((v) => (v === '' ? null : v))
  .nullable();

const fechaNacimiento = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), 'Fecha inválida')
  .refine((v) => v === '' || v <= new Date().toISOString().slice(0, 10), 'La fecha no puede ser futura')
  .transform((v) => (v === '' ? null : v))
  .nullable();

const email = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Email inválido')
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const coberturaInputSchema = z.object({
  obraSocial: required(120),
  plan: text(120).optional(),
  nroAfiliado: text(60).optional(),
});

const fields = {
  nombre: required(100),
  apellido: required(100),
  dni: dni.optional(),
  fechaNacimiento: fechaNacimiento.optional(),
  celular: celular.optional(),
  email: email.optional(),
  domicilio: text(300).optional(),
  antecedentes: text(5000).optional(),
  alergias: text(2000).optional(),
  notas: text(5000).optional(),
  // null removes the coverage.
  cobertura: coberturaInputSchema.nullable().optional(),
};

export const pacienteCreateSchema = z.object(fields).strict();
export const pacienteUpdateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios');

export type PacienteCreate = z.infer<typeof pacienteCreateSchema>;
export type PacienteUpdate = z.infer<typeof pacienteUpdateSchema>;

export const pacienteListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type Cobertura = { obraSocial: string; plan: string | null; nroAfiliado: string | null };

export type PacienteDto = {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  fechaNacimiento: string | null;
  celular: string | null;
  email: string | null;
  domicilio: string | null;
  notas: string | null;
  cobertura: Cobertura | null;
  // Present only for roles with clinical access.
  antecedentes?: string | null;
  alergias?: string | null;
};

export type PacienteListItem = Pick<PacienteDto, 'id' | 'nombre' | 'apellido' | 'dni' | 'celular'>;

export type Page<T> = { items: T[]; nextCursor: string | null };

export type TurnoResumen = {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  profesional: string;
  tipoTratamiento: string | null;
};
