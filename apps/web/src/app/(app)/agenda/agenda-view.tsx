'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { BloqueoDto, TurnoDto } from '@odontotrust/shared';
import { btnGhost, btnPrimary, inputClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';
import { BloqueoSheet, type BloqueoSheetState } from './bloqueo-sheet';
import { addDays, fromIso, labelDay, labelRange, rangeIso, startOfWeek, todayKey, toIso, type DateKey } from './dates';
import { useBloqueos, useProfesionales, useSillones, useTipos, useTurnos } from './queries';
import { Timeline, type Column } from './timeline';
import { TurnoSheet, type TurnoSheetState } from './turno-sheet';

type View = 'dia' | 'semana';
const WIDE = '(min-width: 1024px)';
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
type MoveVars = { turno: TurnoDto; inicio: string; fin: string; profesionalId: string; sobreturno?: boolean };

export function AgendaView({ tz }: { tz: string }) {
  const qc = useQueryClient();
  const profesionales = useProfesionales();
  const sillones = useSillones();
  const tipos = useTipos();

  const [dateKey, setDateKey] = useState<DateKey>(() => todayKey(tz));
  // Week view by default on wide screens, day view on phones; the user's choice wins.
  const isWide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const [viewChoice, setView] = useState<View | null>(null);
  const view: View = viewChoice ?? (isWide ? 'semana' : 'dia');
  const [filterChoice, setFilter] = useState<string | null>(null);
  const [showCancelados, setShowCancelados] = useState(false);
  const [turnoSheet, setTurnoSheet] = useState<TurnoSheetState | null>(null);
  const [bloqueoSheet, setBloqueoSheet] = useState<BloqueoSheetState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ vars: MoveVars; message: string } | null>(null);

  const profs = useMemo(() => profesionales.data ?? [], [profesionales.data]);
  // 'todos' or a professional id. Defaults to the logged-in professional's own agenda.
  const filter = filterChoice ?? profs.find((p) => p.esYo)?.id ?? 'todos';

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const weekStart = startOfWeek(dateKey);
  const { desde, hasta } = view === 'dia' ? rangeIso(dateKey, 1, tz) : rangeIso(weekStart, 7, tz);
  const turnos = useTurnos(desde, hasta);
  const bloqueos = useBloqueos(desde, hasta);

  const columns: Column[] = useMemo(() => {
    const visible = filter !== 'todos' ? profs.filter((p) => p.id === filter) : profs;
    const base = (p: (typeof profs)[number], key: DateKey) => ({
      dateKey: key,
      profesionalId: p.id,
      color: p.color,
      horarios: p.horarios,
    });
    if (view === 'dia') {
      return visible.map((p) => ({ ...base(p, dateKey), id: `${dateKey}|${p.id}`, title: p.nombre, subtitle: p.especialidad ?? undefined }));
    }
    const p = visible[0];
    if (!p) return [];
    const today = todayKey(tz);
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(weekStart, i);
      return { ...base(p, key), id: `${key}|${p.id}`, title: labelDay(key), subtitle: key === today ? 'Hoy' : undefined };
    });
  }, [view, dateKey, weekStart, filter, profs, tz]);

  const move = useMutation({
    mutationFn: (v: MoveVars) =>
      api<TurnoDto>(`/turnos/${v.turno.id}`, {
        method: 'PATCH',
        body: { inicio: v.inicio, fin: v.fin, profesionalId: v.profesionalId, ...(v.sobreturno && { sobreturno: true }) },
      }),
    // Optimistic: the block jumps immediately; rolled back if the server refuses.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['turnos'] });
      const snapshot = qc.getQueriesData<TurnoDto[]>({ queryKey: ['turnos'] });
      const prof = profs.find((p) => p.id === v.profesionalId);
      qc.setQueriesData<TurnoDto[]>({ queryKey: ['turnos'] }, (old) =>
        old?.map((t) =>
          t.id === v.turno.id
            ? { ...t, inicio: v.inicio, fin: v.fin, profesional: prof ? { id: prof.id, nombre: prof.nombre, color: prof.color } : t.profesional }
            : t,
        ),
      );
      return { snapshot };
    },
    onError: (err, v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      if (err instanceof ApiError && err.code === 'fuera_de_horario') {
        setPendingMove({ vars: v, message: err.message });
      } else {
        setNotice(err instanceof ApiError ? err.message : 'No se pudo mover el turno.');
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['turnos'] }),
  });

  function onMove(turno: TurnoDto, target: { col: Column; minutes: number }) {
    const inicio = toIso(target.col.dateKey, target.minutes, tz);
    if (inicio === turno.inicio && target.col.profesionalId === turno.profesional.id) return;
    const duration = new Date(turno.fin).getTime() - new Date(turno.inicio).getTime();
    move.mutate({
      turno,
      inicio,
      fin: new Date(new Date(inicio).getTime() + duration).toISOString(),
      profesionalId: target.col.profesionalId,
    });
  }

  function openNewTurno() {
    const first = columns[0];
    const profesionalId = first?.profesionalId ?? profs[0]?.id;
    if (!profesionalId) return setNotice('Primero cargá un profesional en Configuración.');
    // Today: next quarter hour (clinic time); other days: 09:00.
    const minutes = dateKey === todayKey(tz) ? Math.ceil(fromIso(new Date().toISOString(), tz).minutes / 15) * 15 : 9 * 60;
    setTurnoSheet({ type: 'create', profesionalId, dateKey: view === 'dia' ? dateKey : (first?.dateKey ?? dateKey), minutes: Math.min(minutes, 23 * 60) });
  }

  const step = view === 'dia' ? 1 : 7;
  const title = view === 'dia' ? labelDay(dateKey, true) : labelRange(weekStart, addDays(weekStart, 6));
  const loading = turnos.isPending || bloqueos.isPending || profesionales.isPending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button aria-label="Anterior" onClick={() => setDateKey(addDays(dateKey, -step))} className={`${btnGhost} px-3`}>
          ‹
        </button>
        <button aria-label="Siguiente" onClick={() => setDateKey(addDays(dateKey, step))} className={`${btnGhost} px-3`}>
          ›
        </button>
        <button onClick={() => setDateKey(todayKey(tz))} className={btnGhost}>
          Hoy
        </button>
        <h1 className="mx-1 text-lg font-semibold">{title}</h1>
        <div className="ml-auto flex overflow-hidden rounded-md border border-neutral-300 text-sm dark:border-neutral-700">
          {(['dia', 'semana'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 ${view === v ? 'bg-sky-600 text-white' : ''}`}
              aria-pressed={view === v}
            >
              {v === 'dia' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Profesional"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${inputClass} w-auto py-2 text-sm`}
        >
          {view === 'dia' && <option value="todos">Todos los profesionales</option>}
          {profs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
          <input type="checkbox" checked={showCancelados} onChange={(e) => setShowCancelados(e.target.checked)} />
          Ver cancelados
        </label>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setBloqueoSheet({ type: 'create', dateKey: view === 'dia' ? dateKey : weekStart, profesionalId: filter !== 'todos' ? filter : null })}
            className={btnGhost}
          >
            Bloquear
          </button>
          <button onClick={openNewTurno} className={btnPrimary}>
            + Turno
          </button>
        </div>
      </div>

      {notice && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {notice}
        </p>
      )}
      {(turnos.isError || bloqueos.isError) && (
        <p role="alert" className="text-sm text-red-600">
          No se pudo cargar la agenda. Reintentá en unos segundos.
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-neutral-500">Cargando agenda…</p>
      ) : columns.length === 0 ? (
        <p className="py-10 text-center text-neutral-500">Todavía no hay profesionales cargados. Agregalos en Configuración.</p>
      ) : (
        <Timeline
          columns={columns}
          turnos={turnos.data ?? []}
          bloqueos={bloqueos.data ?? ([] as BloqueoDto[])}
          tz={tz}
          showCancelados={showCancelados}
          onCreate={(col, minutes) => setTurnoSheet({ type: 'create', profesionalId: col.profesionalId, dateKey: col.dateKey, minutes })}
          onOpenTurno={(t) => setTurnoSheet({ type: 'view', turno: t })}
          onOpenBloqueo={(b) => setBloqueoSheet({ type: 'view', bloqueo: b })}
          onMove={onMove}
        />
      )}
      <p className="text-xs text-neutral-500">
        Tocá un horario vacío para crear un turno. Arrastrá un turno para moverlo (en el celular, mantenelo apretado).
      </p>

      {turnoSheet && (
        <TurnoSheet
          state={turnoSheet}
          tz={tz}
          profesionales={profs}
          sillones={sillones.data ?? []}
          tipos={tipos.data ?? []}
          onChange={setTurnoSheet}
          onClose={() => setTurnoSheet(null)}
        />
      )}
      {bloqueoSheet && <BloqueoSheet state={bloqueoSheet} tz={tz} profesionales={profs} onClose={() => setBloqueoSheet(null)} />}

      {pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900">
            <p>{pendingMove.message}. ¿Mover igual como sobreturno?</p>
            <div className="flex gap-3">
              <button
                className={btnPrimary}
                onClick={() => {
                  move.mutate({ ...pendingMove.vars, sobreturno: true });
                  setPendingMove(null);
                }}
              >
                Sí, mover
              </button>
              <button className={btnGhost} onClick={() => setPendingMove(null)}>
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
