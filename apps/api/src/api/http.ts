import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { HttpError } from './errors';

// Zod messages name the field, never echo the submitted value (no personal data in errors).
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join('.') || 'body';
    throw new HttpError(400, 'validation_error', `${where}: ${issue?.message ?? 'inválido'}`);
  }
  return result.data;
}

/** Rejects a non-UUID `:id` with 404 before it reaches the database. */
export const idParam =
  (what: string): RequestHandler =>
  (req, _res, next) => {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return next(new HttpError(404, 'not_found', `${what} no encontrado`));
    }
    next();
  };

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} no encontrado`);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

export const pgCode = (e: unknown): string | undefined => (e as { cause?: { code?: string } })?.cause?.code;
export const pgConstraint = (e: unknown): string | undefined =>
  (e as { cause?: { constraint_name?: string } })?.cause?.constraint_name;
