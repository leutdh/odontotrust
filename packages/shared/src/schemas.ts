import { z } from 'zod';
import { ROLES } from './constants';

export const rolSchema = z.enum(ROLES);

export const errorResponseSchema = z.object({ code: z.string(), message: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
