import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailMessages } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import type { MailProvider } from './provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export type ReadStateOutcomeStatus = 'marked' | 'already-in-state' | 'not-found' | 'failed';

export interface ReadStateOutcome {
  messageId: number;
  status: ReadStateOutcomeStatus;
  reason?: string;
}

export interface SetEmailReadStateResult {
  outcomes: ReadStateOutcome[];
  markedCount: number;
  alreadyCount: number;
  notFoundCount: number;
  failedCount: number;
}

/**
 * Marks messages read/unread: verifies mailbox write access, then processes each id sequentially in input
 * order, writing the mailbox before the store per id (FR-003). No wrapping transaction — per-message
 * autonomy (FR-006) is the requirement, not atomicity. Never touches SyncCoordinator (FR-011).
 */
export async function setEmailReadState(
  db: AppDb,
  provider: MailProvider,
  messageIds: number[],
  state: 'read' | 'unread',
): Promise<SetEmailReadStateResult> {
  await provider.verifyWriteAccess();

  const targetIsRead = state === 'read';
  const outcomes: ReadStateOutcome[] = [];

  for (const messageId of messageIds) {
    const [row] = db
      .select({ id: emailMessages.id, graphMessageId: emailMessages.graphMessageId, isRead: emailMessages.isRead })
      .from(emailMessages)
      .where(eq(emailMessages.id, messageId))
      .limit(1)
      .all();

    if (!row) {
      outcomes.push({ messageId, status: 'not-found' });
      continue;
    }

    if (row.isRead === targetIsRead) {
      outcomes.push({ messageId, status: 'already-in-state' });
      continue;
    }

    try {
      const writeResult = await provider.setMessageReadState(row.graphMessageId, targetIsRead);
      if (writeResult === 'not-found') {
        outcomes.push({ messageId, status: 'failed', reason: 'The mailbox no longer has this message' });
        continue;
      }
      db.update(emailMessages).set({ isRead: targetIsRead }).where(eq(emailMessages.id, messageId)).run();
      outcomes.push({ messageId, status: 'marked' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      outcomes.push({ messageId, status: 'failed', reason });
    }
  }

  return {
    outcomes,
    markedCount: outcomes.filter((o) => o.status === 'marked').length,
    alreadyCount: outcomes.filter((o) => o.status === 'already-in-state').length,
    notFoundCount: outcomes.filter((o) => o.status === 'not-found').length,
    failedCount: outcomes.filter((o) => o.status === 'failed').length,
  };
}
