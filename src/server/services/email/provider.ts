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
  /** Metadata only — never file contents. Called only for messages with hasAttachments = true. */
  fetchAttachmentMetadata(messageId: string): Promise<MailAttachmentMeta[]>;
}
