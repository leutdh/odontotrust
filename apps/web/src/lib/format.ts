import { DEFAULT_TIME_ZONE } from '@odontotrust/shared';

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' without going through Date (no timezone shift). */
export function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Timestamps are stored in UTC and shown in the clinic's zone (Argentina). */
export function formatFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: DEFAULT_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function edad(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}
