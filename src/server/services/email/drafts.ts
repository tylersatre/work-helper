import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailAddresses, emailConversations, emailMessages, emailParticipants } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import { getAppState } from '../app-state.js';
import { deriveBodyText } from './sync.js';
import type { MailMessage, MailProvider, MailRecipient } from './provider.js';

export class MessageNotFoundError extends Error {
  constructor(messageId: number) {
    super(`Message ${messageId} not found`);
    this.name = 'MessageNotFoundError';
  }
}

type AppDb = BetterSQLite3Database<typeof schema>;

const SIGNATURE_KEY = 'email.signature';

export class EmptyBodyError extends Error {
  constructor() {
    super('A body is required');
    this.name = 'EmptyBodyError';
  }
}

export interface DraftSummary {
  messageId: number;
  conversationId: number;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  isDraft: true;
  webLink: string;
}

function toRecipients(addresses: string[]): MailRecipient[] {
  return addresses.map((address) => ({ address, name: '' }));
}

function findOrCreateAddressId(db: AppDb, address: string): number {
  const [existing] = db
    .select({ id: emailAddresses.id })
    .from(emailAddresses)
    .where(sql`lower(${emailAddresses.value}) = lower(${address})`)
    .limit(1)
    .all();
  if (existing) {
    return existing.id;
  }
  const [created] = db
    .insert(emailAddresses)
    .values({ personId: null, value: address, isPrimary: false, createdAt: Date.now() })
    .returning()
    .all();
  return created!.id;
}

function findOrCreateConversationId(db: AppDb, graphConversationId: string): number {
  const [existing] = db
    .select({ id: emailConversations.id })
    .from(emailConversations)
    .where(eq(emailConversations.graphConversationId, graphConversationId))
    .limit(1)
    .all();
  if (existing) {
    return existing.id;
  }
  const [created] = db
    .insert(emailConversations)
    .values({ graphConversationId, createdAt: Date.now() })
    .returning()
    .all();
  return created!.id;
}

interface AddressRole {
  address: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
  name: string;
}

function participantsOf(message: MailMessage): AddressRole[] {
  const roles: AddressRole[] = [];
  if (message.from?.address) {
    roles.push({ address: message.from.address, role: 'from', name: message.from.name });
  }
  for (const recipient of message.toRecipients ?? []) {
    if (recipient.address) roles.push({ address: recipient.address, role: 'to', name: recipient.name });
  }
  for (const recipient of message.ccRecipients ?? []) {
    if (recipient.address) roles.push({ address: recipient.address, role: 'cc', name: recipient.name });
  }
  for (const recipient of message.bccRecipients ?? []) {
    if (recipient.address) roles.push({ address: recipient.address, role: 'bcc', name: recipient.name });
  }

  const seen = new Set<string>();
  return roles.filter((entry) => {
    const key = `${entry.address.toLowerCase()}::${entry.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ingests a freshly created/replied draft into the store as a new message, starting or joining a conversation by graphConversationId. */
function ingestNewDraft(db: AppDb, message: MailMessage): number {
  const bodyText = deriveBodyText(message.body.content, message.body.contentType);
  const roles = participantsOf(message);

  let insertedId!: number;
  db.transaction((tx) => {
    const conversationId = findOrCreateConversationId(tx, message.conversationId);

    const [inserted] = tx
      .insert(emailMessages)
      .values({
        conversationId,
        graphMessageId: message.id,
        sourceFolder: 'Drafts',
        subject: message.subject,
        bodyOriginal: message.body.content,
        bodyContentType: message.body.contentType,
        bodyText,
        sentAt: Date.parse(message.sentDateTime),
        receivedAt: Date.parse(message.receivedDateTime),
        isRead: message.isRead,
        importance: message.importance,
        flagStatus: message.flagStatus,
        categories: message.categories,
        webLink: message.webLink,
        internetMessageId: message.internetMessageId,
        isDraft: true,
        createdAt: Date.now(),
      })
      .returning()
      .all();

    for (const { address, role, name } of roles) {
      const addressId = findOrCreateAddressId(tx, address);
      tx.insert(emailParticipants).values({ messageId: inserted!.id, addressId, role, displayName: name }).run();
    }

    insertedId = inserted!.id;
  });

  return insertedId;
}

function summaryOf(db: AppDb, messageId: number, message: MailMessage): DraftSummary {
  const [row] = db
    .select({ conversationId: emailMessages.conversationId })
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId))
    .limit(1)
    .all();
  return {
    messageId,
    conversationId: row!.conversationId,
    subject: message.subject,
    to: (message.toRecipients ?? []).map((r) => r.address),
    cc: (message.ccRecipients ?? []).map((r) => r.address),
    bcc: (message.bccRecipients ?? []).map((r) => r.address),
    isDraft: true,
    webLink: message.webLink,
  };
}

export interface CreateDraftArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
}

/**
 * Creates a fresh standalone draft: preflight write access, validate the body, compose it with the
 * saved signature (read at call time), write through the mailbox, then ingest the response as a new
 * conversation (FR-001/FR-002/FR-012/FR-022).
 */
export async function createDraft(db: AppDb, provider: MailProvider, args: CreateDraftArgs): Promise<DraftSummary> {
  await provider.verifyWriteAccess();

  if (args.bodyHtml.trim() === '') {
    throw new EmptyBodyError();
  }

  const signature = getAppState(db, SIGNATURE_KEY);
  const bodyHtml = signature ? `${args.bodyHtml}${signature}` : args.bodyHtml;

  const message = await provider.createDraft({
    to: toRecipients(args.to),
    cc: args.cc ? toRecipients(args.cc) : undefined,
    bcc: args.bcc ? toRecipients(args.bcc) : undefined,
    subject: args.subject,
    bodyHtml,
  });

  const messageId = ingestNewDraft(db, message);
  return summaryOf(db, messageId, message);
}

export interface CreateReplyDraftArgs {
  messageId: number;
  replyAll?: boolean;
  bodyHtml: string;
}

/**
 * Creates a reply/reply-all draft for a synced message: preflight write access, validate the body,
 * look up the target message in the store (before any mailbox call), compose the prefix with the
 * saved signature, write through the mailbox's reply machinery, then ingest the response into the
 * existing conversation (FR-005/FR-006/FR-012/FR-022).
 */
export async function createReplyDraft(db: AppDb, provider: MailProvider, args: CreateReplyDraftArgs): Promise<DraftSummary> {
  await provider.verifyWriteAccess();

  if (args.bodyHtml.trim() === '') {
    throw new EmptyBodyError();
  }

  const [row] = db
    .select({ graphMessageId: emailMessages.graphMessageId })
    .from(emailMessages)
    .where(eq(emailMessages.id, args.messageId))
    .limit(1)
    .all();
  if (!row) {
    throw new MessageNotFoundError(args.messageId);
  }

  const signature = getAppState(db, SIGNATURE_KEY);
  const prefixHtml = signature ? `${args.bodyHtml}${signature}` : args.bodyHtml;

  const message = await provider.createReplyDraft(row.graphMessageId, { replyAll: args.replyAll ?? false, prefixHtml });

  const insertedId = ingestNewDraft(db, message);
  return summaryOf(db, insertedId, message);
}
