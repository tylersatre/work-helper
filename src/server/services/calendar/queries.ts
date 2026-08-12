import { asc, desc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { calendarEvents, calendarSyncRuns } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';

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
