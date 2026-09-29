import { z } from 'zod';

// Forms send '' for empty inputs: normalize to null.
export const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const required = (max: number) => z.string().trim().min(1, 'Requerido').max(max);
