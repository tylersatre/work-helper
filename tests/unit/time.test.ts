import { describe, expect, it } from 'vitest';
import { absoluteLocal, relativeTime } from '../../src/client/utils/time.js';

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
