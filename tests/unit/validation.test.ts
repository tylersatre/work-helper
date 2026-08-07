import { describe, expect, it } from 'vitest';
import {
  createPersonInputSchema,
  entryValueSchema,
  noteTextSchema,
  titleSchema,
  updatePersonInputSchema,
} from '../../src/shared/validation.js';

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

describe('createPersonInputSchema', () => {
  it('rejects a blank first name', () => {
    const result = createPersonInputSchema.safeParse({ firstName: '', lastName: 'Rivera' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only first name', () => {
    const result = createPersonInputSchema.safeParse({ firstName: '   ', lastName: 'Rivera' });

    expect(result.success).toBe(false);
  });

  it('rejects a blank last name', () => {
    const result = createPersonInputSchema.safeParse({ firstName: 'Sam', lastName: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only last name', () => {
    const result = createPersonInputSchema.safeParse({ firstName: 'Sam', lastName: '   ' });

    expect(result.success).toBe(false);
  });

  it('trims first and last name', () => {
    const result = createPersonInputSchema.safeParse({ firstName: '  Sam  ', lastName: '  Rivera  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Sam');
      expect(result.data.lastName).toBe('Rivera');
    }
  });

  it('normalizes a blank-after-trim email to null', () => {
    const result = createPersonInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', email: '   ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('normalizes a missing email to null', () => {
    const result = createPersonInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('trims a provided email', () => {
    const result = createPersonInputSchema.safeParse({
      firstName: 'Sam',
      lastName: 'Rivera',
      email: '  sam@example.com  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('sam@example.com');
    }
  });

  it('accepts any non-blank string as an email with no format rule', () => {
    const result = createPersonInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', email: 'not-an-email' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('not-an-email');
    }
  });

  it('normalizes a blank-after-trim phone to null', () => {
    const result = createPersonInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', phone: '   ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
    }
  });

  it('trims a provided phone', () => {
    const result = createPersonInputSchema.safeParse({
      firstName: 'Sam',
      lastName: 'Rivera',
      phone: '  555-0100  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('555-0100');
    }
  });
});

describe('updatePersonInputSchema', () => {
  it('accepts names and extraFields only', () => {
    const result = updatePersonInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera' });

    expect(result.success).toBe(true);
  });

  it('rejects a blank first name', () => {
    const result = updatePersonInputSchema.safeParse({ firstName: '', lastName: 'Rivera' });

    expect(result.success).toBe(false);
  });

  it('rejects a blank last name', () => {
    const result = updatePersonInputSchema.safeParse({ firstName: 'Sam', lastName: '' });

    expect(result.success).toBe(false);
  });

  it('strips an email key if sent, rather than erroring or applying it', () => {
    const result = updatePersonInputSchema.safeParse({
      firstName: 'Sam',
      lastName: 'Rivera',
      email: 'sam@example.com',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('email');
    }
  });

  it('strips a phone key if sent, rather than erroring or applying it', () => {
    const result = updatePersonInputSchema.safeParse({ firstName: 'Sam', lastName: 'Rivera', phone: '555-0100' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('phone');
    }
  });

  it('keeps a provided extraFields value', () => {
    const result = updatePersonInputSchema.safeParse({
      firstName: 'Sam',
      lastName: 'Rivera',
      extraFields: { Nickname: 'Sammy' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extraFields).toEqual({ Nickname: 'Sammy' });
    }
  });
});

describe('entryValueSchema', () => {
  it('trims leading and trailing whitespace', () => {
    const result = entryValueSchema.safeParse('  sam.p@example.com  ');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('sam.p@example.com');
    }
  });

  it('rejects an empty string', () => {
    const result = entryValueSchema.safeParse('');

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only value', () => {
    const result = entryValueSchema.safeParse('   ');

    expect(result.success).toBe(false);
  });

  it('accepts a non-blank value with no format rule', () => {
    const result = entryValueSchema.safeParse('555-0100');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('555-0100');
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
