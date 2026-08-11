import type {
  MailAttachmentMeta,
  MailFlagStatus,
  MailFolderNode,
  MailFolderRef,
  MailImportance,
  MailMessage,
  MailProvider,
  MailRecipient,
  MailWindow,
  WellKnownFolder,
} from './provider.js';

/**
 * An in-memory MailProvider for tests and the dev-only seeded mailbox (`MAIL_PROVIDER=fake` / `fake-unreachable`).
 * Never used in production — production always talks to Graph via GraphMailProvider.
 */

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
  /** A well-known key ('inbox', 'sent', 'archive', 'junk', 'drafts', 'deleted items') or an arbitrary custom folder name (e.g. 'Projects'). */
  folder: string;
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

interface ResolvedFolder {
  id: string;
  name: string;
  wellKnown: WellKnownFolder | null;
}

const WELL_KNOWN_BY_KEY: Record<string, { wellKnown: WellKnownFolder; name: string }> = {
  inbox: { wellKnown: 'inbox', name: 'Inbox' },
  sent: { wellKnown: 'sentitems', name: 'Sent Items' },
  sentitems: { wellKnown: 'sentitems', name: 'Sent Items' },
  'sent items': { wellKnown: 'sentitems', name: 'Sent Items' },
  archive: { wellKnown: 'archive', name: 'Archive' },
  junk: { wellKnown: 'junkemail', name: 'Junk Email' },
  junkemail: { wellKnown: 'junkemail', name: 'Junk Email' },
  drafts: { wellKnown: 'drafts', name: 'Drafts' },
  deleteditems: { wellKnown: 'deleteditems', name: 'Deleted Items' },
  'deleted items': { wellKnown: 'deleteditems', name: 'Deleted Items' },
};

const WELL_KNOWN_ORDER: WellKnownFolder[] = ['inbox', 'sentitems', 'archive', 'drafts', 'junkemail', 'deleteditems'];

function resolveFolder(key: string): ResolvedFolder {
  const known = WELL_KNOWN_BY_KEY[key.toLowerCase()];
  if (known) return { id: known.wellKnown, name: known.name, wellKnown: known.wellKnown };
  return { id: key, name: key, wellKnown: null };
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
  private readonly folders: Map<string, ResolvedFolder>;

  constructor(
    private readonly seeded: SeedMessage[],
    private readonly options: FakeMailProviderOptions = {},
  ) {
    this.folders = new Map();
    for (const seed of seeded) {
      const resolved = resolveFolder(seed.folder);
      this.folders.set(resolved.id, resolved);
    }
  }

  async listFolders(): Promise<MailFolderNode[]> {
    if (this.options.failImmediately) {
      throw new Error('mailbox unreachable');
    }
    const nodes = [...this.folders.values()].map((f): MailFolderNode => ({ id: f.id, name: f.name, wellKnown: f.wellKnown, children: [] }));
    nodes.sort((a, b) => {
      const ai = a.wellKnown ? WELL_KNOWN_ORDER.indexOf(a.wellKnown) : WELL_KNOWN_ORDER.length;
      const bi = b.wellKnown ? WELL_KNOWN_ORDER.indexOf(b.wellKnown) : WELL_KNOWN_ORDER.length;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  async *fetchMessages(folder: MailFolderRef, window: MailWindow): AsyncIterable<MailMessage[]> {
    if (this.options.failImmediately) {
      throw new Error('mailbox unreachable');
    }

    const pageSize = this.options.pageSize ?? 25;
    const startMs = Date.parse(window.startUtc);
    const endMs = Date.parse(window.endUtc);
    const timestampField = folder.wellKnown === 'sentitems' ? 'sentDateTime' : 'receivedDateTime';

    const matching = this.seeded.filter((seed) => {
      const resolved = resolveFolder(seed.folder);
      if (resolved.id !== folder.id) return false;
      const timestamp = Date.parse(seed[timestampField]);
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
