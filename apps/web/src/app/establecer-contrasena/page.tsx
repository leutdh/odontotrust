'use client';

import { useActionState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@odontotrust/shared';
import { btnPrimary, inputClass } from '@/components/ui';
import { establecerContrasena, type PasswordState } from '../actions';

// Reached after opening an invite link (session already created) or from "Mi contraseña".
export default function EstablecerContrasenaPage() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(establecerContrasena, {});

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Elegí tu contraseña</h1>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Contraseña nueva (mínimo {MIN_PASSWORD_LENGTH} caracteres)
          <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Repetila
          <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={inputClass} />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </main>
  );
}
