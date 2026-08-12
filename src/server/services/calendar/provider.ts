export type CalendarAttendeeType = 'required' | 'optional' | 'resource';
export type CalendarResponseStatus = 'none' | 'accepted' | 'declined' | 'tentative';

export interface CalendarOrganizer {
  address: string;
  /** `emailAddress.name` as seen on this event; '' when the mailbox had no name for it. */
  name: string;
}

export interface CalendarAttendee {
  address: string;
  /** `emailAddress.name` as seen on this event; '' when the mailbox had no name for it. */
  name: string;
  type: CalendarAttendeeType;
  responseStatus: CalendarResponseStatus;
}

/**
 * One occurrence as returned by a calendar provider (FR-008's full field set). Recurring series
 * arrive pre-expanded into individual occurrences, each with its own `id` and a shared
 * `seriesMasterId` (research R1/R2) — this type never represents a series master with a
 * recurrence rule.
 */
export interface ProviderCalendarEvent {
  id: string;
  /** Shared identifier across occurrences of the same recurring series; null for one-off events. */
  seriesMasterId: string | null;
  subject: string;
  /** Inclusive start instant, ISO UTC. */
  start: string;
  /** Exclusive end instant, ISO UTC. */
  end: string;
  isAllDay: boolean;
  isCancelled: boolean;
  location: string;
  body: { content: string; contentType: 'html' | 'text' };
  /** Absent only on the rare source event with no organizer recorded. */
  organizer: CalendarOrganizer | null;
  attendees: CalendarAttendee[];
  /** Teams/online-meeting join link; '' when the event has none. */
  onlineMeetingUrl: string;
  categories: string[];
  /** Opens the event in Outlook; '' when the source event had none. */
  webLink: string;
}

export interface CalendarWindow {
  /** Inclusive ISO start, UTC. */
  startUtc: string;
  /** Exclusive ISO end, UTC. */
  endUtc: string;
}

export interface CalendarProvider {
  /**
   * Events whose span overlaps the window (calendarView semantics — spans starting before or
   * ending after the window are included), yielded in provider-defined pages.
   */
  fetchEvents(window: CalendarWindow): AsyncIterable<ProviderCalendarEvent[]>;
}
