import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getContext } from '@/lib/api';
import { selectClinica } from '../actions';

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect('/login');

  // Several clinics and none chosen yet: show the selector.
  if (!ctx.clinicaId) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-col gap-4 py-10">
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

  const res = await apiFetch('/clinica', {}, ctx.clinicaId);
  const clinica = res?.ok ? ((await res.json()) as { nombre: string }) : null;

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{clinica?.nombre ?? 'Clínica'}</h1>
        <p className="text-sm text-neutral-500">Sesión como {ctx.rol}</p>
      </div>
      <Link
        href="/pacientes"
        className="rounded-lg border border-neutral-200 p-5 text-lg font-medium dark:border-neutral-800"
      >
        Pacientes
        <span className="block text-sm font-normal text-neutral-500">Buscar, ver fichas y cargar nuevos</span>
      </Link>
    </main>
  );
}
