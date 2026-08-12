import { asc, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { calendarEventParticipants, calendarEvents, calendarSyncRuns, emailAddresses, people } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import { decodeCursor, encodeCursor } from '../email/queries.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface EventSummary {
  id: number;
  subject: string;
  startAt: number;
  endAt: number;
  isAllDay: boolean;
  isCancelled: boolean;
  location: string;
  seriesId: string | null;
}

/** Stored events overlapping the given UTC window, ascending by `startAt` (ties by `id`) — cancelled events included and flagged (FR-019). */
export function listEvents(db: AppDb, window: { startUtc: string; endUtc: string }): EventSummary[] {
  const startMs = Date.parse(window.startUtc);
  const endMs = Date.parse(window.endUtc);

  const rows = db
    .select({
      id: calendarEvents.id,
      subject: calendarEvents.subject,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      isAllDay: calendarEvents.isAllDay,
      isCancelled: calendarEvents.isCancelled,
      location: calendarEvents.location,
      seriesId: calendarEvents.seriesMasterId,
    })
    .from(calendarEvents)
    .where(sql`${calendarEvents.startAt} < ${endMs} AND ${calendarEvents.endAt} > ${startMs}`)
    .orderBy(asc(calendarEvents.startAt), asc(calendarEvents.id))
    .all();

  return rows;
}

export interface PersonEventAddress {
  address: string;
  role: 'organizer' | 'required' | 'optional' | 'resource';
  displayName: string;
  responseStatus: 'none' | 'accepted' | 'declined' | 'tentative';
}

export interface PersonEvent extends EventSummary {
  addresses: PersonEventAddress[];
}

export interface PersonEventsPage {
  events: PersonEvent[];
  nextCursor: string | null;
}

/**
 * Events where any of the person's linked addresses appears as a participant (any role),
 * newest-first by `startAt` (ties by `id` desc), keyset-paged — mirrors `emailsForPerson`'s
 * two-query shape (id-only page query, then per-row detail) rather than `participantsForEvent`'s
 * full-participant join, since each event here only needs the person's own matching addresses,
 * not every participant on the event (FR-021).
 */
export function eventsForPerson(db: AppDb, personId: number, params: { limit: number; cursor?: string }): PersonEventsPage {
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  const cursorCondition = cursor
    ? sql`AND (ce.start_at < ${cursor.primary} OR (ce.start_at = ${cursor.primary} AND ce.id < ${cursor.id}))`
    : sql``;

  const rows = db.all<{ id: number; startAt: number }>(sql`
    SELECT DISTINCT ce.id AS id, ce.start_at AS startAt
    FROM calendar_events ce
    JOIN calendar_event_participants cep ON cep.event_id = ce.id
    JOIN email_addresses ea ON ea.id = cep.address_id
    WHERE ea.person_id = ${personId} ${cursorCondition}
    ORDER BY ce.start_at DESC, ce.id DESC
    LIMIT ${params.limit + 1}
  `);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ primary: last.startAt, id: last.id }) : null;

  const events = page.map((row) => {
    const [event] = db
      .select({
        id: calendarEvents.id,
        subject: calendarEvents.subject,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        isAllDay: calendarEvents.isAllDay,
        isCancelled: calendarEvents.isCancelled,
        location: calendarEvents.location,
        seriesId: calendarEvents.seriesMasterId,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, row.id))
      .limit(1)
      .all();
    const addresses = db.all<PersonEventAddress>(sql`
      SELECT ea.value AS address, cep.role AS role, cep.display_name AS displayName, cep.response_status AS responseStatus
      FROM calendar_event_participants cep
      JOIN email_addresses ea ON ea.id = cep.address_id
      WHERE cep.event_id = ${row.id} AND ea.person_id = ${personId}
    `);
    return { ...event!, addresses };
  });

  return { events, nextCursor };
}

export interface CalendarSyncRunRecord {
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

/** Calendar run history, newest first (`ran_at` desc, `id` desc), never pruned (FR-005). */
export function listCalendarSyncRuns(db: AppDb): CalendarSyncRunRecord[] {
  return db.select().from(calendarSyncRuns).orderBy(desc(calendarSyncRuns.ranAt), desc(calendarSyncRuns.id)).all();
}

export interface RecordCalendarSyncRunParams {
  ranAt: number;
  startDate: string;
  endDate: string;
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}

export function recordCalendarSyncRun(db: AppDb, params: RecordCalendarSyncRunParams): CalendarSyncRunRecord {
  const [inserted] = db.insert(calendarSyncRuns).values(params).returning().all();
  return inserted!;
}

export interface EventParticipantDetail {
  address: string;
  displayName: string;
  role: 'organizer' | 'required' | 'optional' | 'resource';
  responseStatus: 'none' | 'accepted' | 'declined' | 'tentative';
  person: { id: number; name: string } | null;
}

export interface EventDetail {
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
  participants: EventParticipantDetail[];
}

/**
 * Participants for one event, organizer first then attendees in stored order — organizer rows
 * are inserted first per event during ingest (`ingestEvent` in `sync.ts`), so ordering by
 * `calendar_event_participants.id` ascending preserves that order without needing a role
 * priority column. Each participant is joined to its linked person via `address_id` →
 * `email_addresses.person_id` → `people` (left join; `person: null` when unlinked) — mirrors
 * `participantsForMessage` in `email/queries.ts`.
 */
function participantsForEvent(db: AppDb, eventId: number): EventParticipantDetail[] {
  const rows = db
    .select({
      address: emailAddresses.value,
      displayName: calendarEventParticipants.displayName,
      role: calendarEventParticipants.role,
      responseStatus: calendarEventParticipants.responseStatus,
      personId: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(calendarEventParticipants)
    .innerJoin(emailAddresses, eq(calendarEventParticipants.addressId, emailAddresses.id))
    .leftJoin(people, eq(emailAddresses.personId, people.id))
    .where(eq(calendarEventParticipants.eventId, eventId))
    .orderBy(asc(calendarEventParticipants.id))
    .all();

  return rows.map((row) => ({
    address: row.address,
    displayName: row.displayName,
    role: row.role,
    responseStatus: row.responseStatus,
    person: row.personId != null ? { id: row.personId, name: `${row.firstName} ${row.lastName}` } : null,
  }));
}

/** One stored event with the full FR-008 detail set; participants organizer-first then stored order, each joined to its linked person when one exists (FR-020). */
export function getEvent(db: AppDb, eventId: number): EventDetail | undefined {
  const [event] = db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).limit(1).all();
  if (!event) {
    return undefined;
  }

  return {
    id: event.id,
    subject: event.subject,
    startAt: event.startAt,
    endAt: event.endAt,
    isAllDay: event.isAllDay,
    isCancelled: event.isCancelled,
    location: event.location,
    bodyText: event.bodyText,
    categories: event.categories,
    onlineMeetingUrl: event.onlineMeetingUrl,
    webLink: event.webLink,
    seriesId: event.seriesMasterId,
    participants: participantsForEvent(db, event.id),
  };
}
