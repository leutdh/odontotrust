// Timestamps are stored in UTC (timestamptz); wall-clock logic happens in the clinic's zone.

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number; // 1 = Monday ... 7 = Sunday
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isoWeekdayOf(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const p: Record<string, number> = {};
  for (const { type, value } of formatter(tz).formatToParts(date)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  const year = p.year!;
  const month = p.month!;
  const day = p.day!;
  return { year, month, day, hour: p.hour!, minute: p.minute!, isoWeekday: isoWeekdayOf(year, month, day) };
}

/** Wall-clock time in `tz` -> the UTC instant. Handles zones with or without DST. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wall - seen;
  }
  return new Date(guess);
}

/** 'YYYY-MM-DD' of the given instant in `tz`. */
export function zonedDateKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export const hhmmToMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
