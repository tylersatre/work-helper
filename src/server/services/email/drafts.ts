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

export class NotADraftError extends Error {
  constructor(messageId: number) {
    super(`Message ${messageId} is not a draft — only draft messages can be edited or deleted.`);
    this.name = 'NotADraftError';
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

/** Ingests a freshly created/replied draft into the store as a new message, starting or joining a conversation by graphConversationId. Also used by sync's Drafts-folder phase for hand-started drafts new to the store (US5). */
export function ingestNewDraft(db: AppDb, message: MailMessage): number {
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

/**
 * Rewrites all content fields of an already-stored draft row and replaces its participants wholesale
 * (delete + reinsert) — the mirror path draft rows use instead of the snapshot rule (data-model.md).
 * Reused by sync's Drafts-folder phase (US5).
 */
export function mirrorDraftMessage(db: AppDb, messageId: number, message: MailMessage): void {
  const bodyText = deriveBodyText(message.body.content, message.body.contentType);
  const roles = participantsOf(message);

  db.transaction((tx) => {
    tx.update(emailMessages)
      .set({
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
      })
      .where(eq(emailMessages.id, messageId))
      .run();

    tx.delete(emailParticipants).where(eq(emailParticipants.messageId, messageId)).run();
    for (const { address, role, name } of roles) {
      const addressId = findOrCreateAddressId(tx, address);
      tx.insert(emailParticipants).values({ messageId, addressId, role, displayName: name }).run();
    }
  });
}

/** Removes a draft row (+ participants), deleting its conversation too when that was the last message. Also used by sync's Drafts-folder reconciliation (US5). */
export function removeDraftMessage(db: AppDb, messageId: number, conversationId: number): void {
  db.transaction((tx) => {
    tx.delete(emailParticipants).where(eq(emailParticipants.messageId, messageId)).run();
    tx.delete(emailMessages).where(eq(emailMessages.id, messageId)).run();

    const [remaining] = tx
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.conversationId, conversationId))
      .limit(1)
      .all();
    if (!remaining) {
      tx.delete(emailConversations).where(eq(emailConversations.id, conversationId)).run();
    }
  });
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

function draftGuardLookup(db: AppDb, messageId: number): { graphMessageId: string } {
  const [row] = db
    .select({ graphMessageId: emailMessages.graphMessageId, isDraft: emailMessages.isDraft })
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId))
    .limit(1)
    .all();
  if (!row || !row.isDraft) {
    throw new NotADraftError(messageId);
  }
  return { graphMessageId: row.graphMessageId };
}

export interface UpdateDraftArgs {
  messageId: number;
  bodyHtml: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
}

/**
 * Replaces a draft's body verbatim and whole (nothing appended, not even the signature); optionally
 * changes recipients/subject. Guarded by is_draft = true, checked before any mailbox call (FR-011).
 */
export async function updateDraft(db: AppDb, provider: MailProvider, args: UpdateDraftArgs): Promise<DraftSummary> {
  await provider.verifyWriteAccess();

  if (args.bodyHtml.trim() === '') {
    throw new EmptyBodyError();
  }

  const { graphMessageId } = draftGuardLookup(db, args.messageId);

  const message = await provider.updateDraft(graphMessageId, {
    bodyHtml: args.bodyHtml,
    to: args.to ? toRecipients(args.to) : undefined,
    cc: args.cc ? toRecipients(args.cc) : undefined,
    bcc: args.bcc ? toRecipients(args.bcc) : undefined,
    subject: args.subject,
  });

  mirrorDraftMessage(db, args.messageId, message);
  return summaryOf(db, args.messageId, message);
}

export interface DeleteDraftResult {
  messageId: number;
  deleted: true;
}

/** Deletes a draft from the mailbox and the store. Guarded by is_draft = true, checked before any mailbox call. */
export async function deleteDraft(db: AppDb, provider: MailProvider, messageId: number): Promise<DeleteDraftResult> {
  await provider.verifyWriteAccess();

  const { graphMessageId } = draftGuardLookup(db, messageId);
  const [row] = db.select({ conversationId: emailMessages.conversationId }).from(emailMessages).where(eq(emailMessages.id, messageId)).limit(1).all();

  await provider.deleteDraft(graphMessageId);

  removeDraftMessage(db, messageId, row!.conversationId);
  return { messageId, deleted: true };
}
