import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { syncRuns } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import type { CalendarProvider } from '../calendar/provider.js';
import { recordCalendarSyncRun, type CalendarSyncRunRecord } from '../calendar/queries.js';
import { runCalendarSync } from '../calendar/sync.js';
import type { AttachmentBackfillService } from './attachment-backfill.js';
import type { MailProvider } from './provider.js';
import { runSync, type SyncWindow } from './sync.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export type SyncSource = 'web' | 'mcp';

export interface SyncRunRecord {
  id: number;
  ranAt: number;
  startDate: string;
  endDate: string;
  source: SyncSource;
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}

export interface TriggerParams {
  /** Already-validated `YYYY-MM-DD` strings, recorded as-is. */
  startDate: string;
  endDate: string;
  window: SyncWindow;
  source: SyncSource;
  /** Undefined means no mailbox has ever been connected — recorded as a failed run, like any other unreachable mailbox (R4). */
  provider: MailProvider | undefined;
}

export type TriggerOutcome = { kind: 'already-running' } | { kind: 'ran'; run: SyncRunRecord };

export interface TriggerCalendarParams {
  /** Already-validated `YYYY-MM-DD` strings, recorded as-is. */
  startDate: string;
  endDate: string;
  window: SyncWindow;
  source: SyncSource;
  /** Undefined means no calendar connection is configured — recorded as a failed run, like any other unreachable calendar. */
  provider: CalendarProvider | undefined;
}

export type TriggerCalendarOutcome = { kind: 'already-running' } | { kind: 'ran'; run: CalendarSyncRunRecord };

/**
 * Single-flight guard + run recording shared by the web route and the sync-emails MCP tool.
 * Validation (missing/invalid dates) is the caller's job — it must not call trigger() for a
 * rejected request, so no row is recorded (FR-004). Every executed run — success or failure —
 * inserts exactly one sync_runs row (FR-006, FR-007, R4).
 *
 * Also runs calendar syncs (`triggerCalendar`, research R7) — email and calendar share the same
 * private `running` flag, so a sync of either kind, from any entry point (web route or MCP tool),
 * blocks the other (FR-006).
 */
export class SyncCoordinator {
  private running = false;

  constructor(
    private readonly db: AppDb,
    private readonly backfill?: AttachmentBackfillService,
  ) {}

  async trigger(params: TriggerParams): Promise<TriggerOutcome> {
    if (this.running) {
      return { kind: 'already-running' };
    }

    this.running = true;
    const ranAt = Date.now();
    try {
      if (!params.provider) {
        // Reachable only when mail is entirely unconfigured (index.ts always wires a real
        // mailProvider once a mailboxAuth exists) — the panel offers no Connect button here,
        // so the copy points at env setup, not the Sync page.
        throw new Error('Mail is not configured — set MS_CLIENT_ID and MS_TENANT_ID (see .env.example).');
      }
      const result = await runSync(this.db, params.provider, params.window);
      const run = this.record(params, ranAt, {
        status: result.status === 'complete' ? 'success' : 'failure',
        newCount: result.newCount,
        updatedCount: result.updatedCount,
        error: result.error ?? null,
      });
      if (run.status === 'success') {
        void this.backfill?.run();
      }
      return { kind: 'ran', run };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = this.record(params, ranAt, { status: 'failure', newCount: 0, updatedCount: 0, error: message });
      return { kind: 'ran', run };
    } finally {
      this.running = false;
    }
  }

  async triggerCalendar(params: TriggerCalendarParams): Promise<TriggerCalendarOutcome> {
    if (this.running) {
      return { kind: 'already-running' };
    }

    this.running = true;
    const ranAt = Date.now();
    try {
      if (!params.provider) {
        throw new Error('Calendar is not configured — set MS_CLIENT_ID and MS_TENANT_ID (see .env.example).');
      }
      const result = await runCalendarSync(this.db, params.provider, params.window);
      const run = recordCalendarSyncRun(this.db, {
        ranAt,
        startDate: params.startDate,
        endDate: params.endDate,
        source: params.source,
        status: result.status === 'complete' ? 'success' : 'failure',
        newCount: result.newCount,
        updatedCount: result.updatedCount,
        error: result.error ?? null,
      });
      return { kind: 'ran', run };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = recordCalendarSyncRun(this.db, {
        ranAt,
        startDate: params.startDate,
        endDate: params.endDate,
        source: params.source,
        status: 'failure',
        newCount: 0,
        updatedCount: 0,
        error: message,
      });
      return { kind: 'ran', run };
    } finally {
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private record(
    params: TriggerParams,
    ranAt: number,
    outcome: { status: 'success' | 'failure'; newCount: number; updatedCount: number; error: string | null },
  ): SyncRunRecord {
    const [inserted] = this.db
      .insert(syncRuns)
      .values({
        ranAt,
        startDate: params.startDate,
        endDate: params.endDate,
        source: params.source,
        status: outcome.status,
        newCount: outcome.newCount,
        updatedCount: outcome.updatedCount,
        error: outcome.error,
      })
      .returning()
      .all();
    return inserted!;
  }
}
