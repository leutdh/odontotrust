import { describe, expect, it } from 'vitest';
import { toWhatsAppNumber } from './phone';
import {
  DEFAULT_PLANTILLA_RECORDATORIO,
  formatFechaLarga,
  formatHora,
  plantillaSchema,
  renderPlantilla,
} from './recordatorios';

describe('toWhatsAppNumber (Argentina)', () => {
  it.each([
    ['+54 9 11 5555-1234', '5491155551234'],
    ['+5491155551234', '5491155551234'],
    ['5491155551234', '5491155551234'],
    ['54 11 5555 1234', '5491155551234'], // country code without the mobile 9
    ['11 5555 1234', '5491155551234'],
    ['1155551234', '5491155551234'],
    ['011 5555 1234', '5491155551234'],
    ['011 15 5555 1234', '5491155551234'], // old "15" mobile prefix
    ['11 15 5555 1234', '5491155551234'],
    ['0351 15 555 5555', '5493515555555'], // Córdoba, 3-digit area
    ['351 555 5555', '5493515555555'],
    ['00 54 9 11 5555 1234', '5491155551234'],
  ])('%s -> %s', (raw, expected) => {
    expect(toWhatsAppNumber(raw)).toBe(expected);
  });

  it('keeps foreign numbers with a country code', () => {
    expect(toWhatsAppNumber('+1 415 555 2671')).toBe('14155552671');
    expect(toWhatsAppNumber('+598 99 123 456')).toBe('59899123456');
  });

  it('rejects numbers that cannot be made reliable', () => {
    for (const bad of ['', '   ', '5555 1234', '12345', 'abc', '15 5555 1234', '+54 9 11 555']) {
      expect(toWhatsAppNumber(bad)).toBeNull();
    }
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
  });
});

describe('reminder template', () => {
  const vars = { paciente: 'Ana', fecha: 'lunes 5 de octubre', hora: '09:30', profesional: 'Dra. Uno', clinica: 'Consultorio X' };

  it('renders every variable', () => {
    const out = renderPlantilla(DEFAULT_PLANTILLA_RECORDATORIO, vars);
    expect(out).toContain('Hola Ana');
    expect(out).toContain('Consultorio X');
    expect(out).toContain('lunes 5 de octubre a las 09:30');
    expect(out).not.toMatch(/[{}]/);
  });

  it('validates placeholders', () => {
    expect(plantillaSchema.safeParse(DEFAULT_PLANTILLA_RECORDATORIO).success).toBe(true);
    expect(plantillaSchema.safeParse('Hola {nombre}, tu turno es mañana').success).toBe(false);
    expect(plantillaSchema.safeParse('corto').success).toBe(false);
    expect(plantillaSchema.safeParse('x'.repeat(801)).success).toBe(false);
  });

  it('formats date and time in the clinic zone', () => {
    // 2030-01-07T12:30Z is 09:30 in Buenos Aires (UTC-3), a Monday.
    const d = new Date('2030-01-07T12:30:00Z');
    expect(formatHora(d, 'America/Argentina/Buenos_Aires')).toBe('09:30');
    expect(formatFechaLarga(d, 'America/Argentina/Buenos_Aires')).toMatch(/^lunes 7 de enero$/);
  });
});
