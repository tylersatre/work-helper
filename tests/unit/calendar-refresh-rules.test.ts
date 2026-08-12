import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/server/db/index.js';
import { calendarEventParticipants, calendarEvents } from '../../src/server/db/schema.js';
import { FakeCalendarProvider, type SeedEvent } from '../../src/server/services/calendar/fake-provider.js';
import type { CalendarWindow } from '../../src/server/services/calendar/provider.js';
import { runCalendarSync } from '../../src/server/services/calendar/sync.js';

const WINDOW: CalendarWindow = { startUtc: '2026-08-01T00:00:00.000Z', endUtc: '2026-09-01T00:00:00.000Z' };

function pricingReview(overrides: Partial<SeedEvent> = {}): SeedEvent {
  return {
    id: 'evt-pricing-1',
    subject: 'Pricing review',
    start: '2026-08-14T16:00:00.000Z',
    end: '2026-08-14T16:30:00.000Z',
    location: 'Conference Room B',
    organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    attendees: [{ address: 'ana.alvarez@example.com', name: 'Ana Alvarez', type: 'optional', responseStatus: 'none' }],
    ...overrides,
  };
}

describe('calendar refresh rules (R9)', () => {
  it('touches nothing and counts nothing when the re-fetched event is identical', async () => {
    const { db } = createDb(':memory:');

    const first = await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);
    expect(first).toEqual({ status: 'complete', newCount: 1, updatedCount: 0 });

    const [before] = db.select().from(calendarEvents).all();
    const participantsBefore = db.select().from(calendarEventParticipants).all();

    const second = await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);
    expect(second).toEqual({ status: 'complete', newCount: 0, updatedCount: 0 });

    const [after] = db.select().from(calendarEvents).all();
    const participantsAfter = db.select().from(calendarEventParticipants).all();
    expect(after).toEqual(before);
    expect(participantsAfter).toEqual(participantsBefore);
  });

  it('counts a changed event field as updated and rewrites the stored row', async () => {
    const { db } = createDb(':memory:');
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);

    const moved = pricingReview({
      start: '2026-08-15T20:00:00.000Z',
      end: '2026-08-15T20:30:00.000Z',
      location: 'Room 4',
    });
    const second = await runCalendarSync(db, new FakeCalendarProvider([moved]), WINDOW);
    expect(second).toEqual({ status: 'complete', newCount: 0, updatedCount: 1 });

    const [after] = db.select().from(calendarEvents).all();
    expect(after!.location).toBe('Room 4');
    expect(after!.startAt).toBe(Date.parse('2026-08-15T20:00:00.000Z'));
    expect(after!.endAt).toBe(Date.parse('2026-08-15T20:30:00.000Z'));
  });

  it('counts a participant-only change (response status flip) as updated, with event fields untouched, and delete-reinserts participants', async () => {
    const { db } = createDb(':memory:');
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);

    const [before] = db.select().from(calendarEvents).all();
    const participantsBefore = db
      .select()
      .from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.eventId, before!.id))
      .all();

    const accepted = pricingReview({
      attendees: [{ address: 'ana.alvarez@example.com', name: 'Ana Alvarez', type: 'optional', responseStatus: 'accepted' }],
    });
    const second = await runCalendarSync(db, new FakeCalendarProvider([accepted]), WINDOW);
    expect(second).toEqual({ status: 'complete', newCount: 0, updatedCount: 1 });

    const [after] = db.select().from(calendarEvents).all();
    expect(after!.location).toBe(before!.location);
    expect(after!.startAt).toBe(before!.startAt);
    expect(after!.endAt).toBe(before!.endAt);

    const participantsAfter = db
      .select()
      .from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.eventId, after!.id))
      .all();
    const ana = participantsAfter.find((p) => p.displayName === 'Ana Alvarez');
    expect(ana?.responseStatus).toBe('accepted');
    // Delete-and-reinsert: replacement rows get new autoincrement ids, never updated in place.
    expect(participantsAfter.map((p) => p.id)).not.toEqual(participantsBefore.map((p) => p.id));
  });

  it('marks a stored event cancelled, counted updated, when it disappears from a fetch overlapping its span — without double-counting a repeat absence', async () => {
    const { db } = createDb(':memory:');
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);

    const disappeared = await runCalendarSync(db, new FakeCalendarProvider([]), WINDOW);
    expect(disappeared).toEqual({ status: 'complete', newCount: 0, updatedCount: 1 });

    const [afterFirstAbsence] = db.select().from(calendarEvents).all();
    expect(afterFirstAbsence!.isCancelled).toBe(true);

    const stillAbsent = await runCalendarSync(db, new FakeCalendarProvider([]), WINDOW);
    expect(stillAbsent).toEqual({ status: 'complete', newCount: 0, updatedCount: 0 });

    const [afterSecondAbsence] = db.select().from(calendarEvents).all();
    expect(afterSecondAbsence!.isCancelled).toBe(true);
    expect(db.select().from(calendarEvents).all()).toHaveLength(1);
  });

  it('marks a stored event cancelled when re-fetched with isCancelled: true', async () => {
    const { db } = createDb(':memory:');
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview({ isCancelled: false })]), WINDOW);

    const second = await runCalendarSync(db, new FakeCalendarProvider([pricingReview({ isCancelled: true })]), WINDOW);
    expect(second).toEqual({ status: 'complete', newCount: 0, updatedCount: 1 });

    const [after] = db.select().from(calendarEvents).all();
    expect(after!.isCancelled).toBe(true);
  });

  it('refreshes a previously-cancelled event back to active (is_cancelled = 0) when it reappears un-cancelled', async () => {
    const { db } = createDb(':memory:');
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);
    await runCalendarSync(db, new FakeCalendarProvider([]), WINDOW); // disappears -> cancelled by the post-ingest pass

    const [cancelled] = db.select().from(calendarEvents).all();
    expect(cancelled!.isCancelled).toBe(true);

    const reappeared = await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);
    expect(reappeared).toEqual({ status: 'complete', newCount: 0, updatedCount: 1 });

    const [after] = db.select().from(calendarEvents).all();
    expect(after!.isCancelled).toBe(false);
  });

  it('never touches a stored event outside the synced window, even when a narrower re-sync omits it from the fetch', async () => {
    const { db } = createDb(':memory:');
    const wideWindow: CalendarWindow = { startUtc: '2026-08-01T00:00:00.000Z', endUtc: '2026-10-01T00:00:00.000Z' };
    const augWindow: CalendarWindow = { startUtc: '2026-08-01T00:00:00.000Z', endUtc: '2026-09-01T00:00:00.000Z' };

    const septemberEvent: SeedEvent = {
      id: 'evt-sept-1',
      subject: 'September planning',
      start: '2026-09-15T15:00:00.000Z',
      end: '2026-09-15T16:00:00.000Z',
    };

    await runCalendarSync(db, new FakeCalendarProvider([pricingReview(), septemberEvent]), wideWindow);
    const [septBefore] = db.select().from(calendarEvents).where(eq(calendarEvents.graphEventId, 'evt-sept-1')).all();
    expect(septBefore).toBeDefined();

    // A narrower re-sync of August only never fetches the September event (out of window) — it
    // must stay exactly as it was, not marked cancelled, even though the same run cancels/updates
    // the August event.
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview({ location: 'Room 4' })]), augWindow);

    const [septAfter] = db.select().from(calendarEvents).where(eq(calendarEvents.graphEventId, 'evt-sept-1')).all();
    expect(septAfter).toEqual(septBefore);
  });

  it('never deletes rows: calendar_events row count never decreases across new/updated/cancelled/reappeared transitions', async () => {
    const { db } = createDb(':memory:');
    await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW);
    expect(db.select().from(calendarEvents).all()).toHaveLength(1);

    await runCalendarSync(db, new FakeCalendarProvider([]), WINDOW); // cancels, doesn't delete
    expect(db.select().from(calendarEvents).all()).toHaveLength(1);

    await runCalendarSync(db, new FakeCalendarProvider([pricingReview()]), WINDOW); // reappears
    expect(db.select().from(calendarEvents).all()).toHaveLength(1);
  });
});
