'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { passwordSchema } from '@odontotrust/shared';
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

// Consumes the one-time invite/recovery token. Runs only when the person presses the button:
// link-preview bots (WhatsApp, email scanners) that merely GET the page must not burn the token.
export async function confirmarLink(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '');
  const type = String(formData.get('type') ?? '');
  if (!tokenHash || (type !== 'invite' && type !== 'recovery')) redirect('/login?error=link');

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect('/login?error=link');
  redirect('/establecer-contrasena');
}

export type PasswordState = { error?: string };

export async function establecerContrasena(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Contraseña inválida.' };
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'No se pudo guardar la contraseña. Pedí un link nuevo.' };
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
