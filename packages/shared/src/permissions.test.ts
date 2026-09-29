import { describe, expect, it } from 'vitest';
import { can } from './permissions';

describe('permissions matrix', () => {
  it('recepcion has no access to clinical data', () => {
    expect(can('recepcion', 'clinico:read')).toBe(false);
    expect(can('recepcion', 'clinico:write')).toBe(false);
    expect(can('recepcion', 'pacientes:read')).toBe(true);
  });
  it('only admin manages users and clinic config', () => {
    expect(can('admin', 'usuarios:manage')).toBe(true);
    expect(can('profesional', 'usuarios:manage')).toBe(false);
    expect(can('recepcion', 'clinica:update')).toBe(false);
  });
  it('profesional reads clinical data', () => {
    expect(can('profesional', 'clinico:read')).toBe(true);
  });
});
