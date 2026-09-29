import { redirect } from 'next/navigation';
import { getContext } from '@/lib/api';
import { PacienteForm } from '../paciente-form';

export default async function NuevoPacientePage() {
  const ctx = await getContext();
  if (!ctx?.rol) redirect('/');
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nuevo paciente</h1>
      <PacienteForm rol={ctx.rol} />
    </main>
  );
}
