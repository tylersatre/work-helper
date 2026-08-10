export type MailFolder = 'inbox' | 'sent';

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

export interface MailProvider {
  fetchMessages(folder: MailFolder, window: MailWindow): AsyncIterable<MailMessage[]>;
  /** Metadata only — never file contents. Called only for messages with hasAttachments = true. */
  fetchAttachmentMetadata(messageId: string): Promise<MailAttachmentMeta[]>;
}
