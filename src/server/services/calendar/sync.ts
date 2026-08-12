import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { calendarEventParticipants, calendarEvents, emailAddresses } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import { deriveBodyText } from '../email/sync.js';
import type { CalendarProvider, CalendarResponseStatus, CalendarWindow, ProviderCalendarEvent } from './provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface CalendarSyncResult {
  status: 'complete' | 'interrupted';
  newCount: number;
  updatedCount: number;
  error?: string;
}

interface ParticipantRole {
  address: string;
  role: 'organizer' | 'required' | 'optional' | 'resource';
  responseStatus: CalendarResponseStatus;
  name: string;
}

function participantsOf(event: ProviderCalendarEvent): ParticipantRole[] {
  const roles: ParticipantRole[] = [];
  if (event.organizer?.address) {
    roles.push({ address: event.organizer.address, role: 'organizer', responseStatus: 'none', name: event.organizer.name });
  }
  for (const attendee of event.attendees) {
    if (attendee.address) {
      roles.push({ address: attendee.address, role: attendee.type, responseStatus: attendee.responseStatus, name: attendee.name });
    }
  }

  const seen = new Set<string>();
  return roles.filter((entry) => {
    const key = `${entry.address.toLowerCase()}::${entry.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Mirrors `findOrCreateAddressId` from `email/sync.ts` (research R10) — shared `email_addresses` records, matched case-insensitively. */
function findOrCreateAddressId(tx: AppDb, address: string): number {
  const [existing] = tx
    .select({ id: emailAddresses.id })
    .from(emailAddresses)
    .where(sql`lower(${emailAddresses.value}) = lower(${address})`)
    .limit(1)
    .all();
  if (existing) {
    return existing.id;
  }
  const [created] = tx
    .insert(emailAddresses)
    .values({ personId: null, value: address, isPrimary: false, createdAt: Date.now() })
    .returning()
    .all();
  return created!.id;
}

type IngestOutcome = 'new' | 'updated' | 'unchanged';

interface NormalizedEventFields {
  seriesMasterId: string | null;
  subject: string;
  bodyOriginal: string;
  bodyContentType: 'html' | 'text';
  bodyText: string;
  startAt: number;
  endAt: number;
  isAllDay: boolean;
  isCancelled: boolean;
  location: string;
  onlineMeetingUrl: string;
  categories: string[];
  webLink: string;
}

interface NormalizedParticipant {
  address: string;
  role: 'organizer' | 'required' | 'optional' | 'resource';
  responseStatus: CalendarResponseStatus;
  displayName: string;
}

function normalizedFieldsFromProviderEvent(event: ProviderCalendarEvent, bodyText: string): NormalizedEventFields {
  return {
    seriesMasterId: event.seriesMasterId,
    subject: event.subject,
    bodyOriginal: event.body.content,
    bodyContentType: event.body.contentType,
    bodyText,
    startAt: Date.parse(event.start),
    endAt: Date.parse(event.end),
    isAllDay: event.isAllDay,
    isCancelled: event.isCancelled,
    location: event.location,
    onlineMeetingUrl: event.onlineMeetingUrl,
    categories: event.categories,
    webLink: event.webLink,
  };
}

function normalizedFieldsFromStoredRow(row: typeof calendarEvents.$inferSelect): NormalizedEventFields {
  return {
    seriesMasterId: row.seriesMasterId,
    subject: row.subject,
    bodyOriginal: row.bodyOriginal,
    bodyContentType: row.bodyContentType,
    bodyText: row.bodyText,
    startAt: row.startAt,
    endAt: row.endAt,
    isAllDay: row.isAllDay,
    isCancelled: row.isCancelled,
    location: row.location,
    onlineMeetingUrl: row.onlineMeetingUrl,
    categories: row.categories,
    webLink: row.webLink,
  };
}

/** Sorted by address+role (research R9) — address lowercased since identity is case-insensitive (the same `email_addresses` row backs any casing). */
function sortedNormalizedParticipants(list: NormalizedParticipant[]): NormalizedParticipant[] {
  return [...list].sort((a, b) => `${a.address}::${a.role}`.localeCompare(`${b.address}::${b.role}`));
}

/** Ingests one event: inserts it if new (own transaction), or compares its full normalized representation (fields + participant set) against what's stored and only rewrites + delete-reinserts participants (own transaction) when something differs — identical events touch nothing (research R9). */
function ingestEvent(db: AppDb, event: ProviderCalendarEvent): IngestOutcome {
  const [existing] = db.select().from(calendarEvents).where(eq(calendarEvents.graphEventId, event.id)).limit(1).all();

  const bodyText = deriveBodyText(event.body.content, event.body.contentType);
  const roles = participantsOf(event);
  const incomingFields = normalizedFieldsFromProviderEvent(event, bodyText);
  const incomingParticipants = sortedNormalizedParticipants(
    roles.map((r) => ({ address: r.address.toLowerCase(), role: r.role, responseStatus: r.responseStatus, displayName: r.name })),
  );

  if (existing) {
    const existingParticipantRows = db
      .select({
        address: emailAddresses.value,
        role: calendarEventParticipants.role,
        responseStatus: calendarEventParticipants.responseStatus,
        displayName: calendarEventParticipants.displayName,
      })
      .from(calendarEventParticipants)
      .innerJoin(emailAddresses, eq(calendarEventParticipants.addressId, emailAddresses.id))
      .where(eq(calendarEventParticipants.eventId, existing.id))
      .all();
    const existingParticipants = sortedNormalizedParticipants(
      existingParticipantRows.map((r) => ({ ...r, address: r.address.toLowerCase() })),
    );

    const fieldsMatch = JSON.stringify(incomingFields) === JSON.stringify(normalizedFieldsFromStoredRow(existing));
    const participantsMatch = JSON.stringify(incomingParticipants) === JSON.stringify(existingParticipants);
    if (fieldsMatch && participantsMatch) {
      return 'unchanged';
    }

    db.transaction((tx) => {
      tx.update(calendarEvents).set(incomingFields).where(eq(calendarEvents.id, existing.id)).run();

      tx.delete(calendarEventParticipants).where(eq(calendarEventParticipants.eventId, existing.id)).run();
      for (const { address, role, responseStatus, name } of roles) {
        const addressId = findOrCreateAddressId(tx, address);
        tx.insert(calendarEventParticipants)
          .values({ eventId: existing.id, addressId, role, responseStatus, displayName: name })
          .run();
      }
    });

    return 'updated';
  }

  db.transaction((tx) => {
    const [inserted] = tx
      .insert(calendarEvents)
      .values({ graphEventId: event.id, ...incomingFields, createdAt: Date.now() })
      .returning()
      .all();

    for (const { address, role, responseStatus, name } of roles) {
      const addressId = findOrCreateAddressId(tx, address);
      tx.insert(calendarEventParticipants)
        .values({ eventId: inserted!.id, addressId, role, responseStatus, displayName: name })
        .run();
    }
  });

  return 'new';
}

/**
 * Post-ingest cancellation pass (FR-011, research R9): stored events whose span overlaps the
 * synced window that were absent from this run's fetched id set are marked cancelled, counted
 * updated only when transitioning from not-cancelled (so a repeat absence doesn't double-count).
 * Events fetched with `isCancelled: true` are already handled by `ingestEvent`'s normal
 * comparison-based update above (isCancelled is part of the compared field set), so this pass
 * only needs to act on absence — acting on an already-cancelled fetched id here would double
 * count. Events outside the window are excluded by the same overlap condition `listEvents` uses,
 * so they're never touched; nothing is ever deleted.
 */
function cancelDisappearedEvents(db: AppDb, window: CalendarWindow, seenGraphEventIds: ReadonlySet<string>): number {
  const startMs = Date.parse(window.startUtc);
  const endMs = Date.parse(window.endUtc);

  const overlapping = db
    .select({ id: calendarEvents.id, graphEventId: calendarEvents.graphEventId, isCancelled: calendarEvents.isCancelled })
    .from(calendarEvents)
    .where(sql`${calendarEvents.startAt} < ${endMs} AND ${calendarEvents.endAt} > ${startMs}`)
    .all();

  let cancelledCount = 0;
  for (const row of overlapping) {
    if (!row.isCancelled && !seenGraphEventIds.has(row.graphEventId)) {
      db.update(calendarEvents).set({ isCancelled: true }).where(eq(calendarEvents.id, row.id)).run();
      cancelledCount += 1;
    }
  }
  return cancelledCount;
}

/**
 * Pulls calendar events overlapping the given window from the provider: new events are stored,
 * already-stored ones are refreshed only when their fetched representation differs (R9), and once
 * the fetch completes, stored events overlapping the window that were absent from the fetch are
 * marked cancelled. Partial progress survives a mid-run failure, mirroring `runSync` (email) — the
 * cancellation pass deliberately only runs after a full, uninterrupted fetch, since an interrupted
 * fetch's seen-id set doesn't represent the calendar's true current state and would spuriously
 * cancel events the run simply never got to.
 */
export async function runCalendarSync(db: AppDb, provider: CalendarProvider, window: CalendarWindow): Promise<CalendarSyncResult> {
  let newCount = 0;
  let updatedCount = 0;
  const seenGraphEventIds = new Set<string>();

  try {
    for await (const page of provider.fetchEvents(window)) {
      for (const event of page) {
        seenGraphEventIds.add(event.id);
        const outcome = ingestEvent(db, event);
        if (outcome === 'new') {
          newCount += 1;
        } else if (outcome === 'updated') {
          updatedCount += 1;
        }
      }
    }

    updatedCount += cancelDisappearedEvents(db, window, seenGraphEventIds);

    return { status: 'complete', newCount, updatedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (newCount === 0 && updatedCount === 0) {
      throw error instanceof Error ? error : new Error(message);
    }
    return { status: 'interrupted', newCount, updatedCount, error: message };
  }
}
