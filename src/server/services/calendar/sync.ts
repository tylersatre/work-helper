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

type IngestOutcome = 'new' | 'updated';

/** Ingests one event in its own transaction: inserts it if new, or overwrites its stored fields and participants if already stored (full refresh/cancellation semantics land in US5). */
function ingestEvent(db: AppDb, event: ProviderCalendarEvent): IngestOutcome {
  const [existing] = db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(eq(calendarEvents.graphEventId, event.id))
    .limit(1)
    .all();

  const bodyText = deriveBodyText(event.body.content, event.body.contentType);
  const roles = participantsOf(event);

  if (existing) {
    db.transaction((tx) => {
      tx.update(calendarEvents)
        .set({
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
        })
        .where(eq(calendarEvents.id, existing.id))
        .run();

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
      .values({
        graphEventId: event.id,
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
        createdAt: Date.now(),
      })
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

/** Pulls calendar events overlapping the given window from the provider, storing new events and overwriting already-stored ones. Partial progress survives a mid-run failure, mirroring `runSync` (email). */
export async function runCalendarSync(db: AppDb, provider: CalendarProvider, window: CalendarWindow): Promise<CalendarSyncResult> {
  let newCount = 0;
  let updatedCount = 0;

  try {
    for await (const page of provider.fetchEvents(window)) {
      for (const event of page) {
        const outcome = ingestEvent(db, event);
        if (outcome === 'new') {
          newCount += 1;
        } else {
          updatedCount += 1;
        }
      }
    }
    return { status: 'complete', newCount, updatedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (newCount === 0 && updatedCount === 0) {
      throw error instanceof Error ? error : new Error(message);
    }
    return { status: 'interrupted', newCount, updatedCount, error: message };
  }
}
