import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { appState, emailAttachments } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { AttachmentBackfillService } from '../../src/server/services/email/attachment-backfill.js';
import type { MailAttachmentMeta, MailFolderNode, MailMessage, MailProvider } from '../../src/server/services/email/provider.js';
import { computeSyncWindow, runSync } from '../../src/server/services/email/sync.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';

const LANES = ['To Do'];
const silentLogger = { error: () => {} };
const MARKER_KEY = 'attachment-inline-backfill';

type AppDb = BetterSQLite3Database<typeof schema>;

function quoteMessage(overrides: Partial<SeedMessage> = {}): SeedMessage {
  return {
    id: 'msg-quote-backfill',
    conversationId: 'conv-quote-backfill',
    subject: 'Quote attached',
    body: { content: 'See attached.', contentType: 'text' },
    receivedDateTime: '2026-08-06T09:01:00Z',
    sentDateTime: '2026-08-06T09:00:00Z',
    from: { address: 'sam.rivera@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248, isInline: false }],
    ...overrides,
  };
}

/** Seeds "historical" stored mail directly through runSync — bypassing SyncCoordinator/buildApp
 * entirely, so the app-level backfill wiring (T014) never fires and each test's own
 * AttachmentBackfillService call is the only one that runs. */
async function seedHistoricalMessages(seed: SeedMessage[]): Promise<AppDb> {
  const { db } = createDb(':memory:');
  const window = computeSyncWindow('2026-08-01', '2026-08-08');
  await runSync(db, new FakeMailProvider(seed), window);
  return db;
}

function markerRows(db: AppDb) {
  return db.select().from(appState).where(eq(appState.key, MARKER_KEY)).all();
}

class CountingProvider implements MailProvider {
  calls = 0;
  constructor(private readonly inner: MailProvider) {}
  listFolders(): Promise<MailFolderNode[]> {
    return this.inner.listFolders();
  }
  fetchMessages(...args: Parameters<MailProvider['fetchMessages']>): AsyncIterable<MailMessage[]> {
    return this.inner.fetchMessages(...args);
  }
  fetchAttachmentMetadata(...args: Parameters<MailProvider['fetchAttachmentMetadata']>): Promise<MailAttachmentMeta[] | null> {
    this.calls += 1;
    return this.inner.fetchAttachmentMetadata(...args);
  }
  verifyWriteAccess(): Promise<void> {
    return this.inner.verifyWriteAccess();
  }
  setMessageReadState(...args: Parameters<MailProvider['setMessageReadState']>): Promise<'updated' | 'not-found'> {
    return this.inner.setMessageReadState(...args);
  }
  createDraft(...args: Parameters<MailProvider['createDraft']>): Promise<MailMessage> {
    return this.inner.createDraft(...args);
  }
  createReplyDraft(...args: Parameters<MailProvider['createReplyDraft']>): Promise<MailMessage> {
    return this.inner.createReplyDraft(...args);
  }
}

class FlakyProvider implements MailProvider {
  async listFolders(): Promise<MailFolderNode[]> {
    return [];
  }
  async *fetchMessages(): AsyncIterable<MailMessage[]> {
    yield [];
  }
  async fetchAttachmentMetadata(messageId: string): Promise<MailAttachmentMeta[] | null> {
    if (messageId === 'msg-quote-backfill') {
      return [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248, isInline: true }];
    }
    throw new Error('mailbox unreachable');
  }
  async verifyWriteAccess(): Promise<void> {}
  async setMessageReadState(): Promise<'updated' | 'not-found'> {
    return 'updated';
  }
  async createDraft(): Promise<MailMessage> {
    throw new Error('not implemented');
  }
  async createReplyDraft(): Promise<MailMessage> {
    throw new Error('not implemented');
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

describe('AttachmentBackfillService', () => {
  it('flags stored rows matched by (name, sizeBytes) from freshly re-fetched metadata', async () => {
    const db = await seedHistoricalMessages([quoteMessage()]);

    const backfillProvider = new FakeMailProvider([
      quoteMessage({ attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248, isInline: true }] }),
    ]);
    await new AttachmentBackfillService(db, backfillProvider, silentLogger).run();

    const [attachment] = db.select().from(emailAttachments).all();
    expect(attachment?.isInline).toBe(true);
    expect(markerRows(db)).toHaveLength(1);
  });

  it('permanently skips a message that is gone from the mailbox, leaving its rows non-inline, and still completes', async () => {
    const db = await seedHistoricalMessages([quoteMessage()]);

    await new AttachmentBackfillService(db, new FakeMailProvider([]), silentLogger).run();

    const [attachment] = db.select().from(emailAttachments).all();
    expect(attachment?.isInline).toBe(false);
    expect(markerRows(db)).toHaveLength(1);
  });

  it('aborts on a transient error, keeps partial updates, writes no marker, and a retry completes from the top', async () => {
    const db = await seedHistoricalMessages([
      quoteMessage(),
      quoteMessage({
        id: 'msg-quote-backfill-2',
        conversationId: 'conv-quote-backfill-2',
        attachments: [{ name: 'other.pdf', contentType: 'application/pdf', sizeBytes: 999, isInline: false }],
      }),
    ]);

    await new AttachmentBackfillService(db, new FlakyProvider(), silentLogger).run();

    expect(markerRows(db)).toHaveLength(0);
    const rows = db.select().from(emailAttachments).all();
    // The message that errored may or may not have been reached before the one that succeeded,
    // depending on candidate order — either way no marker is written and nothing throws out of run().
    expect(rows.length).toBe(2);

    const retryProvider = new FakeMailProvider([
      quoteMessage({ attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248, isInline: true }] }),
      quoteMessage({
        id: 'msg-quote-backfill-2',
        conversationId: 'conv-quote-backfill-2',
        attachments: [{ name: 'other.pdf', contentType: 'application/pdf', sizeBytes: 999, isInline: true }],
      }),
    ]);
    await new AttachmentBackfillService(db, retryProvider, silentLogger).run();

    expect(markerRows(db)).toHaveLength(1);
    const after = db.select().from(emailAttachments).all();
    expect(after.every((r) => r.isInline)).toBe(true);
  });

  it('writes the marker immediately on a DB with no attachment rows', async () => {
    const { db } = createDb(':memory:');
    await new AttachmentBackfillService(db, new FakeMailProvider([]), silentLogger).run();
    expect(markerRows(db)).toHaveLength(1);
  });

  it('is a no-op once the marker exists', async () => {
    const db = await seedHistoricalMessages([quoteMessage()]);
    await new AttachmentBackfillService(db, new FakeMailProvider([quoteMessage()]), silentLogger).run();
    expect(markerRows(db)).toHaveLength(1);

    const counting = new CountingProvider(new FakeMailProvider([quoteMessage()]));
    await new AttachmentBackfillService(db, counting, silentLogger).run();
    expect(counting.calls).toBe(0);
  });

  it('is single-flight: a concurrent run() while one is in flight does not start a second pass', async () => {
    const db = await seedHistoricalMessages([quoteMessage()]);
    const counting = new CountingProvider(new FakeMailProvider([quoteMessage()]));
    const service = new AttachmentBackfillService(db, counting, silentLogger);

    const [first, second] = [service.run(), service.run()];
    await Promise.all([first, second]);

    expect(counting.calls).toBe(1);
    expect(markerRows(db)).toHaveLength(1);
  });

  it('runs after a successful sync via POST /api/email-sync/runs (sync trigger wiring)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES, mailProvider: new FakeMailProvider([quoteMessage()]) });

    const response = await app.inject({ method: 'POST', url: '/api/email-sync/runs', payload: { startDate: '2026-08-01', endDate: '2026-08-08' } });
    expect(response.statusCode).toBe(201);

    const settled = await waitUntil(() => markerRows(db).length === 1);
    expect(settled).toBe(true);

    await app.close();
  });
});
