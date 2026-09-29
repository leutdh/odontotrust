import { describe, expect, it } from 'vitest';
import {
  bloqueoCreateSchema,
  dentroDeHorario,
  horariosSchema,
  rangeQuerySchema,
  turnoCreateSchema,
  type Horarios,
} from './agenda';
import { zonedParts, zonedToUtc } from './time';

const TZ = 'America/Argentina/Buenos_Aires'; // UTC-3, no DST
const horarios: Horarios = {
  '1': [['09:00', '13:00'], ['14:00', '18:00']],
  '2': [['09:00', '13:00']],
};
// 2030-01-07 is a Monday.
const at = (day: number, h: number, m = 0) => zonedToUtc(2030, 1, day, h, m, TZ);

describe('time zones', () => {
  it('converts wall-clock in Buenos Aires to UTC and back', () => {
    const d = zonedToUtc(2030, 1, 7, 9, 30, TZ);
    expect(d.toISOString()).toBe('2030-01-07T12:30:00.000Z');
    expect(zonedParts(d, TZ)).toMatchObject({ year: 2030, month: 1, day: 7, hour: 9, minute: 30, isoWeekday: 1 });
  });
  it('handles zones with DST', () => {
    // New York: EST (UTC-5) in January, EDT (UTC-4) in July.
    expect(zonedToUtc(2030, 1, 7, 9, 0, 'America/New_York').toISOString()).toBe('2030-01-07T14:00:00.000Z');
    expect(zonedToUtc(2030, 7, 8, 9, 0, 'America/New_York').toISOString()).toBe('2030-07-08T13:00:00.000Z');
  });
  it('a late UTC instant is the previous local day', () => {
    expect(zonedParts(new Date('2030-01-08T01:00:00Z'), TZ)).toMatchObject({ day: 7, hour: 22 });
  });
});

describe('dentroDeHorario', () => {
  it('accepts a turno inside a range (Monday)', () => {
    expect(dentroDeHorario(horarios, at(7, 9), at(7, 9, 30), TZ)).toBe(true);
    expect(dentroDeHorario(horarios, at(7, 12, 30), at(7, 13), TZ)).toBe(true); // ends exactly at close
  });
  it('rejects outside ranges, across the lunch gap and on days off', () => {
    expect(dentroDeHorario(horarios, at(7, 8, 30), at(7, 9, 30), TZ)).toBe(false);
    expect(dentroDeHorario(horarios, at(7, 12, 45), at(7, 14, 15), TZ)).toBe(false);
    expect(dentroDeHorario(horarios, at(7, 13), at(7, 14), TZ)).toBe(false);
    expect(dentroDeHorario(horarios, at(9, 9), at(9, 10), TZ)).toBe(false); // Wednesday: no entry
  });
  it('uses the local weekday, not the UTC one', () => {
    // Monday 22:00 local is already Tuesday in UTC; still Monday for the clinic (closed at 18).
    expect(dentroDeHorario(horarios, at(7, 22), at(7, 22, 30), TZ)).toBe(false);
  });
  it('no restriction when hours are not configured', () => {
    expect(dentroDeHorario({}, at(9, 3), at(9, 4), TZ)).toBe(true);
  });
});

describe('schemas', () => {
  it('validates horarios ranges', () => {
    expect(horariosSchema.safeParse(horarios).success).toBe(true);
    expect(horariosSchema.safeParse({ '1': [['13:00', '09:00']] }).success).toBe(false);
    expect(horariosSchema.safeParse({ '1': [['09:00', '12:00'], ['11:00', '13:00']] }).success).toBe(false);
    expect(horariosSchema.safeParse({ '8': [['09:00', '10:00']] }).success).toBe(false);
  });
  it('turno needs fin or a treatment type', () => {
    const base = {
      pacienteId: '00000000-0000-4000-8000-000000000001',
      profesionalId: '00000000-0000-4000-8000-000000000002',
      inicio: '2030-01-07T12:00:00Z',
    };
    expect(turnoCreateSchema.safeParse(base).success).toBe(false);
    expect(turnoCreateSchema.safeParse({ ...base, fin: '2030-01-07T12:30:00Z' }).success).toBe(true);
    expect(
      turnoCreateSchema.safeParse({ ...base, tipoTratamientoId: '00000000-0000-4000-8000-000000000003' }).success,
    ).toBe(true);
  });
  it('limits the agenda range and bloqueo bounds', () => {
    expect(rangeQuerySchema.safeParse({ desde: '2030-01-01T00:00:00Z', hasta: '2030-01-08T00:00:00Z' }).success).toBe(true);
    expect(rangeQuerySchema.safeParse({ desde: '2030-01-01T00:00:00Z', hasta: '2030-06-01T00:00:00Z' }).success).toBe(false);
    expect(bloqueoCreateSchema.safeParse({ inicio: '2030-01-02T10:00:00Z', fin: '2030-01-02T09:00:00Z' }).success).toBe(false);
  });
});
