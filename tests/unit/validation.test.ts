import { describe, expect, it } from 'vitest';
import { noteTextSchema, personInputSchema, titleSchema } from '../../src/shared/validation.js';

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

describe('personInputSchema', () => {
  it('rejects a blank first name', () => {
    const result = personInputSchema.safeParse({ firstName: '', lastName: 'Rivera' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only first name', () => {
    const result = personInputSchema.safeParse({ firstName: '   ', lastName: 'Rivera' });

    expect(result.success).toBe(false);
  });

  it('rejects a blank last name', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only last name', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: '   ' });

    expect(result.success).toBe(false);
  });

  it('trims first and last name', () => {
    const result = personInputSchema.safeParse({ firstName: '  Sam  ', lastName: '  Rivera  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Sam');
      expect(result.data.lastName).toBe('Rivera');
    }
  });

  it('normalizes a blank-after-trim email to null', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', email: '   ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('normalizes a missing email to null', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('trims a provided email', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', email: '  sam@example.com  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('sam@example.com');
    }
  });

  it('accepts any non-blank string as an email with no format rule', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', email: 'not-an-email' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('not-an-email');
    }
  });

  it('normalizes a blank-after-trim phone to null', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', phone: '   ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
    }
  });

  it('trims a provided phone', () => {
    const result = personInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', phone: '  555-0100  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('555-0100');
    }
  });
});

describe('noteTextSchema', () => {
  it('accepts non-empty text and leaves it byte-for-byte untransformed', () => {
    const result = noteTextSchema.safeParse('  Waiting on budget numbers  ');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('  Waiting on budget numbers  ');
    }
  });

  it('preserves leading indentation and internal newlines', () => {
    const raw = '    indented code\nline two\n\nline four';
    const result = noteTextSchema.safeParse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(raw);
    }
  });

  it('rejects an empty string', () => {
    const result = noteTextSchema.safeParse('');

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only string of spaces', () => {
    const result = noteTextSchema.safeParse('   ');

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only string of tabs', () => {
    const result = noteTextSchema.safeParse('\t\t');

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only string of newlines', () => {
    const result = noteTextSchema.safeParse('\n\n');

    expect(result.success).toBe(false);
  });

  it('rejects a missing value', () => {
    const result = noteTextSchema.safeParse(undefined);

    expect(result.success).toBe(false);
  });
});
