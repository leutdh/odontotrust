import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, type PacienteDto, type TurnoResumen } from '@odontotrust/shared';
import { btnGhost } from '@/components/ui';
import { apiFetch, getContext } from '@/lib/api';
import { edad, formatFecha, formatFechaHora } from '@/lib/format';
import { DeleteButton } from './delete-button';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="whitespace-pre-line">{value || '—'}</dd>
    </div>
  );
}

export default async function PacienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx?.rol || !ctx.clinicaId) redirect('/');

  const [res, turnosRes] = await Promise.all([
    apiFetch(`/pacientes/${id}`, {}, ctx.clinicaId),
    apiFetch(`/pacientes/${id}/turnos`, {}, ctx.clinicaId),
  ]);
  if (!res || res.status === 404) notFound();
  if (!res.ok) throw new Error('No se pudo cargar el paciente');
  const p = (await res.json()) as PacienteDto;
  const turnos = turnosRes?.ok ? ((await turnosRes.json()) as TurnoResumen[]) : [];
  const years = edad(p.fechaNacimiento);
  const c = p.cobertura;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {p.apellido}, {p.nombre}
          </h1>
          <p className="text-sm text-neutral-500">{years !== null ? `${years} años` : 'Edad sin cargar'}</p>
        </div>
        <Link href={`/pacientes/${p.id}/editar`} className={btnGhost}>
          Editar
        </Link>
      </div>

      <section>
        <h2 className="mb-1 font-medium">Datos personales</h2>
        <dl className="divide-y divide-neutral-200 dark:divide-neutral-800">
          <Row label="DNI" value={p.dni} />
          <Row label="Fecha de nacimiento" value={p.fechaNacimiento ? formatFecha(p.fechaNacimiento) : null} />
          <Row label="Celular" value={p.celular} />
          <Row label="Email" value={p.email} />
          <Row label="Domicilio" value={p.domicilio} />
          <Row label="Notas" value={p.notas} />
        </dl>
      </section>

      <section>
        <h2 className="mb-1 font-medium">Cobertura</h2>
        <dl className="divide-y divide-neutral-200 dark:divide-neutral-800">
          <Row label="Obra social / prepaga" value={c?.obraSocial} />
          <Row label="Plan" value={c?.plan} />
          <Row label="Nº de afiliado" value={c?.nroAfiliado} />
        </dl>
      </section>

      {can(ctx.rol, 'clinico:read') && (
        <section>
          <h2 className="mb-1 font-medium">Datos clínicos</h2>
          <dl className="divide-y divide-neutral-200 dark:divide-neutral-800">
            <Row label="Antecedentes médicos" value={p.antecedentes} />
            <Row label="Alergias" value={p.alergias} />
          </dl>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium">Historial de turnos</h2>
        {turnos.length === 0 ? (
          <p className="text-neutral-500">Sin turnos registrados.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {turnos.map((t) => (
              <li key={t.id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="font-medium">{formatFechaHora(t.inicio)}</span>
                <span className="text-sm text-neutral-500">
                  {[t.tipoTratamiento, t.profesional, t.estado].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {can(ctx.rol, 'pacientes:delete') && <DeleteButton id={p.id} nombre={`${p.nombre} ${p.apellido}`} />}
    </main>
  );
}
