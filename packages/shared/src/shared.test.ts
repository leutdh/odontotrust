import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseEnv, rolSchema } from './index';

describe('shared', () => {
  it('validates roles', () => {
    expect(rolSchema.parse('admin')).toBe('admin');
    expect(() => rolSchema.parse('otro')).toThrow();
  });
  it('parseEnv reports missing variables without values', () => {
    expect(() => parseEnv(z.object({ FOO: z.string() }), {})).toThrow(/FOO/);
  });
});
