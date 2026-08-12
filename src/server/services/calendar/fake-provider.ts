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

export interface WeeklySeriesOptions {
  /** Shared identifier across every generated occurrence (research R2). */
  seriesMasterId: string;
  subject: string;
  /** First occurrence's calendar date, 'YYYY-MM-DD' — subsequent occurrences fall 7 days apart. */
  startDate: string;
  /** Occurrence start time of day, 'HH:MM', UTC. */
  startTime: string;
  /** Occurrence end time of day, 'HH:MM', UTC. */
  endTime: string;
  /** Number of weekly occurrences to generate. */
  count: number;
  /** Prefix for each occurrence's generated id (`${idPrefix}-${n}`, 0-indexed). */
  idPrefix: string;
  /** Per-occurrence (0-indexed) field overrides — e.g. an individually moved/modified occurrence that keeps its series identifier but has an exceptional time or location (spec.md Edge Cases). */
  overrides?: Record<number, Partial<SeedEvent>>;
}

/**
 * Expands a weekly recurrence rule into `count` per-occurrence `SeedEvent`s sharing one
 * `seriesMasterId` — a convenience so tests seeding a realistic recurring series don't have to
 * hand-write each occurrence (US4). Each occurrence still gets its own `id` and its own row once
 * synced; `overrides` lets one or more occurrences carry exceptional details while keeping the
 * shared series identifier, covering the "moved occurrence" edge case.
 */
export function weeklySeries(options: WeeklySeriesOptions): SeedEvent[] {
  const events: SeedEvent[] = [];
  for (let i = 0; i < options.count; i++) {
    const date = new Date(`${options.startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + i * 7);
    const dateStr = date.toISOString().slice(0, 10);
    const occurrence: SeedEvent = {
      id: `${options.idPrefix}-${i}`,
      seriesMasterId: options.seriesMasterId,
      subject: options.subject,
      start: `${dateStr}T${options.startTime}:00.000Z`,
      end: `${dateStr}T${options.endTime}:00.000Z`,
      ...options.overrides?.[i],
    };
    events.push(occurrence);
  }
  return events;
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
