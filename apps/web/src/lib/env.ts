import { z } from 'zod';

// NEXT_PUBLIC_* must be referenced statically so Next inlines them in the client bundle.
// API_URL is server-only: the browser never talks to the API directly.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  API_URL: z.string().url().default('http://localhost:4000'),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  API_URL: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || undefined,
});
