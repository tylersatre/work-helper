import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/server/db/index.js';
import { emailAttachments, emailMessages, emailParticipants } from '../../src/server/db/schema.js';
import { computeSyncWindow, runSync } from '../../src/server/services/email/sync.js';
import type {
  MailAttachmentMeta,
  MailFolderNode,
  MailFolderRef,
  MailMessage,
  MailProvider,
  WellKnownFolder,
} from '../../src/server/services/email/provider.js';

class StubProvider implements MailProvider {
  folder: { id: string; name: string; wellKnown: WellKnownFolder | null } = { id: 'inbox', name: 'Inbox', wellKnown: 'inbox' };
  message: MailMessage;
  attachments: MailAttachmentMeta[] = [];

  constructor(message: MailMessage) {
    this.message = message;
  }

  async listFolders(): Promise<MailFolderNode[]> {
    return [{ ...this.folder, children: [] }];
  }

  async *fetchMessages(folder: MailFolderRef): AsyncIterable<MailMessage[]> {
    if (folder.id !== this.folder.id) {
      yield [];
      return;
    }
    yield [this.message];
  }

  async fetchAttachmentMetadata(): Promise<MailAttachmentMeta[]> {
    return this.attachments;
  }

  async verifyWriteAccess(): Promise<void> {}

  async setMessageReadState(): Promise<'updated' | 'not-found'> {
    return 'updated';
  }

  async createDraft(): Promise<MailMessage> {
    throw new Error('not implemented');
  }
}

function baseMessage(): MailMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    subject: 'Original subject',
    body: { content: 'Original body', contentType: 'text' },
    receivedDateTime: '2026-08-06T09:01:00Z',
    sentDateTime: '2026-08-06T09:00:00Z',
    from: { address: 'sam@example.com', name: 'Sam' },
    toRecipients: [],
    ccRecipients: [],
    bccRecipients: [],
    isRead: false,
    importance: 'normal',
    flagStatus: 'notFlagged',
    categories: [],
    hasAttachments: true,
    webLink: '',
    internetMessageId: 'id-1',
    isDraft: false,
  };
}

describe('refresh-on-resync field rules (R7)', () => {
  it('refreshes exactly sourceFolder/sentAt/receivedAt/isRead/importance/flagStatus/categories/webLink/internetMessageId + attachments, and leaves subject/body/conversationId/graphMessageId/createdAt/participants untouched', async () => {
    const { db } = createDb(':memory:');
    const window = computeSyncWindow('2026-08-01', '2026-08-08');

    const provider = new StubProvider(baseMessage());
    provider.attachments = [{ name: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100, isInline: false }];

    const first = await runSync(db, provider, window);
    expect(first).toEqual({ status: 'complete', newCount: 1, updatedCount: 0 });

    const [before] = db.select().from(emailMessages).all();
    const participantsBefore = db.select().from(emailParticipants).where(eq(emailParticipants.messageId, before!.id)).all();

    provider.folder = { id: 'archive', name: 'Archive', wellKnown: 'archive' };
    provider.message = {
      ...baseMessage(),
      subject: 'Changed subject',
      body: { content: 'Changed body', contentType: 'text' },
      receivedDateTime: '2026-08-06T10:30:00Z',
      sentDateTime: '2026-08-06T10:00:00Z',
      from: { address: 'sam@example.com', name: 'Sam Changed' },
      isRead: true,
      importance: 'high',
      flagStatus: 'flagged',
      categories: ['Orange category'],
      webLink: 'https://outlook.office.com/mail/msg-1',
      internetMessageId: 'id-1-changed',
    };
    provider.attachments = [{ name: 'b.pdf', contentType: 'application/pdf', sizeBytes: 200, isInline: false }];

    const second = await runSync(db, provider, window);
    expect(second).toEqual({ status: 'complete', newCount: 0, updatedCount: 1 });

    const [after] = db.select().from(emailMessages).all();
    expect(after!.id).toBe(before!.id);

    // Snapshot columns: never written on refresh.
    expect(after!.subject).toBe(before!.subject);
    expect(after!.bodyOriginal).toBe(before!.bodyOriginal);
    expect(after!.bodyContentType).toBe(before!.bodyContentType);
    expect(after!.bodyText).toBe(before!.bodyText);
    expect(after!.conversationId).toBe(before!.conversationId);
    expect(after!.graphMessageId).toBe(before!.graphMessageId);
    expect(after!.createdAt).toBe(before!.createdAt);

    // Refreshed columns: updated to the new fetched values.
    expect(after!.sourceFolder).toBe('Archive');
    expect(after!.sentAt).toBe(Date.parse('2026-08-06T10:00:00Z'));
    expect(after!.receivedAt).toBe(Date.parse('2026-08-06T10:30:00Z'));
    expect(after!.isRead).toBe(true);
    expect(after!.importance).toBe('high');
    expect(after!.flagStatus).toBe('flagged');
    expect(after!.categories).toEqual(['Orange category']);
    expect(after!.webLink).toBe('https://outlook.office.com/mail/msg-1');
    expect(after!.internetMessageId).toBe('id-1-changed');

    // Participant rows: never written on refresh — displayName stays 'Sam', not 'Sam Changed'.
    const participantsAfter = db.select().from(emailParticipants).where(eq(emailParticipants.messageId, before!.id)).all();
    expect(participantsAfter).toEqual(participantsBefore);

    // Attachment rows: replaced wholesale.
    const attachmentsAfter = db.select().from(emailAttachments).where(eq(emailAttachments.messageId, before!.id)).all();
    expect(attachmentsAfter.map((a) => a.name)).toEqual(['b.pdf']);
  });
});
