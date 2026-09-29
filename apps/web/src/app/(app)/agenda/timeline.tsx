'use client';

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { BloqueoDto, Horarios, TurnoDto } from '@odontotrust/shared';
import { fromIso, isoWeekday, minutesToHHMM, todayKey, type DateKey } from './dates';

export type Column = {
  id: string;
  dateKey: DateKey;
  profesionalId: string;
  title: string;
  subtitle?: string;
  color: string | null;
  horarios: Horarios;
};

const PPM = 1; // pixels per minute (60 px per hour)
const SNAP = 15; // minutes
const DEFAULT_COLOR = '#0ea5e9';

type Props = {
  columns: Column[];
  turnos: TurnoDto[];
  bloqueos: BloqueoDto[];
  tz: string;
  showCancelados: boolean;
  onCreate: (col: Column, minutes: number) => void;
  onOpenTurno: (t: TurnoDto) => void;
  onOpenBloqueo: (b: BloqueoDto) => void;
  onMove: (t: TurnoDto, target: { col: Column; minutes: number }) => void;
};

function useNowMinutes(tz: string) {
  const compute = () => fromIso(new Date().toISOString(), tz).minutes;
  const [now, setNow] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setNow(compute()), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);
  return now;
}

/** Working ranges of the professional that day, in minutes. `null` = not configured (no shading). */
function workingRanges(col: Column): [number, number][] | null {
  if (Object.keys(col.horarios).length === 0) return null;
  const ranges = col.horarios[String(isoWeekday(col.dateKey)) as keyof Horarios] ?? [];
  return ranges.map(([a, b]) => [Number(a.slice(0, 2)) * 60 + Number(a.slice(3)), Number(b.slice(0, 2)) * 60 + Number(b.slice(3))]);
}

function TurnoBlock({
  turno,
  top,
  height,
  color,
  dragging,
  onOpen,
}: {
  turno: TurnoDto;
  top: number;
  height: number;
  color: string;
  dragging: React.RefObject<boolean>;
  onOpen: (t: TurnoDto) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: turno.id,
    data: { turno },
  });
  const cancelado = turno.estado === 'cancelado';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        if (!dragging.current) onOpen(turno);
      }}
      className={`absolute left-1 right-1 cursor-grab overflow-hidden rounded-md px-1.5 py-0.5 text-xs leading-tight shadow-sm ${
        isDragging ? 'z-30 opacity-80 shadow-lg' : 'z-10'
      } ${cancelado ? 'line-through opacity-40' : ''} ${turno.estado === 'atendido' ? 'opacity-70' : ''}`}
      style={{
        top,
        height: Math.max(height, 18),
        background: `${color}26`,
        borderLeft: `4px ${turno.estado === 'pendiente' ? 'dashed' : 'solid'} ${color}`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        touchAction: 'manipulation',
      }}
    >
      <div className="truncate font-medium">
        {turno.paciente.apellido}, {turno.paciente.nombre}
      </div>
      {height >= 36 && (
        <div className="truncate text-neutral-600 dark:text-neutral-400">
          {turno.tipoTratamiento?.nombre ?? '—'}
          {turno.estado === 'ausente' && ' · ausente'}
          {turno.estado === 'confirmado' && ' · ✓'}
        </div>
      )}
    </div>
  );
}

function ColumnView({
  col,
  turnos,
  bloqueos,
  tz,
  rangeStart,
  rangeEnd,
  now,
  showCancelados,
  dragging,
  onCreate,
  onOpenTurno,
  onOpenBloqueo,
}: {
  col: Column;
  turnos: TurnoDto[];
  bloqueos: BloqueoDto[];
  tz: string;
  rangeStart: number;
  rangeEnd: number;
  now: number | null;
  showCancelados: boolean;
  dragging: React.RefObject<boolean>;
  onCreate: Props['onCreate'];
  onOpenTurno: Props['onOpenTurno'];
  onOpenBloqueo: Props['onOpenBloqueo'];
}) {
  const { setNodeRef } = useDroppable({ id: col.id, data: { col } });
  const ref = useRef<HTMLDivElement | null>(null);
  const height = (rangeEnd - rangeStart) * PPM;
  const color = col.color ?? DEFAULT_COLOR;

  const working = workingRanges(col);
  const shaded: [number, number][] = [];
  if (working) {
    let cursor = rangeStart;
    for (const [a, b] of [...working].sort((x, y) => x[0] - y[0])) {
      if (a > cursor) shaded.push([cursor, Math.min(a, rangeEnd)]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < rangeEnd) shaded.push([cursor, rangeEnd]);
  }

  function onBackgroundClick(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const raw = rangeStart + (e.clientY - rect.top) / PPM;
    onCreate(col, Math.max(0, Math.floor(raw / SNAP) * SNAP));
  }

  return (
    <div className="min-w-[150px] flex-1 border-l border-neutral-200 dark:border-neutral-800">
      <div className="sticky top-14 z-20 flex h-10 flex-col justify-center border-b border-neutral-200 bg-white px-2 text-center text-sm dark:border-neutral-800 dark:bg-neutral-950">
        <span className="truncate font-medium" style={{ color }}>
          {col.title}
        </span>
        {col.subtitle && <span className="truncate text-[11px] text-neutral-500">{col.subtitle}</span>}
      </div>
      <div
        ref={(el) => {
          ref.current = el;
          setNodeRef(el);
        }}
        onClick={onBackgroundClick}
        className="relative"
        style={{
          height,
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 59px, rgb(163 163 163 / 0.25) 59px, rgb(163 163 163 / 0.25) 60px)',
        }}
      >
        {shaded.map(([a, b]) => (
          <div
            key={`${a}-${b}`}
            className="pointer-events-none absolute inset-x-0 bg-neutral-200/60 dark:bg-neutral-800/60"
            style={{ top: (a - rangeStart) * PPM, height: (b - a) * PPM }}
          />
        ))}

        {bloqueos.map((b) => {
          const start = fromIso(b.inicio, tz);
          const end = fromIso(b.fin, tz);
          const a = start.dateKey < col.dateKey ? 0 : start.minutes;
          const z = end.dateKey > col.dateKey ? 24 * 60 : end.minutes;
          if (z <= a) return null;
          return (
            <div
              key={b.id}
              onClick={(e) => {
                e.stopPropagation();
                onOpenBloqueo(b);
              }}
              className="absolute inset-x-0 z-[5] cursor-pointer overflow-hidden px-1 text-[11px] text-neutral-600 dark:text-neutral-300"
              style={{
                top: (a - rangeStart) * PPM,
                height: (z - a) * PPM,
                background:
                  'repeating-linear-gradient(45deg, rgb(115 115 115 / 0.25) 0, rgb(115 115 115 / 0.25) 6px, rgb(115 115 115 / 0.08) 6px, rgb(115 115 115 / 0.08) 12px)',
              }}
            >
              {b.motivo ?? 'Bloqueado'}
            </div>
          );
        })}

        {turnos
          .filter((t) => showCancelados || t.estado !== 'cancelado')
          .map((t) => {
            const s = fromIso(t.inicio, tz).minutes;
            const e = fromIso(t.fin, tz);
            const end = e.dateKey > col.dateKey ? 24 * 60 : e.minutes;
            return (
              <TurnoBlock
                key={t.id}
                turno={t}
                top={(s - rangeStart) * PPM}
                height={(end - s) * PPM}
                color={color}
                dragging={dragging}
                onOpen={onOpenTurno}
              />
            );
          })}

        {now !== null && now >= rangeStart && now <= rangeEnd && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
            style={{ top: (now - rangeStart) * PPM }}
          />
        )}
      </div>
    </div>
  );
}

export function Timeline({ columns, turnos, bloqueos, tz, showCancelados, onCreate, onOpenTurno, onOpenBloqueo, onMove }: Props) {
  const dragging = useRef(false);
  const nowMinutes = useNowMinutes(tz);
  const today = todayKey(tz);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch screens so vertical scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // Visible hours: 8-20 by default, widened to fit any turno outside that.
  let first = 8 * 60;
  let last = 20 * 60;
  for (const t of turnos) {
    first = Math.min(first, Math.floor(fromIso(t.inicio, tz).minutes / 60) * 60);
    const e = fromIso(t.fin, tz);
    last = Math.max(last, e.dateKey === fromIso(t.inicio, tz).dateKey ? Math.ceil(e.minutes / 60) * 60 : 24 * 60);
  }
  const rangeStart = first;
  const rangeEnd = Math.min(last, 24 * 60);

  const hours: number[] = [];
  for (let m = rangeStart; m < rangeEnd; m += 60) hours.push(m);

  function handleDragEnd(e: DragEndEvent) {
    setTimeout(() => (dragging.current = false), 0);
    const turno = e.active.data.current?.turno as TurnoDto | undefined;
    const col = e.over?.data.current?.col as Column | undefined;
    const moved = e.active.rect.current.translated;
    if (!turno || !col || !e.over || !moved) return;
    const duration = (new Date(turno.fin).getTime() - new Date(turno.inicio).getTime()) / 60_000;
    const raw = rangeStart + (moved.top - e.over.rect.top) / PPM;
    const minutes = Math.min(Math.max(0, Math.round(raw / SNAP) * SNAP), 24 * 60 - Math.min(duration, 24 * 60));
    onMove(turno, { col, minutes });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={() => (dragging.current = true)}
      onDragCancel={() => setTimeout(() => (dragging.current = false), 0)}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex min-w-full">
          <div className="w-11 shrink-0">
            <div className="h-10" />
            <div className="relative" style={{ height: (rangeEnd - rangeStart) * PPM }}>
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute right-1 -translate-y-1.5 text-[11px] text-neutral-500"
                  style={{ top: (m - rangeStart) * PPM }}
                >
                  {minutesToHHMM(m)}
                </div>
              ))}
            </div>
          </div>
          {columns.map((col) => (
            <ColumnView
              key={col.id}
              col={col}
              tz={tz}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              now={col.dateKey === today ? nowMinutes : null}
              showCancelados={showCancelados}
              dragging={dragging}
              turnos={turnos.filter((t) => t.profesional.id === col.profesionalId && fromIso(t.inicio, tz).dateKey === col.dateKey)}
              bloqueos={bloqueos.filter((b) => {
                if (b.profesionalId && b.profesionalId !== col.profesionalId) return false;
                return fromIso(b.inicio, tz).dateKey <= col.dateKey && fromIso(b.fin, tz).dateKey >= col.dateKey;
              })}
              onCreate={onCreate}
              onOpenTurno={onOpenTurno}
              onOpenBloqueo={onOpenBloqueo}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}
