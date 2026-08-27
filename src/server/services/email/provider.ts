export type WellKnownFolder = 'inbox' | 'sentitems' | 'archive' | 'junkemail' | 'deleteditems' | 'drafts';

export interface MailFolderNode {
  /** Graph folder id (fake providers: any stable string). */
  id: string;
  /** displayName, recorded on messages as sourceFolder. */
  name: string;
  wellKnown: WellKnownFolder | null;
  children: MailFolderNode[];
}

export interface MailRecipient {
  address: string;
  /** `emailAddress.name` as seen on this message; '' when the mailbox had no name for it. */
  name: string;
}

export type MailImportance = 'low' | 'normal' | 'high';
export type MailFlagStatus = 'notFlagged' | 'complete' | 'flagged';

export interface MailMessage {
  id: string;
  conversationId: string;
  subject: string;
  body: { content: string; contentType: 'html' | 'text' };
  receivedDateTime: string;
  sentDateTime: string;
  from: MailRecipient | null;
  toRecipients: MailRecipient[];
  ccRecipients: MailRecipient[];
  bccRecipients: MailRecipient[];
  isRead: boolean;
  importance: MailImportance;
  flagStatus: MailFlagStatus;
  categories: string[];
  hasAttachments: boolean;
  webLink: string;
  internetMessageId: string;
  isDraft: boolean;
}

export interface MailWindow {
  /** Inclusive ISO start, UTC. */
  startUtc: string;
  /** Exclusive ISO end, UTC. */
  endUtc: string;
}

export interface MailAttachmentMeta {
  name: string;
  contentType: string | null;
  sizeBytes: number;
  isInline: boolean;
}

export interface MailFolderRef {
  id: string;
  wellKnown: WellKnownFolder | null;
}

export interface MailProvider {
  /** Full folder tree, including folders the sync service will exclude (Junk/Deleted Items/Drafts). */
  listFolders(): Promise<MailFolderNode[]>;
  /** Sent Items filters/orders by sentDateTime; every other folder uses receivedDateTime (R6). */
  fetchMessages(folder: MailFolderRef, window: MailWindow): AsyncIterable<MailMessage[]>;
  /**
   * Metadata only — never file contents. Called only for messages with hasAttachments = true,
   * except the backfill, which passes allowNotFound for historical messages that may no longer
   * exist. `null` if and only if allowNotFound is set and the message is gone (Graph 404);
   * without options, 404 throws a connection error exactly like today.
   */
  fetchAttachmentMetadata(messageId: string, options?: { allowNotFound?: boolean }): Promise<MailAttachmentMeta[] | null>;
  /** Whole-call preflight for set-email-read-state: throws a typed error (never-signed-in/expired/no-write-permission) if the mailbox can't take writes right now. */
  verifyWriteAccess(): Promise<void>;
  /** Sets a message's read/unread state via the mailbox's minimal single-property write. 'not-found' when the mailbox no longer has the message (e.g. deleted); other failures throw. */
  setMessageReadState(graphMessageId: string, isRead: boolean): Promise<'updated' | 'not-found'>;
}
