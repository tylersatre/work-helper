import { and, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailAttachments, emailMessages } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import { getAppState, setAppState } from '../app-state.js';
import type { MailProvider } from './provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

const MARKER_KEY = 'attachment-inline-backfill';

export interface BackfillLogger {
  error(message: string, error?: unknown): void;
}

/**
 * One-time job recording is_inline for attachment rows stored before this feature existed
 * (FR-019). Only ever UPDATEs the flag on existing rows — no insert, no delete, stored mail
 * is never re-synced or removed.
 */
export class AttachmentBackfillService {
  private running = false;

  constructor(
    private readonly db: AppDb,
    private readonly provider: MailProvider,
    private readonly logger: BackfillLogger,
  ) {}

  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    if (getAppState(this.db, MARKER_KEY) !== undefined) {
      return;
    }

    this.running = true;
    try {
      const candidates = this.db.all<{ graphMessageId: string }>(sql`
        SELECT DISTINCT m.graph_message_id AS graphMessageId
        FROM email_messages m
        JOIN email_attachments a ON a.message_id = m.id
      `);

      for (const { graphMessageId } of candidates) {
        const metas = await this.provider.fetchAttachmentMetadata(graphMessageId, { allowNotFound: true });
        if (metas === null) {
          continue;
        }

        const [message] = this.db
          .select({ id: emailMessages.id })
          .from(emailMessages)
          .where(eq(emailMessages.graphMessageId, graphMessageId))
          .limit(1)
          .all();
        if (!message) {
          continue;
        }

        for (const meta of metas) {
          this.db
            .update(emailAttachments)
            .set({ isInline: meta.isInline })
            .where(
              and(
                eq(emailAttachments.messageId, message.id),
                eq(emailAttachments.name, meta.name),
                eq(emailAttachments.sizeBytes, meta.sizeBytes),
              ),
            )
            .run();
        }
      }

      setAppState(this.db, MARKER_KEY, new Date().toISOString());
    } catch (error) {
      this.logger.error('attachment inline-flag backfill aborted', error);
    } finally {
      this.running = false;
    }
  }
}
