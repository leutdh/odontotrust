'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { BloqueoDto, ProfesionalDto } from '@odontotrust/shared';
import { Sheet } from '@/components/sheet';
import { btnDanger, btnGhost, btnPrimary, inputClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';
import { fromIso, hhmmToMin, minutesToHHMM, toIso, type DateKey } from './dates';

export type BloqueoSheetState = { type: 'create'; dateKey: DateKey; profesionalId: string | null } | { type: 'view'; bloqueo: BloqueoDto };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}

export function BloqueoSheet({
  state,
  tz,
  profesionales,
  onClose,
}: {
  state: BloqueoSheetState;
  tz: string;
  profesionales: ProfesionalDto[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [profesionalId, setProfesionalId] = useState(state.type === 'create' ? (state.profesionalId ?? '') : '');
  const day = state.type === 'create' ? state.dateKey : '';
  const [desdeFecha, setDesdeFecha] = useState<DateKey>(day);
  const [desdeHora, setDesdeHora] = useState('12:00');
  const [hastaFecha, setHastaFecha] = useState<DateKey>(day);
  const [hastaHora, setHastaHora] = useState('13:00');
  const [motivo, setMotivo] = useState('');

  async function done() {
    await qc.invalidateQueries({ queryKey: ['bloqueos'] });
    onClose();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api('/bloqueos', {
        method: 'POST',
        body: {
          profesionalId: profesionalId || null,
          inicio: toIso(desdeFecha, hhmmToMin(desdeHora), tz),
          fin: toIso(hastaFecha, hhmmToMin(hastaHora), tz),
          motivo,
        },
      });
      await done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      await api(`/bloqueos/${id}`, { method: 'DELETE' });
      await done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar.');
      setPending(false);
    }
  }

  if (state.type === 'view') {
    const b = state.bloqueo;
    const s = fromIso(b.inicio, tz);
    const e = fromIso(b.fin, tz);
    const who = b.profesionalId ? profesionales.find((p) => p.id === b.profesionalId)?.nombre : 'Toda la clínica';
    return (
      <Sheet title="Bloqueo de horario" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-medium">{b.motivo ?? 'Sin motivo'}</p>
            <p className="text-sm text-neutral-500">{who}</p>
            <p className="text-sm text-neutral-500">
              {s.dateKey} {minutesToHHMM(s.minutes)} → {e.dateKey} {minutesToHHMM(e.minutes)}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button disabled={pending} onClick={() => void remove(b.id)} className={btnDanger}>
              Eliminar bloqueo
            </button>
            <button onClick={onClose} className={btnGhost}>
              Cerrar
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Bloquear horario" onClose={onClose}>
      <form onSubmit={create} className="flex flex-col gap-4">
        <Field label="Aplica a">
          <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className={inputClass}>
            <option value="">Toda la clínica</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde (fecha)">
            <input type="date" required value={desdeFecha} onChange={(e) => setDesdeFecha(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Desde (hora)">
            <input type="time" required value={desdeHora} onChange={(e) => setDesdeHora(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Hasta (fecha)">
            <input type="date" required value={hastaFecha} onChange={(e) => setHastaFecha(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Hasta (hora)">
            <input type="time" required value={hastaHora} onChange={(e) => setHastaHora(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Motivo (almuerzo, vacaciones, congreso…)">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} />
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
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancelar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
