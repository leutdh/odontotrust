'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CLINICA_COOKIE } from '@/lib/api';
import { createSupabaseServer } from '@/lib/supabase/server';

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Ingresá email y contraseña.' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Generic message: do not reveal whether the account exists.
  if (error) return { error: 'Email o contraseña incorrectos.' };
  redirect('/');
}

export async function logout() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  (await cookies()).delete(CLINICA_COOKIE);
  redirect('/login');
}

export async function selectClinica(formData: FormData) {
  const id = String(formData.get('clinicaId') ?? '');
  // The API re-validates membership on every request; the cookie is only a preference.
  (await cookies()).set(CLINICA_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/');
}
