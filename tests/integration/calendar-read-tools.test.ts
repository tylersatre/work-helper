import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import type { CalendarProvider } from '../../src/server/services/calendar/provider.js';
import { FakeCalendarProvider, type SeedEvent } from '../../src/server/services/calendar/fake-provider.js';
import type { MailProvider } from '../../src/server/services/email/provider.js';
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

interface Participant {
  address: string;
  displayName: string;
  role: 'organizer' | 'required' | 'optional' | 'resource';
  responseStatus: 'none' | 'accepted' | 'declined' | 'tentative';
  person: { id: number; name: string } | null;
}

interface EventDetail {
  id: number;
  subject: string;
  startAt: number;
  endAt: number;
  isAllDay: boolean;
  isCancelled: boolean;
  location: string;
  bodyText: string;
  categories: string[];
  onlineMeetingUrl: string;
  webLink: string;
  seriesId: string | null;
  participants: Participant[];
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

async function listEvents(startDate: string, endDate: string) {
  const result = await client.callTool({ name: 'list-events', arguments: { startDate, endDate } });
  return (result.structuredContent as { events: EventSummary[] }).events;
}

async function getEvent(eventId: number) {
  return client.callTool({ name: 'get-event', arguments: { eventId } });
}

/** Syncs the given range and returns the single resulting event's id — fails loudly if the sync didn't produce exactly one event. */
async function syncAndFindEventId(startDate: string, endDate: string): Promise<number> {
  const syncResponse = await postCalendarSync({ startDate, endDate });
  expect(syncResponse.statusCode).toBe(201);
  const events = await listEvents(startDate, endDate);
  expect(events).toHaveLength(1);
  return events[0]!.id;
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

/** US2 scenario 1 (spec.md) — every FR-008 detail field populated. */
function pricingReviewDetailed(): SeedEvent {
  return {
    id: 'evt-pricing-detail-1',
    subject: 'Pricing review',
    start: '2026-08-14T16:00:00.000Z', // 2026-08-14 10:00 America/Denver (MDT, UTC-6)
    end: '2026-08-14T16:30:00.000Z', // 2026-08-14 10:30 America/Denver
    location: 'Conference Room B',
    body: { content: 'Agenda: walk through the updated pricing sheet', contentType: 'text' },
    organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    attendees: [
      { address: 'tyler@example.com', name: 'Tyler Satre', type: 'required', responseStatus: 'accepted' },
      // No display name seeded — covers the "attendee with no display name" edge case.
      { address: 'ana.alvarez@example.com', type: 'optional' },
    ],
    onlineMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/evt-pricing-detail-1',
    categories: ['Orange category'],
    webLink: 'https://outlook.office.com/calendar/item/evt-pricing-detail-1',
  };
}

describe('US2: get-event returns the full detail set', () => {
  it('returns subject, times, flags, location, body, organizer-first participants, online meeting, categories, webLink, seriesId', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReviewDetailed()]));
    await startAndConnect();

    const eventId = await syncAndFindEventId('2026-08-01', '2026-08-31');

    const result = await getEvent(eventId);
    expect(result.isError).toBeFalsy();
    const detail = result.structuredContent as EventDetail;

    expect(detail.subject).toBe('Pricing review');
    expect(detail.startAt).toBe(Date.parse('2026-08-14T16:00:00.000Z'));
    expect(detail.endAt).toBe(Date.parse('2026-08-14T16:30:00.000Z'));
    expect(detail.isAllDay).toBe(false);
    expect(detail.isCancelled).toBe(false);
    expect(detail.location).toBe('Conference Room B');
    expect(detail.bodyText).toBe('Agenda: walk through the updated pricing sheet');
    expect(detail.onlineMeetingUrl).toBe('https://teams.microsoft.com/l/meetup-join/evt-pricing-detail-1');
    expect(detail.categories).toEqual(['Orange category']);
    expect(detail.webLink).toBe('https://outlook.office.com/calendar/item/evt-pricing-detail-1');
    expect(detail.seriesId).toBeNull();

    expect(detail.participants).toHaveLength(3);
    expect(detail.participants[0]).toEqual({
      address: 'sam.rivera@example.com',
      displayName: 'Sam Rivera',
      role: 'organizer',
      responseStatus: 'none',
      person: null,
    });
    expect(detail.participants[1]).toEqual({
      address: 'tyler@example.com',
      displayName: 'Tyler Satre',
      role: 'required',
      responseStatus: 'accepted',
      person: null,
    });
    expect(detail.participants[2]).toEqual({
      address: 'ana.alvarez@example.com',
      displayName: '',
      role: 'optional',
      responseStatus: 'none',
      person: null,
    });
  });

  it('returns a tool error for an unknown event id', async () => {
    buildTestApp(new FakeCalendarProvider([]));
    await startAndConnect();

    const result = await getEvent(999999);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/Event 999999 not found/);
  });

  it('reads back a solo appointment (organizer only, no attendees) with just the organizer participant', async () => {
    buildTestApp(
      new FakeCalendarProvider([
        {
          id: 'evt-solo-1',
          subject: 'Solo appointment',
          start: '2026-08-18T16:00:00.000Z',
          end: '2026-08-18T16:30:00.000Z',
          organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
        },
      ]),
    );
    await startAndConnect();

    const eventId = await syncAndFindEventId('2026-08-01', '2026-08-31');

    const result = await getEvent(eventId);
    expect(result.isError).toBeFalsy();
    const detail = result.structuredContent as EventDetail;

    expect(detail.participants).toEqual([
      {
        address: 'sam.rivera@example.com',
        displayName: 'Sam Rivera',
        role: 'organizer',
        responseStatus: 'none',
        person: null,
      },
    ]);
  });
});
