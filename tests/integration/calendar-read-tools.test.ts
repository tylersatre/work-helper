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

interface EventAddress {
  address: string;
  role: 'organizer' | 'required' | 'optional' | 'resource';
  displayName: string;
  responseStatus: 'none' | 'accepted' | 'declined' | 'tentative';
}

interface EventsForPersonEvent extends EventSummary {
  addresses: EventAddress[];
}

interface EventsForPersonPage {
  person: { id: number; name: string };
  events: EventsForPersonEvent[];
  nextCursor: string | null;
}

async function createPerson(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function addEmail(personId: number, value: string) {
  return app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value } });
}

async function removeEmail(personId: number, entryId: number) {
  return app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/${entryId}` });
}

async function eventsForPerson(args: Record<string, unknown>) {
  return client.callTool({ name: 'events-for-person', arguments: args });
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

/** US3 scenario 1 (spec.md) — organizer address differs only in case from the tracked person's stored address. */
function pricingReviewCaseDiffOrganizer(): SeedEvent {
  return {
    id: 'evt-pricing-us3-1',
    subject: 'Pricing review',
    start: '2026-08-14T16:00:00.000Z',
    end: '2026-08-14T16:30:00.000Z',
    organizer: { address: 'Sam.Rivera@example.com', name: 'Sam Rivera' },
    attendees: [{ address: 'ana.alvarez@example.com', type: 'optional' }],
  };
}

describe('US3: events connect to tracked people', () => {
  it('links the organizer case-insensitively on get-event, and events-for-person returns the event with role organizer, leaving the unmatched attendee unlinked (AS1)', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReviewCaseDiffOrganizer()]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();

    const eventId = await syncAndFindEventId('2026-08-01', '2026-08-31');

    const eventResult = await getEvent(eventId);
    expect(eventResult.isError).toBeFalsy();
    const detail = eventResult.structuredContent as EventDetail;
    const organizer = detail.participants.find((p) => p.role === 'organizer')!;
    expect(organizer.address).toBe('sam.rivera@example.com');
    expect(organizer.person).toEqual({ id: sam, name: 'Sam Rivera' });
    const attendee = detail.participants.find((p) => p.role === 'optional')!;
    expect(attendee.address).toBe('ana.alvarez@example.com');
    expect(attendee.person).toBeNull();

    const result = await eventsForPerson({ personId: sam });
    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as EventsForPersonPage;
    expect(content.person).toEqual({ id: sam, name: 'Sam Rivera' });
    expect(content.events).toHaveLength(1);
    expect(content.events[0]!.subject).toBe('Pricing review');
    expect(content.events[0]!.addresses).toEqual([
      { address: 'sam.rivera@example.com', role: 'organizer', displayName: 'Sam Rivera', responseStatus: 'none' },
    ]);
  });

  it("immediately connects an already-synced event to a person after adding the attendee's address, with no re-sync (AS2)", async () => {
    buildTestApp(new FakeCalendarProvider([pricingReviewCaseDiffOrganizer()]));
    const ana = await createPerson({ firstName: 'Ana', lastName: 'Alvarez' });
    await startAndConnect();
    await syncAndFindEventId('2026-08-01', '2026-08-31');

    const before = await eventsForPerson({ personId: ana });
    expect((before.structuredContent as EventsForPersonPage).events).toEqual([]);

    const addResponse = await addEmail(ana, 'ana.alvarez@example.com');
    expect(addResponse.statusCode).toBe(201);

    const after = await eventsForPerson({ personId: ana });
    expect(after.isError).toBeFalsy();
    const content = after.structuredContent as EventsForPersonPage;
    expect(content.events).toHaveLength(1);
    expect(content.events[0]!.subject).toBe('Pricing review');
    expect(content.events[0]!.addresses).toEqual([
      { address: 'ana.alvarez@example.com', role: 'optional', displayName: '', responseStatus: 'none' },
    ]);
  });

  it('returns events newest-first and includes cancelled events flagged', async () => {
    buildTestApp(
      new FakeCalendarProvider([
        {
          id: 'evt-us3-older',
          subject: 'Older sync',
          start: '2026-08-10T16:00:00.000Z',
          end: '2026-08-10T16:30:00.000Z',
          organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
        },
        {
          id: 'evt-us3-newer',
          subject: 'Newer sync',
          start: '2026-08-20T16:00:00.000Z',
          end: '2026-08-20T16:30:00.000Z',
          organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
        },
        {
          id: 'evt-us3-cancelled',
          subject: 'Cancelled sync',
          start: '2026-08-25T16:00:00.000Z',
          end: '2026-08-25T16:30:00.000Z',
          isCancelled: true,
          organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
        },
      ]),
    );
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    const syncResponse = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(syncResponse.statusCode).toBe(201);

    const result = await eventsForPerson({ personId: sam });
    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as EventsForPersonPage;
    expect(content.events.map((e) => e.subject)).toEqual(['Cancelled sync', 'Newer sync', 'Older sync']);
    expect(content.events.find((e) => e.subject === 'Cancelled sync')!.isCancelled).toBe(true);
    expect(content.events.find((e) => e.subject !== 'Cancelled sync')!.isCancelled).toBe(false);
  });

  it('paginates events-for-person with keyset cursors, newest first — every event exactly once (mirrors emails-for-person paging)', async () => {
    const events: SeedEvent[] = Array.from({ length: 3 }, (_, i) => ({
      id: `evt-us3-page-${i}`,
      subject: `Standup ${i}`,
      start: `2026-08-0${i + 1}T16:00:00.000Z`,
      end: `2026-08-0${i + 1}T16:15:00.000Z`,
      organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    }));
    buildTestApp(new FakeCalendarProvider(events));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    const syncResponse = await postCalendarSync({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(syncResponse.statusCode).toBe(201);

    const seen = new Set<number>();
    let cursor: string | undefined;
    let lastStartAt = Number.POSITIVE_INFINITY;
    for (let page = 0; page < 5; page++) {
      const result = await eventsForPerson({ personId: sam, limit: 1, cursor });
      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as EventsForPersonPage;
      expect(content.events.length).toBeLessThanOrEqual(1);
      for (const event of content.events) {
        expect(seen.has(event.id)).toBe(false);
        seen.add(event.id);
        expect(event.startAt).toBeLessThanOrEqual(lastStartAt);
        lastStartAt = event.startAt;
      }
      if (!content.nextCursor) break;
      cursor = content.nextCursor;
    }
    expect(seen.size).toBe(3);
  });

  it('errors with "Person N not found" for an unknown personId', async () => {
    buildTestApp(new FakeCalendarProvider([]));
    await startAndConnect();

    const result = await eventsForPerson({ personId: 999999 });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Person 999999 not found');
  });

  it('rejects an invalid cursor with a tool error', async () => {
    buildTestApp(new FakeCalendarProvider([]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();

    const result = await eventsForPerson({ personId: sam, cursor: 'not-a-valid-cursor' });

    expect(result.isError).toBe(true);
  });

  it("unlinks (not deletes) a person's address on remove when only calendar events reference it", async () => {
    buildTestApp(new FakeCalendarProvider([pricingReviewCaseDiffOrganizer()]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    const eventId = await syncAndFindEventId('2026-08-01', '2026-08-31');

    const before = await app.inject({ method: 'GET', url: `/api/people/${sam}` });
    const entryId = before.json().emails[0].id;

    const removeResponse = await removeEmail(sam, entryId);
    expect(removeResponse.statusCode).toBe(200);

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${sam}` });
    expect(fetched.json().emails).toEqual([]);

    const eventResult = await getEvent(eventId);
    expect(eventResult.isError).toBeFalsy();
    const detail = eventResult.structuredContent as EventDetail;
    const organizer = detail.participants.find((p) => p.role === 'organizer')!;
    expect(organizer.address).toBe('sam.rivera@example.com');
    expect(organizer.person).toBeNull();
  });
});
