import { describe, expect, it } from 'vitest';
import { FakeCalendarProvider, type SeedEvent } from '../../src/server/services/calendar/fake-provider.js';
import type { CalendarWindow, ProviderCalendarEvent } from '../../src/server/services/calendar/provider.js';

const WINDOW: CalendarWindow = { startUtc: '2026-08-10T00:00:00.000Z', endUtc: '2026-08-11T00:00:00.000Z' };

function seed(id: string, start: string, end: string, overrides: Partial<SeedEvent> = {}): SeedEvent {
  return { id, subject: id, start, end, ...overrides };
}

async function collectPages(provider: FakeCalendarProvider, window: CalendarWindow): Promise<ProviderCalendarEvent[][]> {
  const pages: ProviderCalendarEvent[][] = [];
  for await (const page of provider.fetchEvents(window)) {
    pages.push(page);
  }
  return pages;
}

async function collectIds(provider: FakeCalendarProvider, window: CalendarWindow): Promise<string[]> {
  const pages = await collectPages(provider, window);
  return pages.flat().map((e) => e.id);
}

describe('FakeCalendarProvider window-overlap semantics', () => {
  it('includes an event fully inside the window', async () => {
    const provider = new FakeCalendarProvider([seed('inside', '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual(['inside']);
  });

  it('includes an event starting before the window and ending inside it', async () => {
    const provider = new FakeCalendarProvider([seed('spans-start', '2026-08-09T22:00:00.000Z', '2026-08-10T01:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual(['spans-start']);
  });

  it('includes an event starting inside the window and ending after it', async () => {
    const provider = new FakeCalendarProvider([seed('spans-end', '2026-08-10T23:00:00.000Z', '2026-08-11T01:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual(['spans-end']);
  });

  it('includes an event that starts before and ends after the window (spans it entirely)', async () => {
    const provider = new FakeCalendarProvider([seed('spans-whole', '2026-08-09T00:00:00.000Z', '2026-08-12T00:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual(['spans-whole']);
  });

  it('excludes an event entirely before the window', async () => {
    const provider = new FakeCalendarProvider([seed('before', '2026-08-08T10:00:00.000Z', '2026-08-08T11:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual([]);
  });

  it('excludes an event entirely after the window', async () => {
    const provider = new FakeCalendarProvider([seed('after', '2026-08-12T10:00:00.000Z', '2026-08-12T11:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual([]);
  });

  it('excludes an event that ends exactly at the window start (adjacent, disjoint)', async () => {
    const provider = new FakeCalendarProvider([seed('touches-start', '2026-08-09T23:00:00.000Z', '2026-08-10T00:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual([]);
  });

  it('excludes an event that starts exactly at the window end (adjacent, disjoint)', async () => {
    const provider = new FakeCalendarProvider([seed('touches-end', '2026-08-11T00:00:00.000Z', '2026-08-11T01:00:00.000Z')]);
    expect(await collectIds(provider, WINDOW)).toEqual([]);
  });

  it('handles a multi-day all-day span overlapping only the tail of the window', async () => {
    const provider = new FakeCalendarProvider([
      seed('multi-day', '2026-08-08T00:00:00.000Z', '2026-08-10T12:00:00.000Z', { isAllDay: true }),
    ]);
    expect(await collectIds(provider, WINDOW)).toEqual(['multi-day']);
  });

  it('handles a multi-day all-day span that does not reach the window at all', async () => {
    const provider = new FakeCalendarProvider([
      seed('multi-day-far', '2026-08-01T00:00:00.000Z', '2026-08-05T00:00:00.000Z', { isAllDay: true }),
    ]);
    expect(await collectIds(provider, WINDOW)).toEqual([]);
  });

  it('returns only the overlapping events out of a mixed set, in seed order', async () => {
    const provider = new FakeCalendarProvider([
      seed('before', '2026-08-08T10:00:00.000Z', '2026-08-08T11:00:00.000Z'),
      seed('inside', '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'),
      seed('after', '2026-08-12T10:00:00.000Z', '2026-08-12T11:00:00.000Z'),
      seed('spans-whole', '2026-08-09T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
    ]);
    expect(await collectIds(provider, WINDOW)).toEqual(['inside', 'spans-whole']);
  });
});

describe('FakeCalendarProvider paging', () => {
  it('yields events in batches of the configured page size', async () => {
    const events = Array.from({ length: 5 }, (_, i) => seed(`evt-${i}`, '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'));
    const provider = new FakeCalendarProvider(events, { pageSize: 2 });

    const pages = await collectPages(provider, WINDOW);

    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(pages.flat().map((e) => e.id)).toEqual(['evt-0', 'evt-1', 'evt-2', 'evt-3', 'evt-4']);
  });

  it('defaults to a page size of 25 when unspecified', async () => {
    const events = Array.from({ length: 26 }, (_, i) => seed(`evt-${i}`, '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'));
    const provider = new FakeCalendarProvider(events);

    const pages = await collectPages(provider, WINDOW);

    expect(pages.map((p) => p.length)).toEqual([25, 1]);
  });
});

describe('FakeCalendarProvider failure injection', () => {
  it('throws immediately without yielding any page when failImmediately is set', async () => {
    const provider = new FakeCalendarProvider([seed('inside', '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z')], {
      failImmediately: true,
    });

    const pages: ProviderCalendarEvent[][] = [];
    await expect(async () => {
      for await (const page of provider.fetchEvents(WINDOW)) {
        pages.push(page);
      }
    }).rejects.toThrow();
    expect(pages).toEqual([]);
  });

  it('throws after the configured cumulative event count, having already yielded prior pages', async () => {
    const events = Array.from({ length: 4 }, (_, i) => seed(`evt-${i}`, '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'));
    const provider = new FakeCalendarProvider(events, { pageSize: 1, throwAfterEventCount: 2 });

    const pages: ProviderCalendarEvent[][] = [];
    await expect(async () => {
      for await (const page of provider.fetchEvents(WINDOW)) {
        pages.push(page);
      }
    }).rejects.toThrow();

    expect(pages.map((p) => p.length)).toEqual([1, 1]);
    expect(pages.flat().map((e) => e.id)).toEqual(['evt-0', 'evt-1']);
  });

  it('does not throw when throwAfterEventCount is never reached', async () => {
    const events = Array.from({ length: 2 }, (_, i) => seed(`evt-${i}`, '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'));
    const provider = new FakeCalendarProvider(events, { pageSize: 1, throwAfterEventCount: 10 });

    const pages = await collectPages(provider, WINDOW);
    expect(pages.map((p) => p.length)).toEqual([1, 1]);
  });
});
