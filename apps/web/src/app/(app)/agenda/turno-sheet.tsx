'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  TURNO_ESTADOS,
  type ProfesionalDto,
  type SillonDto,
  type TipoTratamientoDto,
  type TurnoDto,
  type TurnoEstado,
} from '@odontotrust/shared';
import { Sheet } from '@/components/sheet';
import { btnGhost, btnPrimary, inputClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';
import { fromIso, hhmmToMin, minutesToHHMM, toIso, type DateKey } from './dates';
import { usePacienteSearch } from './queries';

export type TurnoSheetState =
  | { type: 'create'; profesionalId: string; dateKey: DateKey; minutes: number }
  | { type: 'view'; turno: TurnoDto }
  | { type: 'edit'; turno: TurnoDto };

const ESTADO_LABEL: Record<TurnoEstado, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  atendido: 'Atendido',
  ausente: 'Ausente',
  cancelado: 'Cancelado',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}

function PacienteCombobox({
  value,
  onChange,
}: {
  value: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
}) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);
  const results = usePacienteSearch(debounced);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-neutral-300 px-3 py-2.5 dark:border-neutral-700">
        <span className="font-medium">{value.label}</span>
        <button type="button" onClick={() => onChange(null)} className="text-sm text-sky-700">
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Buscar paciente (nombre, DNI, teléfono)"
        className={inputClass}
      />
      <ul className="max-h-48 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        {(results.data?.items ?? []).map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onChange({ id: p.id, label: `${p.apellido}, ${p.nombre}` })}
              className="flex w-full flex-col px-3 py-2 text-left active:bg-neutral-100 dark:active:bg-neutral-800"
            >
              <span className="font-medium">
                {p.apellido}, {p.nombre}
              </span>
              <span className="text-xs text-neutral-500">{[p.dni && `DNI ${p.dni}`, p.celular].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
        {results.data && results.data.items.length === 0 && (
          <li className="px-3 py-3 text-sm text-neutral-500">
            Sin resultados.{' '}
            <Link href="/pacientes/nuevo" className="text-sky-700 underline">
              Crear paciente
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

function TurnoForm({
  state,
  tz,
  profesionales,
  sillones,
  tipos,
  onClose,
}: {
  state: Extract<TurnoSheetState, { type: 'create' | 'edit' }>;
  tz: string;
  profesionales: ProfesionalDto[];
  sillones: SillonDto[];
  tipos: TipoTratamientoDto[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = state.type === 'edit';
  const turno = editing ? state.turno : null;
  const start = turno ? fromIso(turno.inicio, tz) : null;
  const activos = tipos.filter((t) => t.activo);

  const [paciente, setPaciente] = useState<{ id: string; label: string } | null>(
    turno ? { id: turno.paciente.id, label: `${turno.paciente.apellido}, ${turno.paciente.nombre}` } : null,
  );
  // Quick creation: the first active treatment type is preselected so its duration is ready.
  const firstTipo = editing ? turno!.tipoTratamiento?.id ?? '' : activos[0]?.id ?? '';
  const [tipoId, setTipoId] = useState(firstTipo);
  const [duracion, setDuracion] = useState(() => {
    if (turno) return Math.round((new Date(turno.fin).getTime() - new Date(turno.inicio).getTime()) / 60_000);
    return activos[0]?.duracionMinutos ?? 30;
  });
  const [profesionalId, setProfesionalId] = useState(turno ? turno.profesional.id : (state as { profesionalId: string }).profesionalId);
  const [sillonId, setSillonId] = useState(turno?.sillon?.id ?? '');
  const [fecha, setFecha] = useState<DateKey>(start ? start.dateKey : (state as { dateKey: DateKey }).dateKey);
  const [hora, setHora] = useState(minutesToHHMM(start ? start.minutes : (state as { minutes: number }).minutes));
  const [notas, setNotas] = useState(turno?.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sobreturnoPrompt, setSobreturnoPrompt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(sobreturno = false) {
    if (!paciente) return setError('Elegí un paciente.');
    setError(null);
    setSobreturnoPrompt(null);
    setPending(true);
    const startMin = hhmmToMin(hora);
    const body = {
      pacienteId: paciente.id,
      profesionalId,
      sillonId: sillonId || null,
      tipoTratamientoId: tipoId || null,
      inicio: toIso(fecha, startMin, tz),
      fin: toIso(fecha, startMin + duracion, tz),
      notas,
      ...(sobreturno && { sobreturno: true }),
    };
    try {
      await api(editing ? `/turnos/${turno!.id}` : '/turnos', { method: editing ? 'PATCH' : 'POST', body });
      await qc.invalidateQueries({ queryKey: ['turnos'] });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'fuera_de_horario') {
        setSobreturnoPrompt(e.message);
      } else {
        setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Reintentá.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Paciente">
        <PacienteCombobox value={paciente} onChange={setPaciente} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tratamiento">
          <select
            value={tipoId}
            onChange={(e) => {
              setTipoId(e.target.value);
              const t = tipos.find((x) => x.id === e.target.value);
              if (t) setDuracion(t.duracionMinutos);
            }}
            className={inputClass}
          >
            <option value="">Sin especificar</option>
            {tipos
              .filter((t) => t.activo || t.id === tipoId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Duración (min)">
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={duracion}
            onChange={(e) => setDuracion(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Fecha">
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Hora">
          <input type="time" required step={300} value={hora} onChange={(e) => setHora(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Profesional">
          <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className={inputClass}>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Field>
        {sillones.length > 0 && (
          <Field label="Sillón">
            <select value={sillonId} onChange={(e) => setSillonId(e.target.value)} className={inputClass}>
              <option value="">Sin asignar</option>
              {sillones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Notas">
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={inputClass} />
      </Field>

      {sobreturnoPrompt && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p>{sobreturnoPrompt}. ¿Agendar igual como sobreturno?</p>
          <button type="button" onClick={() => void submit(true)} disabled={pending} className={btnPrimary}>
            Sí, agendar sobreturno
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function TurnoDetail({
  turno,
  tz,
  onEdit,
  onClose,
}: {
  turno: TurnoDto;
  tz: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const s = fromIso(turno.inicio, tz);
  const e = fromIso(turno.fin, tz);
  const [y, m, d] = s.dateKey.split('-');

  async function setEstado(estado: TurnoEstado) {
    setPending(true);
    setError(null);
    try {
      await api(`/turnos/${turno.id}`, { method: 'PATCH', body: { estado } });
      await qc.invalidateQueries({ queryKey: ['turnos'] });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/pacientes/${turno.paciente.id}`} className="text-lg font-medium text-sky-700 underline-offset-2 hover:underline">
          {turno.paciente.apellido}, {turno.paciente.nombre}
        </Link>
        <p className="text-neutral-600 dark:text-neutral-400">
          {d}/{m}/{y} · {minutesToHHMM(s.minutes)}–{minutesToHHMM(e.minutes)}
        </p>
        <p className="text-sm text-neutral-500">
          {[turno.tipoTratamiento?.nombre, turno.profesional.nombre, turno.sillon?.nombre].filter(Boolean).join(' · ')}
        </p>
        {turno.notas && <p className="mt-2 whitespace-pre-line text-sm">{turno.notas}</p>}
      </div>

      <div>
        <p className="mb-2 text-sm text-neutral-500">Estado: {ESTADO_LABEL[turno.estado]}</p>
        <div className="flex flex-wrap gap-2">
          {TURNO_ESTADOS.filter((x) => x !== turno.estado).map((x) => (
            <button key={x} disabled={pending} onClick={() => void setEstado(x)} className={`${btnGhost} px-3 py-1.5 text-sm`}>
              {x === 'confirmado' ? 'Confirmar' : x === 'cancelado' ? 'Cancelar turno' : ESTADO_LABEL[x]}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={onEdit} className={btnPrimary}>
          Editar
        </button>
        <button onClick={onClose} className={btnGhost}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export function TurnoSheet({
  state,
  tz,
  profesionales,
  sillones,
  tipos,
  onChange,
  onClose,
}: {
  state: TurnoSheetState;
  tz: string;
  profesionales: ProfesionalDto[];
  sillones: SillonDto[];
  tipos: TipoTratamientoDto[];
  onChange: (s: TurnoSheetState) => void;
  onClose: () => void;
}) {
  const title = state.type === 'create' ? 'Nuevo turno' : state.type === 'edit' ? 'Editar turno' : 'Turno';
  return (
    <Sheet title={title} onClose={onClose}>
      {state.type === 'view' ? (
        <TurnoDetail turno={state.turno} tz={tz} onEdit={() => onChange({ type: 'edit', turno: state.turno })} onClose={onClose} />
      ) : (
        <TurnoForm state={state} tz={tz} profesionales={profesionales} sillones={sillones} tipos={tipos} onClose={onClose} />
      )}
    </Sheet>
  );
}
