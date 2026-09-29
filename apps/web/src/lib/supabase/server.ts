import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '../env';

// The session lives in httpOnly cookies: the browser JS can never read the JWT.
export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, { ...options, httpOnly: true });
          }
        } catch {
          // Called from a Server Component (read-only cookies): proxy.ts refreshes the session.
        }
      },
    },
  });
}
