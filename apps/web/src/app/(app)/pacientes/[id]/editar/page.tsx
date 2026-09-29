import { notFound, redirect } from 'next/navigation';
import type { PacienteDto } from '@odontotrust/shared';
import { apiFetch, getContext } from '@/lib/api';
import { PacienteForm } from '../../paciente-form';

export default async function EditarPacientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx?.rol || !ctx.clinicaId) redirect('/');

  const res = await apiFetch(`/pacientes/${id}`, {}, ctx.clinicaId);
  if (!res || res.status === 404) notFound();
  if (!res.ok) throw new Error('No se pudo cargar el paciente');
  const paciente = (await res.json()) as PacienteDto;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Editar paciente</h1>
      <PacienteForm rol={ctx.rol} paciente={paciente} />
    </main>
  );
}
