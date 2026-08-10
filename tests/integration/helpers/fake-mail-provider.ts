import type {
  MailAttachmentMeta,
  MailFlagStatus,
  MailFolder,
  MailImportance,
  MailMessage,
  MailProvider,
  MailRecipient,
  MailWindow,
} from '../../../src/server/services/email/provider.js';

export interface SeedRecipient {
  address: string;
  name?: string;
}

export interface SeedAttachment {
  name: string;
  contentType: string | null;
  sizeBytes: number;
}

export interface SeedMessage {
  id: string;
  conversationId: string;
  subject: string;
  body: { content: string; contentType: 'html' | 'text' };
  receivedDateTime: string;
  sentDateTime: string;
  from: SeedRecipient | null;
  toRecipients: SeedRecipient[];
  ccRecipients: SeedRecipient[];
  bccRecipients: SeedRecipient[];
  folder: MailFolder;
  isRead?: boolean;
  importance?: MailImportance;
  flagStatus?: MailFlagStatus;
  categories?: string[];
  webLink?: string;
  internetMessageId?: string;
  attachments?: SeedAttachment[];
}

export interface FakeMailProviderOptions {
  /** Messages per yielded page (mirrors Graph's `$top` paging). Defaults to 25. */
  pageSize?: number;
  /** Throws before yielding anything at all — simulates an unreachable mailbox or expired sign-in. */
  failImmediately?: boolean;
  /** Throws once this many messages (across all folders/pages, cumulative for this provider instance) have already been yielded — simulates a connection drop mid-run. */
  throwAfterMessageCount?: number;
}

function toRecipient(recipient: SeedRecipient): MailRecipient {
  return { address: recipient.address, name: recipient.name ?? '' };
}

function toMailMessage(seed: SeedMessage): MailMessage {
  const attachments = seed.attachments ?? [];
  return {
    id: seed.id,
    conversationId: seed.conversationId,
    subject: seed.subject,
    body: seed.body,
    receivedDateTime: seed.receivedDateTime,
    sentDateTime: seed.sentDateTime,
    from: seed.from ? toRecipient(seed.from) : null,
    toRecipients: seed.toRecipients.map(toRecipient),
    ccRecipients: seed.ccRecipients.map(toRecipient),
    bccRecipients: seed.bccRecipients.map(toRecipient),
    isRead: seed.isRead ?? false,
    importance: seed.importance ?? 'normal',
    flagStatus: seed.flagStatus ?? 'notFlagged',
    categories: seed.categories ?? [],
    hasAttachments: attachments.length > 0,
    webLink: seed.webLink ?? '',
    internetMessageId: seed.internetMessageId ?? '',
  };
}

export class FakeMailProvider implements MailProvider {
  private yieldedCount = 0;

  constructor(
    private readonly seeded: SeedMessage[],
    private readonly options: FakeMailProviderOptions = {},
  ) {}

  async *fetchMessages(folder: MailFolder, window: MailWindow): AsyncIterable<MailMessage[]> {
    if (this.options.failImmediately) {
      throw new Error('mailbox unreachable');
    }

    const pageSize = this.options.pageSize ?? 25;
    const startMs = Date.parse(window.startUtc);
    const endMs = Date.parse(window.endUtc);

    const matching = this.seeded.filter((seed) => {
      if (seed.folder !== folder) return false;
      const timestamp = Date.parse(folder === 'inbox' ? seed.receivedDateTime : seed.sentDateTime);
      return timestamp >= startMs && timestamp < endMs;
    });

    for (let i = 0; i < matching.length; i += pageSize) {
      const chunk = matching.slice(i, i + pageSize);
      yield chunk.map(toMailMessage);

      this.yieldedCount += chunk.length;
      if (this.options.throwAfterMessageCount !== undefined && this.yieldedCount >= this.options.throwAfterMessageCount) {
        throw new Error('mailbox connection lost mid-sync');
      }
    }
  }

  async fetchAttachmentMetadata(messageId: string): Promise<MailAttachmentMeta[]> {
    const seed = this.seeded.find((s) => s.id === messageId);
    return (seed?.attachments ?? []).map((a) => ({ name: a.name, contentType: a.contentType, sizeBytes: a.sizeBytes }));
  }
}
