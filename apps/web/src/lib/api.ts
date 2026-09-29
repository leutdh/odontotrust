import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { env } from './env';
import { createSupabaseServer } from './supabase/server';

export const CLINICA_COOKIE = 'clinica_id';

export type Me = {
  userId: string;
  clinicas: { clinicaId: string; rol: string; nombre: string }[];
};

async function accessToken(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getSession();
  // Only the token is used; the API verifies its signature against Supabase's JWKS.
  return data.session?.access_token ?? null;
}

/** Calls the API on behalf of the logged-in user (Bearer JWT + optional X-Clinica-Id). */
export async function apiFetch(path: string, init: RequestInit = {}, clinicaId?: string) {
  const token = await accessToken();
  if (!token) return null;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (clinicaId) headers.set('X-Clinica-Id', clinicaId);
  return fetch(`${env.API_URL}/api/v1${path}`, { ...init, headers, cache: 'no-store' });
}

/** Memberships + active clinic. One clinic => auto-selected; several => cookie choice, else null. */
export const getContext = cache(async () => {
  const res = await apiFetch('/me');
  if (!res?.ok) return null;
  const me = (await res.json()) as Me;
  const chosen = (await cookies()).get(CLINICA_COOKIE)?.value;
  const clinicaId =
    me.clinicas.find((c) => c.clinicaId === chosen)?.clinicaId ??
    (me.clinicas.length === 1 ? me.clinicas[0]!.clinicaId : null);
  return { me, clinicaId };
});
