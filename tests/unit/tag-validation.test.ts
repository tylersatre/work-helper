import { describe, expect, it } from 'vitest';
import { tagColorSchema, tagNameSchema } from '../../src/shared/validation.js';

describe('tagNameSchema', () => {
  it('trims surrounding whitespace and returns the trimmed name', () => {
    const result = tagNameSchema.safeParse('  VIP  ');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('VIP');
    }
  });

  it('rejects an empty name with "A name is required"', () => {
    const result = tagNameSchema.safeParse('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('A name is required');
    }
  });

  it('rejects a whitespace-only name with "A name is required"', () => {
    const result = tagNameSchema.safeParse('   ');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('A name is required');
    }
  });

  it('accepts a valid name and returns it trimmed', () => {
    const result = tagNameSchema.safeParse('Roadmap');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('Roadmap');
    }
  });
});

describe('tagColorSchema', () => {
  it('accepts a #RRGGBB hex string', () => {
    const result = tagColorSchema.safeParse('#3B82F6');

    expect(result.success).toBe(true);
  });

  it('rejects a non-hex string with "A valid color is required"', () => {
    const result = tagColorSchema.safeParse('blue');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('A valid color is required');
    }
  });

  it('rejects a short hex code', () => {
    const result = tagColorSchema.safeParse('#FFF');

    expect(result.success).toBe(false);
  });

  it('rejects a hex code missing the leading #', () => {
    const result = tagColorSchema.safeParse('3B82F6');

    expect(result.success).toBe(false);
  });
});
