'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { renderPlantilla, type Horarios, type ProfesionalDto, type TipoTratamientoDto } from '@odontotrust/shared';
import { btnGhost, btnPrimary, inputClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';
import { useProfesionales, useSillones, useTipos } from '../agenda/queries';

const DAYS = [
  ['1', 'Lunes'],
  ['2', 'Martes'],
  ['3', 'Miércoles'],
  ['4', 'Jueves'],
  ['5', 'Viernes'],
  ['6', 'Sábado'],
  ['7', 'Domingo'],
] as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function useSave() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(fn: () => Promise<unknown>, invalidate: string) {
    setPending(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: [invalidate] });
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, error, pending };
}

const Err = ({ msg }: { msg: string | null }) =>
  msg ? (
    <p role="alert" className="text-sm text-red-600">
      {msg}
    </p>
  ) : null;

// ---- Treatment types --------------------------------------------------------------------
function TipoRow({ tipo }: { tipo: TipoTratamientoDto }) {
  const { run, error, pending } = useSave();
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState(tipo.nombre);
  const [dur, setDur] = useState(tipo.duracionMinutos);

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-3">
        <span className={tipo.activo ? '' : 'text-neutral-400 line-through'}>
          {tipo.nombre} <span className="text-sm text-neutral-500">· {tipo.duracionMinutos} min</span>
        </span>
        <span className="flex gap-2">
          <button className="text-sm text-sky-700" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button
            className="text-sm text-neutral-500"
            disabled={pending}
            onClick={() => run(() => api(`/tipos-tratamiento/${tipo.id}`, { method: 'PATCH', body: { activo: !tipo.activo } }), 'tipos')}
          >
            {tipo.activo ? 'Desactivar' : 'Activar'}
          </button>
        </span>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} aria-label="Nombre" />
        <input type="number" min={5} max={480} step={5} value={dur} onChange={(e) => setDur(Number(e.target.value))} className={`${inputClass} w-24`} aria-label="Minutos" />
      </div>
      <Err msg={error} />
      <div className="flex gap-2">
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={async () => {
            if (await run(() => api(`/tipos-tratamiento/${tipo.id}`, { method: 'PATCH', body: { nombre, duracionMinutos: dur } }), 'tipos')) setEditing(false);
          }}
        >
          Guardar
        </button>
        <button className={btnGhost} onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
    </li>
  );
}

function TiposSection() {
  const tipos = useTipos();
  const { run, error, pending } = useSave();
  const [nombre, setNombre] = useState('');
  const [dur, setDur] = useState(30);
  return (
    <Section title="Tratamientos" hint="La duración se usa para calcular el fin de cada turno.">
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {(tipos.data ?? []).map((t) => (
          <TipoRow key={t.id} tipo={t} />
        ))}
        {tipos.data?.length === 0 && <li className="px-4 py-3 text-neutral-500">Sin tratamientos cargados.</li>}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api('/tipos-tratamiento', { method: 'POST', body: { nombre, duracionMinutos: dur } }), 'tipos')) setNombre('');
        }}
      >
        <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nuevo tratamiento" className={`${inputClass} min-w-40 flex-1`} />
        <input type="number" min={5} max={480} step={5} value={dur} onChange={(e) => setDur(Number(e.target.value))} className={`${inputClass} w-24`} aria-label="Minutos" />
        <button className={btnPrimary} disabled={pending}>
          Agregar
        </button>
      </form>
      <Err msg={error} />
    </Section>
  );
}

// ---- Chairs -----------------------------------------------------------------------------
function SillonesSection() {
  const sillones = useSillones();
  const { run, error, pending } = useSave();
  const [nombre, setNombre] = useState('');
  return (
    <Section title="Sillones / consultorios" hint="Opcional. Si los cargás, un turno puede asignarse a un sillón y no se pueden solapar.">
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {(sillones.data ?? []).map((s) => (
          <li key={s.id} className="px-4 py-3">
            {s.nombre}
          </li>
        ))}
        {sillones.data?.length === 0 && <li className="px-4 py-3 text-neutral-500">Sin sillones cargados.</li>}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api('/sillones', { method: 'POST', body: { nombre } }), 'sillones')) setNombre('');
        }}
      >
        <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nuevo sillón" className={inputClass} />
        <button className={btnPrimary} disabled={pending}>
          Agregar
        </button>
      </form>
      <Err msg={error} />
    </Section>
  );
}

// ---- Professionals + working hours -----------------------------------------------------
type DayState = { a1: string; b1: string; a2: string; b2: string };

function initialDays(h: Horarios): Record<string, DayState> {
  return Object.fromEntries(
    DAYS.map(([d]) => {
      const r = h[d] ?? [];
      return [d, { a1: r[0]?.[0] ?? '', b1: r[0]?.[1] ?? '', a2: r[1]?.[0] ?? '', b2: r[1]?.[1] ?? '' }];
    }),
  );
}

function toHorarios(days: Record<string, DayState>): Horarios {
  const out: Horarios = {};
  for (const [d] of DAYS) {
    const s = days[d]!;
    const ranges: [string, string][] = [];
    if (s.a1 && s.b1) ranges.push([s.a1, s.b1]);
    if (s.a2 && s.b2) ranges.push([s.a2, s.b2]);
    if (ranges.length) out[d] = ranges;
  }
  return out;
}

function ProfesionalCard({ p }: { p: ProfesionalDto }) {
  const { run, error, pending } = useSave();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(() => initialDays(p.horarios));
  const [color, setColor] = useState(p.color ?? '#0ea5e9');
  const configured = Object.keys(p.horarios).length > 0;

  const set = (d: string, k: keyof DayState, v: string) => setDays((prev) => ({ ...prev, [d]: { ...prev[d]!, [k]: v } }));
  const time = 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900';

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: p.color ?? '#0ea5e9' }} />
          <span className="font-medium">{p.nombre}</span>
          <span className="text-sm text-neutral-500">{configured ? '' : '· sin horarios (sin restricción)'}</span>
        </span>
        <button className="text-sm text-sky-700" onClick={() => setOpen(!open)}>
          {open ? 'Cerrar' : 'Horarios'}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-2 gap-y-2">
            {DAYS.map(([d, label]) => (
              <div key={d} className="contents">
                <span className="text-sm">{label}</span>
                <span className="flex flex-wrap items-center gap-1 text-sm">
                  <input type="time" className={time} value={days[d]!.a1} onChange={(e) => set(d, 'a1', e.target.value)} aria-label={`${label} desde`} />
                  –
                  <input type="time" className={time} value={days[d]!.b1} onChange={(e) => set(d, 'b1', e.target.value)} aria-label={`${label} hasta`} />
                  <span className="mx-1 text-neutral-400">y</span>
                  <input type="time" className={time} value={days[d]!.a2} onChange={(e) => set(d, 'a2', e.target.value)} aria-label={`${label} desde (tarde)`} />
                  –
                  <input type="time" className={time} value={days[d]!.b2} onChange={(e) => set(d, 'b2', e.target.value)} aria-label={`${label} hasta (tarde)`} />
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500">Dejá un día vacío si no atiende. Sin ningún día cargado, no hay restricción de horario.</p>
          <label className="flex items-center gap-2 text-sm">
            Color en la agenda
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <Err msg={error} />
          <button
            className={`${btnPrimary} self-start`}
            disabled={pending}
            onClick={() => run(() => api(`/profesionales/${p.id}`, { method: 'PATCH', body: { horarios: toHorarios(days), color } }), 'profesionales')}
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </li>
  );
}

function ProfesionalesSection() {
  const profs = useProfesionales();
  const { run, error, pending } = useSave();
  const [nombre, setNombre] = useState('');
  return (
    <Section title="Profesionales y horarios de atención" hint="Los turnos fuera de horario piden confirmar un sobreturno.">
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {(profs.data ?? []).map((p) => (
          <ProfesionalCard key={p.id + JSON.stringify(p.horarios)} p={p} />
        ))}
        {profs.data?.length === 0 && <li className="px-4 py-3 text-neutral-500">Sin profesionales cargados.</li>}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api('/profesionales', { method: 'POST', body: { nombre } }), 'profesionales')) setNombre('');
        }}
      >
        <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nuevo profesional" className={inputClass} />
        <button className={btnPrimary} disabled={pending}>
          Agregar
        </button>
      </form>
      <Err msg={error} />
    </Section>
  );
}

// ---- Reminder message -------------------------------------------------------------------
type PlantillaData = { plantilla: string; predeterminada: string; variables: string[] };

const SAMPLE = {
  paciente: 'Ana',
  fecha: 'lunes 5 de octubre',
  hora: '09:30',
  profesional: 'Dra. García',
  clinica: 'tu consultorio',
};

function PlantillaEditor({ data }: { data: PlantillaData }) {
  const { run, error, pending } = useSave();
  const [text, setText] = useState(data.plantilla);
  const [saved, setSaved] = useState(false);
  const preview = renderPlantilla(text, SAMPLE);
  return (
    <div className="flex flex-col gap-3">
      <textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        className={inputClass}
        aria-label="Mensaje de recordatorio"
      />
      <div className="flex flex-wrap gap-1.5 text-xs">
        {data.variables.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setText((t) => `${t} {${v}}`)}
            className="rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700"
          >
            {`{${v}}`}
          </button>
        ))}
      </div>
      <div className="rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
        <p className="mb-1 text-xs text-neutral-500">Vista previa</p>
        {preview}
      </div>
      <Err msg={error} />
      <div className="flex items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={async () => {
            setSaved(await run(() => api('/configuracion/recordatorios', { method: 'PUT', body: { plantilla: text } }), 'recordatorio-plantilla'));
          }}
        >
          {pending ? 'Guardando…' : 'Guardar mensaje'}
        </button>
        <button className={btnGhost} type="button" onClick={() => setText(data.predeterminada)}>
          Restaurar el predeterminado
        </button>
        {saved && <span className="text-sm text-green-700">Guardado</span>}
      </div>
    </div>
  );
}

function RecordatorioSection() {
  const q = useQuery({ queryKey: ['recordatorio-plantilla'], queryFn: () => api<PlantillaData>('/configuracion/recordatorios') });
  return (
    <Section title="Mensaje de recordatorio" hint="Es el texto que se prepara en WhatsApp al tocar «Enviar recordatorio» en un turno.">
      {q.data ? <PlantillaEditor key={q.data.plantilla} data={q.data} /> : <p className="text-neutral-500">Cargando…</p>}
    </Section>
  );
}

export function ConfigView() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <RecordatorioSection />
      <ProfesionalesSection />
      <TiposSection />
      <SillonesSection />
    </div>
  );
}
