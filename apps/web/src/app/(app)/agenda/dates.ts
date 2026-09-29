import { zonedDateKey, zonedParts, zonedToUtc } from '@odontotrust/shared';

// "Date keys" are 'YYYY-MM-DD' in the clinic's zone; all arithmetic is done on them, never on
// local-machine Dates, so the agenda looks the same whatever the device's timezone is.

export type DateKey = string;

const parts = (k: DateKey) => k.split('-').map(Number) as [number, number, number];

export function addDays(k: DateKey, n: number): DateKey {
  const [y, m, d] = parts(k);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday of the week containing `k`. */
export function startOfWeek(k: DateKey): DateKey {
  const [y, m, d] = parts(k);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(k, dow === 0 ? -6 : 1 - dow);
}

export const todayKey = (tz: string): DateKey => zonedDateKey(new Date(), tz);

/** Wall-clock (date + minutes from midnight) in `tz` -> ISO UTC string. */
export function toIso(k: DateKey, minutes: number, tz: string): string {
  const [y, m, d] = parts(k);
  return zonedToUtc(y, m, d, Math.floor(minutes / 60), minutes % 60, tz).toISOString();
}

/** ISO UTC -> { dateKey, minutes from local midnight } in `tz`. */
export function fromIso(iso: string, tz: string): { dateKey: DateKey; minutes: number } {
  const date = new Date(iso);
  const p = zonedParts(date, tz);
  return { dateKey: zonedDateKey(date, tz), minutes: p.hour * 60 + p.minute };
}

export const minutesToHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const hhmmToMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export function labelDay(k: DateKey, long = false): string {
  const [y, m, d] = parts(k);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const name = WEEKDAYS[dow === 0 ? 6 : dow - 1]!;
  return long ? `${name} ${d}/${m}` : `${name} ${d}`;
}

export function labelRange(from: DateKey, to: DateKey): string {
  const [, m1, d1] = parts(from);
  const [, m2, d2] = parts(to);
  return `${d1}/${m1} – ${d2}/${m2}`;
}

/** [desde, hasta) in UTC covering the given local days. */
export function rangeIso(from: DateKey, daysCount: number, tz: string) {
  return { desde: toIso(from, 0, tz), hasta: toIso(addDays(from, daysCount), 0, tz) };
}

export const isoWeekday = (k: DateKey): number => {
  const [y, m, d] = parts(k);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
};
