'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { can, type PacienteDto, type Rol } from '@odontotrust/shared';
import { btnGhost, btnPrimary, inputClass } from '@/components/ui';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}

export function PacienteForm({ rol, paciente }: { rol: Rol; paciente?: PacienteDto }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = Boolean(paciente);
  // Clinical fields exist in the form only for roles allowed to see/write them.
  const clinico = can(rol, 'clinico:write');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    const obraSocial = get('obraSocial').trim();

    const body: Record<string, unknown> = {
      nombre: get('nombre'),
      apellido: get('apellido'),
      dni: get('dni'),
      fechaNacimiento: get('fechaNacimiento'),
      celular: get('celular'),
      email: get('email'),
      domicilio: get('domicilio'),
      notas: get('notas'),
    };
    if (clinico) {
      body.antecedentes = get('antecedentes');
      body.alergias = get('alergias');
    }
    if (obraSocial) {
      body.cobertura = { obraSocial, plan: get('plan'), nroAfiliado: get('nroAfiliado') };
    } else if (editing) {
      body.cobertura = null;
    }

    try {
      const res = await fetch(editing ? `/api/proxy/pacientes/${paciente!.id}` : '/api/proxy/pacientes', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? 'No se pudo guardar. Reintentá.');
        return;
      }
      router.push(`/pacientes/${data.id}`);
      router.refresh();
    } catch {
      setError('No se pudo conectar. Revisá tu conexión y reintentá.');
    } finally {
      setPending(false);
    }
  }

  const p = paciente;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre *">
          <input name="nombre" required defaultValue={p?.nombre} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Apellido *">
          <input name="apellido" required defaultValue={p?.apellido} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="DNI">
          <input name="dni" inputMode="numeric" defaultValue={p?.dni ?? ''} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Fecha de nacimiento">
          <input name="fechaNacimiento" type="date" defaultValue={p?.fechaNacimiento ?? ''} className={inputClass} />
        </Field>
        <Field label="Celular (WhatsApp, con código de área)">
          <input
            name="celular"
            type="tel"
            inputMode="tel"
            placeholder="+54 9 11 5555 1234"
            defaultValue={p?.celular ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={p?.email ?? ''} className={inputClass} />
        </Field>
      </div>
      <Field label="Domicilio">
        <input name="domicilio" defaultValue={p?.domicilio ?? ''} className={inputClass} />
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Cobertura</legend>
        <Field label="Obra social / prepaga">
          <input name="obraSocial" defaultValue={p?.cobertura?.obraSocial ?? ''} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan">
            <input name="plan" defaultValue={p?.cobertura?.plan ?? ''} className={inputClass} />
          </Field>
          <Field label="Nº de afiliado">
            <input name="nroAfiliado" defaultValue={p?.cobertura?.nroAfiliado ?? ''} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      {clinico && (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <legend className="px-1 text-sm font-medium">Datos clínicos</legend>
          <Field label="Antecedentes médicos">
            <textarea name="antecedentes" rows={3} defaultValue={p?.antecedentes ?? ''} className={inputClass} />
          </Field>
          <Field label="Alergias">
            <textarea name="alergias" rows={2} defaultValue={p?.alergias ?? ''} className={inputClass} />
          </Field>
        </fieldset>
      )}

      <Field label="Notas">
        <textarea name="notas" rows={3} defaultValue={p?.notas ?? ''} className={inputClass} />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => router.back()} className={btnGhost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
