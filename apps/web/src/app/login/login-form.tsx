'use client';

import { useActionState } from 'react';
import { btnPrimary, inputClass } from '@/components/ui';
import { login, type LoginState } from '../actions';

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Ingresar</h1>
      {linkError && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          El link no es válido o ya venció. Pedile a un administrador que te genere uno nuevo.
        </p>
      )}
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
