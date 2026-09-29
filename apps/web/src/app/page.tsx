import { redirect } from 'next/navigation';
import { apiFetch, getContext } from '@/lib/api';
import { logout, selectClinica } from './actions';

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect('/login');

  // Several clinics and none chosen yet: show the selector.
  if (!ctx.clinicaId) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold">Elegí una clínica</h1>
        {ctx.me.clinicas.map((c) => (
          <form key={c.clinicaId} action={selectClinica}>
            <input type="hidden" name="clinicaId" value={c.clinicaId} />
            <button className="w-full rounded-md border border-neutral-300 px-4 py-3 text-left dark:border-neutral-700">
              {c.nombre} <span className="text-sm text-neutral-500">({c.rol})</span>
            </button>
          </form>
        ))}
      </main>
    );
  }

  const membership = ctx.me.clinicas.find((c) => c.clinicaId === ctx.clinicaId);
  const res = await apiFetch('/clinica', {}, ctx.clinicaId);
  const clinica = res?.ok ? ((await res.json()) as { nombre: string; zonaHoraria: string }) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">{clinica?.nombre ?? 'Clínica'}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Sesión iniciada como <strong>{membership?.rol}</strong>. Conexión front → Supabase Auth → API OK.
      </p>
      <form action={logout}>
        <button className="rounded-md border border-neutral-300 px-4 py-2 dark:border-neutral-700">
          Salir
        </button>
      </form>
    </main>
  );
}
