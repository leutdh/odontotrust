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
  // Required from Fase 1 on; optional now so Fase 0 boots without Supabase.
  DATABASE_URL: optional,
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  SUPABASE_JWT_SECRET: optional,
  RESEND_API_KEY: optional,
  WHATSAPP_ENCRYPTION_KEY: optional,
});

export type Env = z.infer<typeof envSchema>;
export const loadEnv = (source?: NodeJS.ProcessEnv): Env => parseEnv(envSchema, source);
