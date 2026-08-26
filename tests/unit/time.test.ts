import { describe, expect, it } from 'vitest';
import { absoluteLocal, formatDueDate, parseLocalDate, relativeTime } from '../../src/client/utils/time.js';

function normalizeSpaces(value: string): string {
  return value.replace(/\u202F/g, ' ');
}

describe('relativeTime', () => {
  const now = 1_754_500_000_000;

  it('reads "just now" for under 60 seconds', () => {
    expect(relativeTime(now - 30_000, now)).toBe('just now');
  });

  it('reads "just now" at 0 seconds', () => {
    expect(relativeTime(now, now)).toBe('just now');
  });

  it('reads "1 minute ago" at the 60 second boundary', () => {
    expect(relativeTime(now - 60_000, now)).toBe('1 minute ago');
  });

  it('reads "N minute(s) ago" under 60 minutes', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago');
  });

  it('reads "1 hour ago" at the 60 minute boundary', () => {
    expect(relativeTime(now - 60 * 60_000, now)).toBe('1 hour ago');
  });

  it('reads "N hour(s) ago" under 24 hours', () => {
    expect(relativeTime(now - 5 * 60 * 60_000, now)).toBe('5 hours ago');
  });

  it('reads "1 day ago" at the 24 hour boundary', () => {
    expect(relativeTime(now - 24 * 60 * 60_000, now)).toBe('1 day ago');
  });

  it('reads "2 days ago" for a 48-hour-old instant', () => {
    expect(relativeTime(now - 48 * 60 * 60_000, now)).toBe('2 days ago');
  });
});

describe('absoluteLocal', () => {
  it('formats an instant in the given timezone as "Mon D, YYYY, h:mm AM/PM"', () => {
    const thenMs = Date.parse('2026-08-04T18:00:00Z');

    const result = normalizeSpaces(absoluteLocal(thenMs, 'America/Denver'));

    expect(result).toBe('Aug 4, 2026, 12:00 PM');
  });
});

describe('parseLocalDate', () => {
  it('returns the local-midnight epoch ms for a well-formed date', () => {
    const result = parseLocalDate('2026-08-20');

    expect(new Date(result).getFullYear()).toBe(2026);
    expect(new Date(result).getMonth()).toBe(7);
    expect(new Date(result).getDate()).toBe(20);
    expect(new Date(result).getHours()).toBe(0);
    expect(new Date(result).getMinutes()).toBe(0);
    expect(new Date(result).getSeconds()).toBe(0);
  });
});

describe('formatDueDate', () => {
  it('formats a well-formed date as a nice display string', () => {
    expect(formatDueDate('2026-08-20')).toBe('Aug 20, 2026');
  });

  it('falls back to the raw input string when it does not parse as a valid date', () => {
    expect(formatDueDate('not-a-date')).toBe('not-a-date');
  });

  it('falls back to the raw input string for an empty string', () => {
    expect(formatDueDate('')).toBe('');
  });
});
