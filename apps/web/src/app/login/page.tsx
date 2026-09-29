'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '../actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Ingresar</h1>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
