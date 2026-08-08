import { describe, expect, it } from 'vitest';
import { computeSyncWindow } from '../../src/server/services/email/sync.js';

describe('computeSyncWindow', () => {
  it('converts a YYYY-MM-DD range to a UTC window spanning whole local days (America/Denver, UTC-6 in July)', () => {
    const window = computeSyncWindow('2026-07-01', '2026-07-31');

    expect(window.startUtc).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    expect(window.endUtc).toBe(new Date(2026, 7, 1, 0, 0, 0, 0).toISOString());
  });

  it('includes a message timestamped 23:30 local on the end day even though it is already the next day in UTC', () => {
    const window = computeSyncWindow('2026-07-01', '2026-07-31');
    const lateOnEndDay = new Date(2026, 6, 31, 23, 30, 0, 0);

    expect(lateOnEndDay.getTime()).toBeGreaterThanOrEqual(Date.parse(window.startUtc));
    expect(lateOnEndDay.getTime()).toBeLessThan(Date.parse(window.endUtc));
  });

  it('excludes a message at local midnight of the day after the range', () => {
    const window = computeSyncWindow('2026-07-01', '2026-07-31');
    const dayAfter = new Date(2026, 7, 1, 0, 0, 0, 0);

    expect(dayAfter.getTime()).toBeGreaterThanOrEqual(Date.parse(window.endUtc));
  });

  it('accepts a single-day range where start equals end', () => {
    const window = computeSyncWindow('2026-07-15', '2026-07-15');

    expect(window.startUtc).toBe(new Date(2026, 6, 15, 0, 0, 0, 0).toISOString());
    expect(window.endUtc).toBe(new Date(2026, 6, 16, 0, 0, 0, 0).toISOString());
  });

  it('rejects a malformed start date', () => {
    expect(() => computeSyncWindow('2026-13-01', '2026-07-31')).toThrow();
    expect(() => computeSyncWindow('not-a-date', '2026-07-31')).toThrow();
    expect(() => computeSyncWindow('', '2026-07-31')).toThrow();
  });

  it('rejects a malformed end date', () => {
    expect(() => computeSyncWindow('2026-07-01', '2026-07-32')).toThrow();
  });

  it('rejects a range where start is after end', () => {
    expect(() => computeSyncWindow('2026-07-31', '2026-07-01')).toThrow();
  });
});
