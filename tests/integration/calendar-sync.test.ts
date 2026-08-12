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
import { FakeCalendarProvider, type SeedEvent } from '../../src/server/services/calendar/fake-provider.js';
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

async function syncEmails(startDate: string, endDate: string) {
  return client.callTool({ name: 'sync-emails', arguments: { startDate, endDate } });
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
