import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphCalendarProvider } from '../../src/server/services/calendar/graph-provider.js';
import type { CalendarWindow, ProviderCalendarEvent } from '../../src/server/services/calendar/provider.js';
import { MailboxNotConnectedError } from '../../src/server/services/email/graph-auth.js';
import { computeSyncWindow } from '../../src/server/services/email/sync.js';

/**
 * The exact $select field list GraphCalendarProvider must request — covers the full FR-008 field
 * set. This is part of the contract this test file establishes for graph-provider.ts (T011).
 */
const SELECT_FIELDS =
  'id,seriesMasterId,subject,start,end,isAllDay,isCancelled,location,body,organizer,attendees,onlineMeeting,onlineMeetingUrl,categories,webLink';

function graphAttendee(overrides: Record<string, unknown> = {}) {
  return {
    emailAddress: { address: 'tyler@example.com', name: 'Tyler Satre' },
    type: 'required',
    status: { response: 'accepted', time: '0001-01-01T00:00:00Z' },
    ...overrides,
  };
}

function fixtureEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'AAMk-immutable-event-1',
    seriesMasterId: null,
    subject: 'Pricing review',
    start: { dateTime: '2026-08-14T16:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-08-14T16:30:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    location: { displayName: 'Conference Room B' },
    body: { content: 'Agenda for the pricing review.', contentType: 'text' },
    organizer: { emailAddress: { address: 'sam.rivera@example.com', name: 'Sam Rivera' } },
    attendees: [graphAttendee()],
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc' },
    onlineMeetingUrl: null,
    categories: ['Orange category'],
    webLink: 'https://outlook.office.com/calendar/item/AAMk-immutable-event-1',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function drain(provider: GraphCalendarProvider, window: CalendarWindow): Promise<ProviderCalendarEvent[][]> {
  const pages: ProviderCalendarEvent[][] = [];
  for await (const page of provider.fetchEvents(window)) {
    pages.push(page);
  }
  return pages;
}

describe('GraphCalendarProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const WINDOW = computeSyncWindow('2026-08-01', '2026-08-31');

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the calendarView URL from the given (computeSyncWindow-derived) UTC window, with $select/$orderby/$top', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [fixtureEvent()] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const pages = await drain(provider, WINDOW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.origin + parsed.pathname).toBe('https://graph.microsoft.com/v1.0/me/calendarView');
    expect(parsed.searchParams.get('startDateTime')).toBe(WINDOW.startUtc);
    expect(parsed.searchParams.get('endDateTime')).toBe(WINDOW.endUtc);
    expect(parsed.searchParams.get('$select')).toBe(SELECT_FIELDS);
    expect(parsed.searchParams.get('$orderby')).toBe('start/dateTime');
    expect(parsed.searchParams.get('$top')).toBe('100');
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
    expect(pages).toHaveLength(1);
  });

  it('sends Authorization, Prefer: IdType="ImmutableId", and Prefer: outlook.timezone="UTC"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-abc' });

    await drain(provider, WINDOW);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer token-abc');
    const prefer = headers.get('Prefer');
    expect(prefer).toContain('IdType="ImmutableId"');
    expect(prefer).toContain('outlook.timezone="UTC"');
  });

  it('follows @odata.nextLink until exhausted, yielding one page per response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [fixtureEvent({ id: 'evt-1' })],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=abc',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: [fixtureEvent({ id: 'evt-2' })] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const pages = await drain(provider, WINDOW);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe('https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=abc');
    expect(pages).toHaveLength(2);
    expect((pages[0]![0] as ProviderCalendarEvent).id).toBe('evt-1');
    expect((pages[1]![0] as ProviderCalendarEvent).id).toBe('evt-2');
  });

  it('parses UTC start/end dateTime into a Z-suffixed ISO instant (research R3)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [fixtureEvent()] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, WINDOW);
    const event = page![0]!;

    expect(event.start).toBe('2026-08-14T16:00:00.0000000Z');
    expect(event.end).toBe('2026-08-14T16:30:00.0000000Z');
    expect(Date.parse(event.start)).toBe(Date.parse('2026-08-14T16:00:00Z'));
    expect(Date.parse(event.end)).toBe(Date.parse('2026-08-14T16:30:00Z'));
  });

  it('maps subject, seriesMasterId, isAllDay, isCancelled, location, body, categories, webLink as-is', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [
          fixtureEvent({
            seriesMasterId: 'series-master-1',
            isAllDay: true,
            isCancelled: true,
            categories: ['Orange category', 'Blue category'],
          }),
        ],
      }),
    );
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, WINDOW);

    expect(page![0]).toMatchObject({
      subject: 'Pricing review',
      seriesMasterId: 'series-master-1',
      isAllDay: true,
      isCancelled: true,
      location: 'Conference Room B',
      body: { content: 'Agenda for the pricing review.', contentType: 'text' },
      categories: ['Orange category', 'Blue category'],
      webLink: 'https://outlook.office.com/calendar/item/AAMk-immutable-event-1',
    });
  });

  it('maps organizer and attendees to {address, name}, normalizing attendee type and response status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [
          fixtureEvent({
            attendees: [
              graphAttendee({
                emailAddress: { address: 'tyler@example.com', name: 'Tyler Satre' },
                type: 'required',
                status: { response: 'accepted', time: '0001-01-01T00:00:00Z' },
              }),
              graphAttendee({
                emailAddress: { address: 'ana.alvarez@example.com', name: 'Ana Alvarez' },
                type: 'optional',
                status: { response: 'notResponded', time: '0001-01-01T00:00:00Z' },
              }),
              graphAttendee({
                emailAddress: { address: 'room-b@example.com', name: 'Conference Room B' },
                type: 'resource',
                status: { response: 'none', time: '0001-01-01T00:00:00Z' },
              }),
              graphAttendee({
                emailAddress: { address: 'sam.other@example.com', name: 'Sam Other' },
                type: 'required',
                status: { response: 'tentativelyAccepted', time: '0001-01-01T00:00:00Z' },
              }),
            ],
          }),
        ],
      }),
    );
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, WINDOW);
    const event = page![0]!;

    expect(event.organizer).toEqual({ address: 'sam.rivera@example.com', name: 'Sam Rivera' });
    expect(event.attendees).toEqual([
      { address: 'tyler@example.com', name: 'Tyler Satre', type: 'required', responseStatus: 'accepted' },
      { address: 'ana.alvarez@example.com', name: 'Ana Alvarez', type: 'optional', responseStatus: 'none' },
      { address: 'room-b@example.com', name: 'Conference Room B', type: 'resource', responseStatus: 'none' },
      { address: 'sam.other@example.com', name: 'Sam Other', type: 'required', responseStatus: 'tentative' },
    ]);
  });

  it('maps a null organizer to null and a missing attendees array to []', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [fixtureEvent({ organizer: null, attendees: undefined })] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, WINDOW);

    expect(page![0]).toMatchObject({ organizer: null, attendees: [] });
  });

  it('prefers onlineMeeting.joinUrl, falling back to the legacy onlineMeetingUrl field, defaulting to \'\'', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ value: [fixtureEvent({ onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/new' }, onlineMeetingUrl: 'https://legacy.example.com/join' })] }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: [fixtureEvent({ onlineMeeting: null, onlineMeetingUrl: 'https://legacy.example.com/join' })] }))
      .mockResolvedValueOnce(jsonResponse({ value: [fixtureEvent({ onlineMeeting: null, onlineMeetingUrl: null })] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const [preferred] = await drain(provider, WINDOW);
    expect(preferred![0]!.onlineMeetingUrl).toBe('https://teams.microsoft.com/l/meetup-join/new');

    const [fallback] = await drain(provider, WINDOW);
    expect(fallback![0]!.onlineMeetingUrl).toBe('https://legacy.example.com/join');

    const [none] = await drain(provider, WINDOW);
    expect(none![0]!.onlineMeetingUrl).toBe('');
  });

  it('defaults a missing location, body, categories, and webLink cleanly', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [
          fixtureEvent({
            location: undefined,
            body: undefined,
            categories: undefined,
            webLink: undefined,
            seriesMasterId: undefined,
          }),
        ],
      }),
    );
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, WINDOW);

    expect(page![0]).toMatchObject({
      location: '',
      body: { content: '', contentType: 'text' },
      categories: [],
      webLink: '',
      seriesMasterId: null,
    });
  });

  it('never sends a non-GET request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [] }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    await drain(provider, WINDOW);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('maps a 401 response to MailboxNotConnectedError directing to the Sync page, before yielding anything', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    let error: unknown;
    const pages: ProviderCalendarEvent[][] = [];
    try {
      for await (const page of provider.fetchEvents(WINDOW)) {
        pages.push(page);
      }
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MailboxNotConnectedError);
    expect((error as Error).message).toMatch(/connect the mailbox on the sync page/i);
    expect(pages).toEqual([]);
  });

  it('maps a 403 response to MailboxNotConnectedError as well', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    let error: unknown;
    try {
      await drain(provider, WINDOW);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MailboxNotConnectedError);
    expect((error as Error).message).toMatch(/connect the mailbox on the sync page/i);
  });

  it('maps a thrown network error to a clear connection error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const provider = new GraphCalendarProvider({ getAccessToken: async () => 'token-123' });

    await expect(drain(provider, WINDOW)).rejects.toThrow(/connection|unreachable/i);
  });
});
