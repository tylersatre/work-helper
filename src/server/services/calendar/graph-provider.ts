import { MailboxNotConnectedError } from '../email/graph-auth.js';
import type { CalendarAttendeeType, CalendarProvider, CalendarResponseStatus, CalendarWindow, ProviderCalendarEvent } from './provider.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const SELECT_FIELDS =
  'id,seriesMasterId,subject,start,end,isAllDay,isCancelled,location,body,organizer,attendees,onlineMeeting,onlineMeetingUrl,categories,webLink';

export interface GraphCalendarProviderOptions {
  getAccessToken: () => Promise<string>;
}

interface GraphEmailAddress {
  address?: string;
  name?: string;
}

interface GraphAttendee {
  emailAddress?: GraphEmailAddress;
  type?: string;
  status?: { response?: string };
}

interface GraphEvent {
  id: string;
  seriesMasterId?: string | null;
  subject?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string } | null;
  body?: { content?: string; contentType?: 'html' | 'text' } | null;
  organizer?: { emailAddress?: GraphEmailAddress } | null;
  attendees?: GraphAttendee[];
  onlineMeeting?: { joinUrl?: string } | null;
  onlineMeetingUrl?: string | null;
  categories?: string[];
  webLink?: string;
}

interface GraphEventsResponse {
  value: GraphEvent[];
  '@odata.nextLink'?: string;
}

function toOrganizer(organizer: GraphEvent['organizer']): ProviderCalendarEvent['organizer'] {
  if (!organizer?.emailAddress) {
    return null;
  }
  return { address: organizer.emailAddress.address ?? '', name: organizer.emailAddress.name ?? '' };
}

function normalizeAttendeeType(type: string | undefined): CalendarAttendeeType {
  if (type === 'optional') return 'optional';
  if (type === 'resource') return 'resource';
  return 'required';
}

function normalizeResponseStatus(response: string | undefined): CalendarResponseStatus {
  switch (response) {
    case 'accepted':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'tentativelyAccepted':
      return 'tentative';
    default:
      return 'none';
  }
}

function toAttendee(attendee: GraphAttendee): ProviderCalendarEvent['attendees'][number] {
  return {
    address: attendee.emailAddress?.address ?? '',
    name: attendee.emailAddress?.name ?? '',
    type: normalizeAttendeeType(attendee.type),
    responseStatus: normalizeResponseStatus(attendee.status?.response),
  };
}

/**
 * Requests force `Prefer: outlook.timezone="UTC"` (research R3), so `timeZone` should always come
 * back `"UTC"` — but trusting that silently would let a non-UTC response shift every stored event
 * time with no error. Fail the run instead of mis-storing (FR-013 already surfaces sync failures).
 */
function toUtcInstant(time: { dateTime: string; timeZone?: string }): string {
  if (time.timeZone !== undefined && time.timeZone !== 'UTC') {
    throw new Error(`Calendar returned times in ${time.timeZone}, expected UTC`);
  }
  return `${time.dateTime}Z`;
}

function toProviderEvent(event: GraphEvent): ProviderCalendarEvent {
  return {
    id: event.id,
    seriesMasterId: event.seriesMasterId ?? null,
    subject: event.subject ?? '',
    start: toUtcInstant(event.start),
    end: toUtcInstant(event.end),
    isAllDay: event.isAllDay ?? false,
    isCancelled: event.isCancelled ?? false,
    location: event.location?.displayName ?? '',
    body: { content: event.body?.content ?? '', contentType: event.body?.contentType ?? 'text' },
    organizer: toOrganizer(event.organizer),
    attendees: (event.attendees ?? []).map(toAttendee),
    onlineMeetingUrl: event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? '',
    categories: event.categories ?? [],
    webLink: event.webLink ?? '',
  };
}

function firstPageUrl(window: CalendarWindow): string {
  const url = new URL(`${GRAPH_BASE}/me/calendarView`);
  url.searchParams.set('startDateTime', window.startUtc);
  url.searchParams.set('endDateTime', window.endUtc);
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '100');
  return url.toString();
}

/**
 * Reads the default calendar via `calendarView` (research R1). Deliberately diverges from
 * `GraphMailProvider`: a 401/403 throws the typed `MailboxNotConnectedError` instead of a plain
 * Error, so callers (the sync engine, the coordinator) can recognize and surface the
 * reconnect-on-Sync-page guidance uniformly (FR-013).
 */
export class GraphCalendarProvider implements CalendarProvider {
  constructor(private readonly options: GraphCalendarProviderOptions) {}

  private async authorizedFetch(url: string): Promise<Response> {
    const token = await this.options.getAccessToken();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId", outlook.timezone="UTC"' },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach the calendar — connection failed (${detail})`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new MailboxNotConnectedError('expired', `HTTP ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`Calendar request failed with a connection error (HTTP ${response.status})`);
    }

    return response;
  }

  async *fetchEvents(window: CalendarWindow): AsyncIterable<ProviderCalendarEvent[]> {
    let nextUrl: string | undefined = firstPageUrl(window);

    while (nextUrl) {
      const response = await this.authorizedFetch(nextUrl);
      const body = (await response.json()) as GraphEventsResponse;
      yield body.value.map(toProviderEvent);
      nextUrl = body['@odata.nextLink'];
    }
  }
}
