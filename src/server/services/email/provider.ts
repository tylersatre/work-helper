export type MailFolder = 'inbox' | 'sent';

export interface MailRecipient {
  address: string;
}

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
}

export interface MailWindow {
  /** Inclusive ISO start, UTC. */
  startUtc: string;
  /** Exclusive ISO end, UTC. */
  endUtc: string;
}

export interface MailProvider {
  fetchMessages(folder: MailFolder, window: MailWindow): AsyncIterable<MailMessage[]>;
}
