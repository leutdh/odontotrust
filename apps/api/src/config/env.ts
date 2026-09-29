import { z } from 'zod';
import { parseEnv } from '@odontotrust/shared';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optional = z.preprocess(emptyToUndefined, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  SENTRY_DSN: optional,
  REDIS_URL: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  // JWTs are verified against the project's JWKS (derived from SUPABASE_URL).
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: optional,
  RESEND_API_KEY: optional,
  WHATSAPP_ENCRYPTION_KEY: optional,
});

export type Env = z.infer<typeof envSchema>;
export const loadEnv = (source?: NodeJS.ProcessEnv): Env => parseEnv(envSchema, source);
