import type {
  CalendarAttendeeType,
  CalendarProvider,
  CalendarResponseStatus,
  CalendarWindow,
  ProviderCalendarEvent,
} from './provider.js';

/**
 * An in-memory CalendarProvider for tests and the dev-only seeded calendar (`MAIL_PROVIDER=fake`).
 * Never used in production — production always talks to Graph via GraphCalendarProvider.
 */

export interface SeedOrganizer {
  address: string;
  name?: string;
}

export interface SeedAttendee {
  address: string;
  name?: string;
  type: CalendarAttendeeType;
  responseStatus?: CalendarResponseStatus;
}

export interface SeedEvent {
  id: string;
  seriesMasterId?: string | null;
  subject: string;
  body?: { content: string; contentType: 'html' | 'text' };
  /** Inclusive start instant, ISO UTC. */
  start: string;
  /** Exclusive end instant, ISO UTC. */
  end: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: string;
  organizer?: SeedOrganizer | null;
  attendees?: SeedAttendee[];
  onlineMeetingUrl?: string;
  categories?: string[];
  webLink?: string;
}

export interface FakeCalendarProviderOptions {
  /** Events per yielded page (mirrors Graph's `$top` paging). Defaults to 25. */
  pageSize?: number;
  /** Throws before yielding anything at all — simulates an unreachable mailbox or expired sign-in. */
  failImmediately?: boolean;
  /** Throws once this many events (across all pages, cumulative for this provider instance) have already been yielded — simulates a connection drop mid-run. */
  throwAfterEventCount?: number;
}

function toOrganizer(organizer: SeedOrganizer | null | undefined): ProviderCalendarEvent['organizer'] {
  if (organizer === null || organizer === undefined) return null;
  return { address: organizer.address, name: organizer.name ?? '' };
}

function toAttendee(attendee: SeedAttendee): ProviderCalendarEvent['attendees'][number] {
  return {
    address: attendee.address,
    name: attendee.name ?? '',
    type: attendee.type,
    responseStatus: attendee.responseStatus ?? 'none',
  };
}

function toProviderEvent(seed: SeedEvent): ProviderCalendarEvent {
  return {
    id: seed.id,
    seriesMasterId: seed.seriesMasterId ?? null,
    subject: seed.subject,
    start: seed.start,
    end: seed.end,
    isAllDay: seed.isAllDay ?? false,
    isCancelled: seed.isCancelled ?? false,
    location: seed.location ?? '',
    body: seed.body ?? { content: '', contentType: 'text' },
    organizer: toOrganizer(seed.organizer),
    attendees: (seed.attendees ?? []).map(toAttendee),
    onlineMeetingUrl: seed.onlineMeetingUrl ?? '',
    categories: seed.categories ?? [],
    webLink: seed.webLink ?? '',
  };
}

/** True when the event's [start, end) span overlaps the window's [startUtc, endUtc) span (calendarView semantics). */
function overlapsWindow(seed: SeedEvent, startMs: number, endMs: number): boolean {
  const eventStart = Date.parse(seed.start);
  const eventEnd = Date.parse(seed.end);
  return eventStart < endMs && eventEnd > startMs;
}

export class FakeCalendarProvider implements CalendarProvider {
  private yieldedCount = 0;

  constructor(
    private readonly seeded: SeedEvent[],
    private readonly options: FakeCalendarProviderOptions = {},
  ) {}

  async *fetchEvents(window: CalendarWindow): AsyncIterable<ProviderCalendarEvent[]> {
    if (this.options.failImmediately) {
      throw new Error('calendar unreachable');
    }

    const pageSize = this.options.pageSize ?? 25;
    const startMs = Date.parse(window.startUtc);
    const endMs = Date.parse(window.endUtc);

    const matching = this.seeded.filter((seed) => overlapsWindow(seed, startMs, endMs));

    for (let i = 0; i < matching.length; i += pageSize) {
      const chunk = matching.slice(i, i + pageSize);
      yield chunk.map(toProviderEvent);

      this.yieldedCount += chunk.length;
      if (this.options.throwAfterEventCount !== undefined && this.yieldedCount >= this.options.throwAfterEventCount) {
        throw new Error('calendar connection lost mid-sync');
      }
    }
  }
}
