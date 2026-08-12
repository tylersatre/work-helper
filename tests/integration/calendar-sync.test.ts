import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import type { CalendarProvider, ProviderCalendarEvent } from '../../src/server/services/calendar/provider.js';
import { FakeCalendarProvider, weeklySeries, type SeedEvent } from '../../src/server/services/calendar/fake-provider.js';
import type { MailProvider } from '../../src/server/services/email/provider.js';
import { FakeMailProvider } from './helpers/fake-mail-provider.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';

interface EventSummary {
  id: number;
  subject: string;
  startAt: number;
  endAt: number;
  isAllDay: boolean;
  isCancelled: boolean;
  location: string;
  seriesId: string | null;
}

/** Subset of get-event's structuredContent needed by the US4 series tests. */
interface EventSeriesDetail {
  id: number;
  location: string;
  startAt: number;
  endAt: number;
  seriesId: string | null;
}

/** A provider whose fetchEvents awaits an external gate before yielding — lets a test hold a sync in flight. */
class GatedCalendarProvider implements CalendarProvider {
  constructor(
    private readonly gate: Promise<void>,
    private readonly markStarted?: () => void,
  ) {}

  async *fetchEvents(): AsyncIterable<ProviderCalendarEvent[]> {
    this.markStarted?.();
    await this.gate;
    yield [];
  }
}

function pricingReview(): SeedEvent {
  return {
    id: 'evt-pricing-1',
    subject: 'Pricing review',
    start: '2026-08-14T16:00:00.000Z',
    end: '2026-08-14T16:30:00.000Z',
  };
}

function teamStandup(): SeedEvent {
  return {
    id: 'evt-standup-1',
    subject: 'Team standup',
    start: '2026-08-17T15:00:00.000Z',
    end: '2026-08-17T15:15:00.000Z',
  };
}

function septemberPlanning(): SeedEvent {
  return {
    id: 'evt-sept-1',
    subject: 'September planning',
    start: '2026-09-15T15:00:00.000Z',
    end: '2026-09-15T16:00:00.000Z',
  };
}

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client;
let serverUrl: string;
let stub: StubIdentityProvider;

function buildTestApp(calendarProvider?: CalendarProvider, mailProvider?: MailProvider) {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({
    db,
    lanes: LANES,
    mcpTokenSecret: MCP_TOKEN_SECRET,
    identityVerifier: createIdentityVerifier(stub.url),
    mailProvider,
    calendarProvider,
  } as unknown as Parameters<typeof buildApp>[0]);
}

async function startAndConnect(): Promise<void> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;

  const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub.mint('tyler') });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
}

async function postCalendarSync(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/calendar-sync/runs', payload: body });
}

async function listEvents(startDate: string | undefined, endDate: string | undefined) {
  const args: Record<string, unknown> = {};
  if (startDate !== undefined) args.startDate = startDate;
  if (endDate !== undefined) args.endDate = endDate;
  return client.callTool({ name: 'list-events', arguments: args });
}

async function getEvent(eventId: number) {
  return client.callTool({ name: 'get-event', arguments: { eventId } });
}

async function syncEmails(startDate: string, endDate: string) {
  return client.callTool({ name: 'sync-emails', arguments: { startDate, endDate } });
}

async function syncCalendar(startDate?: string, endDate?: string) {
  const args: Record<string, unknown> = {};
  if (startDate !== undefined) args.startDate = startDate;
  if (endDate !== undefined) args.endDate = endDate;
  return client.callTool({ name: 'sync-calendar', arguments: args });
}

interface CalendarSyncRunView {
  id: number;
  ranAt: number;
  startDate: string;
  endDate: string;
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}

async function getCalendarSyncRuns(): Promise<{ runs: CalendarSyncRunView[] }> {
  const response = await app.inject({ method: 'GET', url: '/api/calendar-sync/runs' });
  return response.json();
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('US1: list-events after a web-triggered calendar sync', () => {
  it('returns exactly the in-range events, chronologically by startAt, out-of-range absent', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview(), teamStandup(), septemberPlanning()]));
    await startAndConnect();

    const syncResponse = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(syncResponse.statusCode).toBe(201);

    const result = await listEvents('2026-08-01', '2026-08-31');

    expect(result.isError).toBeFalsy();
    const { events } = result.structuredContent as { events: EventSummary[] };
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.subject)).toEqual(['Pricing review', 'Team standup']);
    expect(events[0]!.startAt).toBeLessThan(events[1]!.startAt);
    expect(events.some((e) => e.subject === 'September planning')).toBe(false);
  });

  it('rejects a call missing the date range with a validation error and returns no events', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));
    await startAndConnect();

    const missingBoth = await listEvents(undefined, undefined);
    expect(missingBoth.isError).toBe(true);
    expect(JSON.stringify(missingBoth.content)).toMatch(/start date and end date/i);

    const missingEnd = await listEvents('2026-08-01', undefined);
    expect(missingEnd.isError).toBe(true);
  });

  it('rejects a range where start is after end', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));
    await startAndConnect();

    const result = await listEvents('2026-08-31', '2026-08-01');

    expect(result.isError).toBe(true);
  });
});

describe('US1: single-flight guard spans both sync kinds (FR-006)', () => {
  it('rejects a colliding sync-emails MCP call while a web-triggered calendar sync is in flight', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    buildTestApp(new GatedCalendarProvider(gate, markStarted), new FakeMailProvider([]));
    await startAndConnect();

    const calendarPromise = postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    await started;

    const emailResult = await syncEmails('2026-07-01', '2026-07-31');
    expect(emailResult.isError).toBe(true);
    expect(JSON.stringify(emailResult.content)).toMatch(/already running/i);

    release();
    const calendarResponse = await calendarPromise;
    expect(calendarResponse.statusCode).toBe(201);
  });
});

describe('US4: recurring meetings stored as linked occurrences', () => {
  const STANDUP_SERIES_MASTER_ID = 'series-team-standup-2026';
  const STANDUP_MONDAYS = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];

  /** Five weekly "Team standup" occurrences (09:00-09:15 UTC each Monday), each its own SeedEvent with a unique id, sharing one seriesMasterId (spec.md US4 acceptance scenario 1). The 2026-08-17 occurrence (index 2) is individually moved and given an exceptional location — the "moved occurrence" edge case (spec.md Edge Cases) — while keeping its own id and the shared seriesMasterId. */
  function teamStandupSeries(): SeedEvent[] {
    return weeklySeries({
      seriesMasterId: STANDUP_SERIES_MASTER_ID,
      subject: 'Team standup',
      startDate: '2026-08-03',
      startTime: '09:00',
      endTime: '09:15',
      count: 5,
      idPrefix: 'evt-standup',
      overrides: {
        2: { start: '2026-08-17T14:00:00.000Z', end: '2026-08-17T14:30:00.000Z', location: 'Room 12' },
      },
    });
  }

  function pricingReviewOneOff(): SeedEvent {
    return {
      id: 'evt-us4-pricing',
      subject: 'Pricing review',
      start: '2026-08-14T16:00:00.000Z',
      end: '2026-08-14T16:30:00.000Z',
    };
  }

  it('syncs the 5 weekly occurrences plus the one-off as 6 new events, each occurrence its own event with its own date', async () => {
    buildTestApp(new FakeCalendarProvider([...teamStandupSeries(), pricingReviewOneOff()]));
    await startAndConnect();

    const syncResponse = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(syncResponse.statusCode).toBe(201);
    expect(syncResponse.json()).toMatchObject({ newCount: 6, updatedCount: 0 });

    const result = await listEvents('2026-08-01', '2026-08-31');
    expect(result.isError).toBeFalsy();
    const { events } = result.structuredContent as { events: EventSummary[] };
    expect(events).toHaveLength(6);

    const standups = events.filter((e) => e.subject === 'Team standup');
    expect(standups).toHaveLength(5);
    expect(standups.map((e) => new Date(e.startAt).toISOString().slice(0, 10)).sort()).toEqual(STANDUP_MONDAYS);
    // Each occurrence is its own stored row.
    expect(new Set(standups.map((e) => e.id)).size).toBe(5);
  });

  it('gives two different standup occurrences the same non-null seriesId, while the one-off has none', async () => {
    buildTestApp(new FakeCalendarProvider([...teamStandupSeries(), pricingReviewOneOff()]));
    await startAndConnect();
    await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });

    const { events } = (await listEvents('2026-08-01', '2026-08-31')).structuredContent as { events: EventSummary[] };
    const standups = events.filter((e) => e.subject === 'Team standup');
    const pricingReview = events.find((e) => e.subject === 'Pricing review')!;
    expect(pricingReview).toBeDefined();

    const firstDetailResult = await getEvent(standups[0]!.id);
    const secondDetailResult = await getEvent(standups[1]!.id);
    expect(firstDetailResult.isError).toBeFalsy();
    expect(secondDetailResult.isError).toBeFalsy();
    const firstDetail = firstDetailResult.structuredContent as EventSeriesDetail;
    const secondDetail = secondDetailResult.structuredContent as EventSeriesDetail;

    expect(firstDetail.seriesId).not.toBeNull();
    expect(firstDetail.seriesId).toBe(secondDetail.seriesId);

    const pricingDetailResult = await getEvent(pricingReview.id);
    expect(pricingDetailResult.isError).toBeFalsy();
    expect((pricingDetailResult.structuredContent as EventSeriesDetail).seriesId).toBeNull();
  });

  it('keeps a moved/modified occurrence as its own event with its exceptional time and location, still carrying the series identifier', async () => {
    buildTestApp(new FakeCalendarProvider(teamStandupSeries()));
    await startAndConnect();
    await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });

    const { events } = (await listEvents('2026-08-01', '2026-08-31')).structuredContent as { events: EventSummary[] };
    expect(events).toHaveLength(5);

    const moved = events.find((e) => e.location === 'Room 12');
    expect(moved).toBeDefined();
    expect(new Date(moved!.startAt).toISOString()).toBe('2026-08-17T14:00:00.000Z');
    expect(new Date(moved!.endAt).toISOString()).toBe('2026-08-17T14:30:00.000Z');

    const seriesIds = new Set(events.map((e) => e.seriesId));
    expect(seriesIds.size).toBe(1);
    expect(seriesIds.has(null)).toBe(false);

    const movedDetailResult = await getEvent(moved!.id);
    expect(movedDetailResult.isError).toBeFalsy();
    const movedDetail = movedDetailResult.structuredContent as EventSeriesDetail;
    expect(movedDetail.location).toBe('Room 12');
    expect(movedDetail.seriesId).toBe(moved!.seriesId);
  });
});

describe('US5: re-sync refreshes events and preserves history', () => {
  /** Full detail shape returned by get-event, trimmed to the fields US5 asserts on. */
  interface EventDetailForRefresh {
    startAt: number;
    endAt: number;
    location: string;
    isCancelled: boolean;
    participants: { address: string; responseStatus: string }[];
  }

  function pricingReviewV1(): SeedEvent {
    return {
      id: 'evt-us5-pricing',
      subject: 'Pricing review',
      // 2026-08-14 10:00-10:30 (spec.md US5 scenario 1's illustrative local time).
      start: '2026-08-14T16:00:00.000Z',
      end: '2026-08-14T16:30:00.000Z',
      location: 'Conference Room B',
      attendees: [{ address: 'ana.alvarez@example.com', name: 'Ana Alvarez', type: 'optional', responseStatus: 'none' }],
    };
  }

  function pricingReviewV2Moved(): SeedEvent {
    return {
      id: 'evt-us5-pricing',
      subject: 'Pricing review',
      start: '2026-08-15T20:00:00.000Z',
      end: '2026-08-15T20:30:00.000Z',
      location: 'Room 4',
      attendees: [{ address: 'ana.alvarez@example.com', name: 'Ana Alvarez', type: 'optional', responseStatus: 'accepted' }],
    };
  }

  it('scenario 1: refreshes a moved/rescheduled event in place — 0 new / 1 updated, no duplicate', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReviewV1()]));
    await startAndConnect();

    const firstSync = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(firstSync.statusCode).toBe(201);
    expect(firstSync.json()).toMatchObject({ newCount: 1, updatedCount: 0 });

    app.calendarProvider = new FakeCalendarProvider([pricingReviewV2Moved()]);
    const secondSync = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(secondSync.statusCode).toBe(201);
    expect(secondSync.json()).toMatchObject({ newCount: 0, updatedCount: 1 });

    const result = await listEvents('2026-08-01', '2026-08-31');
    const { events } = result.structuredContent as { events: EventSummary[] };
    const pricingEvents = events.filter((e) => e.subject === 'Pricing review');
    expect(pricingEvents).toHaveLength(1);

    const detailResult = await getEvent(pricingEvents[0]!.id);
    expect(detailResult.isError).toBeFalsy();
    const detail = detailResult.structuredContent as EventDetailForRefresh;
    expect(new Date(detail.startAt).toISOString()).toBe('2026-08-15T20:00:00.000Z');
    expect(new Date(detail.endAt).toISOString()).toBe('2026-08-15T20:30:00.000Z');
    expect(detail.location).toBe('Room 4');
    const ana = detail.participants.find((p) => p.address === 'ana.alvarez@example.com');
    expect(ana?.responseStatus).toBe('accepted');
  });

  const STANDUP_SERIES_MASTER_ID = 'series-us5-standup';

  function standupSeries(): SeedEvent[] {
    return weeklySeries({
      seriesMasterId: STANDUP_SERIES_MASTER_ID,
      subject: 'Team standup',
      startDate: '2026-08-03',
      startTime: '09:00',
      endTime: '09:15',
      count: 5,
      idPrefix: 'evt-us5-standup',
    });
  }

  it('scenario 2: a removed occurrence stays stored, flagged cancelled; other occurrences unchanged', async () => {
    const fullSeries = standupSeries();
    buildTestApp(new FakeCalendarProvider(fullSeries));
    await startAndConnect();

    const firstSync = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(firstSync.json()).toMatchObject({ newCount: 5, updatedCount: 0 });

    const before = (await listEvents('2026-08-01', '2026-08-31')).structuredContent as { events: EventSummary[] };
    const removedOccurrence = before.events.find(
      (e) => e.subject === 'Team standup' && new Date(e.startAt).toISOString().slice(0, 10) === '2026-08-17',
    );
    expect(removedOccurrence).toBeDefined();
    const otherIds = before.events.filter((e) => e.id !== removedOccurrence!.id).map((e) => e.id);

    // The 2026-08-17 occurrence (index 2 of the 5 generated) disappears from the fake's seed.
    const withoutRemoved = fullSeries.filter((_, i) => i !== 2);
    app.calendarProvider = new FakeCalendarProvider(withoutRemoved);
    const secondSync = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(secondSync.json()).toMatchObject({ newCount: 0, updatedCount: 1 });

    const after = (await listEvents('2026-08-01', '2026-08-31')).structuredContent as { events: EventSummary[] };
    expect(after.events).toHaveLength(5); // still stored, nothing deleted

    const stillThere = after.events.find((e) => e.id === removedOccurrence!.id);
    expect(stillThere).toBeDefined();
    expect(stillThere!.isCancelled).toBe(true);

    const others = after.events.filter((e) => e.id !== removedOccurrence!.id);
    expect(others.every((e) => e.isCancelled === false)).toBe(true);
    expect(others.map((e) => e.id).sort()).toEqual(otherIds.sort());
  });

  it('moved-out-of-range edge case: a range-bounded sync marks the event cancelled once it moves beyond the range, then a later sync covering its new date refreshes it to active', async () => {
    const original: SeedEvent = {
      id: 'evt-us5-outrange',
      subject: 'Quarterly review',
      start: '2026-08-14T16:00:00.000Z',
      end: '2026-08-14T16:30:00.000Z',
    };
    buildTestApp(new FakeCalendarProvider([original]));
    await startAndConnect();

    const firstSync = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(firstSync.json()).toMatchObject({ newCount: 1, updatedCount: 0 });

    // Moved beyond August — an August-bounded re-sync no longer sees it in its fetch at all.
    const moved: SeedEvent = { ...original, start: '2026-09-10T16:00:00.000Z', end: '2026-09-10T16:30:00.000Z' };
    app.calendarProvider = new FakeCalendarProvider([moved]);
    const augustResync = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(augustResync.json()).toMatchObject({ newCount: 0, updatedCount: 1 });

    const augustList = (await listEvents('2026-08-01', '2026-08-31')).structuredContent as { events: EventSummary[] };
    const stillListed = augustList.events.find((e) => e.subject === 'Quarterly review');
    expect(stillListed).toBeDefined();
    expect(stillListed!.isCancelled).toBe(true);

    // A later sync covering its new date refreshes it to active.
    const septemberSync = await postCalendarSync({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(septemberSync.json()).toMatchObject({ newCount: 0, updatedCount: 1 });

    const septemberList = (await listEvents('2026-09-01', '2026-09-30')).structuredContent as { events: EventSummary[] };
    const refreshed = septemberList.events.find((e) => e.subject === 'Quarterly review');
    expect(refreshed).toBeDefined();
    expect(refreshed!.isCancelled).toBe(false);
    expect(new Date(refreshed!.startAt).toISOString()).toBe('2026-09-10T16:00:00.000Z');
  });
});

describe('US6: agents trigger calendar sync via MCP', () => {
  it('syncs exactly as a web run does and appears in the run history with source mcp and matching counts', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview(), teamStandup(), septemberPlanning()]));
    await startAndConnect();

    const result = await syncCalendar('2026-08-01', '2026-08-31');

    expect(result.isError).toBeFalsy();
    const structuredContent = result.structuredContent as { status: string; newCount: number; updatedCount: number };
    expect(structuredContent.status).toBe('complete');
    expect(structuredContent.newCount).toBe(2);
    expect(structuredContent.updatedCount).toBe(0);

    const { runs } = await getCalendarSyncRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.source).toBe('mcp');
    expect(runs[0]!.status).toBe('success');
    expect(runs[0]!.newCount).toBe(structuredContent.newCount);
    expect(runs[0]!.updatedCount).toBe(structuredContent.updatedCount);
  });

  it('rejects a call with no date range, syncing nothing and recording no history row', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));
    await startAndConnect();

    const result = await syncCalendar(undefined, undefined);

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe('A start date and end date are required');

    const { runs } = await getCalendarSyncRuns();
    expect(runs).toHaveLength(0);
  });

  it('rejects an inverted range with a validation error and no side effects', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));
    await startAndConnect();

    const result = await syncCalendar('2026-08-20', '2026-08-05');

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe('startDate and endDate must be valid YYYY-MM-DD dates, with endDate not before startDate');

    const { runs } = await getCalendarSyncRuns();
    expect(runs).toHaveLength(0);
  });

  it('returns "a sync is already running" while a gated sync is in flight', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    buildTestApp(new GatedCalendarProvider(gate, markStarted));
    await startAndConnect();

    const firstSync = postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    await started;

    const collision = await syncCalendar('2026-07-01', '2026-07-31');
    expect(collision.isError).toBe(true);
    expect(JSON.stringify(collision.content)).toMatch(/already running/i);

    release();
    const firstResponse = await firstSync;
    expect(firstResponse.statusCode).toBe(201);
  });

  it('a fully-failing run returns a tool error ending "connect the mailbox on the Sync page." and records a failure history row', async () => {
    buildTestApp(new FakeCalendarProvider([], { failImmediately: true }));
    await startAndConnect();

    const result = await syncCalendar('2026-08-01', '2026-08-31');

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/connect the mailbox on the Sync page\.$/);

    const { runs } = await getCalendarSyncRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('failure');
    expect(runs[0]!.source).toBe('mcp');
  });
});
