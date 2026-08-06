import { describe, expect, it } from 'vitest';
import { titleSchema } from '../../src/shared/validation.js';

describe('titleSchema', () => {
  it('accepts a non-empty title and returns it trimmed', () => {
    const result = titleSchema.safeParse('  Follow up with Sam  ');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('Follow up with Sam');
    }
  });

  it('rejects an empty string', () => {
    const result = titleSchema.safeParse('');

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    const result = titleSchema.safeParse('   ');

    expect(result.success).toBe(false);
  });

  it('rejects a missing title', () => {
    const result = titleSchema.safeParse(undefined);

    expect(result.success).toBe(false);
  });

  it('rejects a non-string title', () => {
    const result = titleSchema.safeParse(42);

    expect(result.success).toBe(false);
  });
});
