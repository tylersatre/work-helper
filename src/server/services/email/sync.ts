import { convert } from 'html-to-text';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailAddresses, emailAttachments, emailConversations, emailMessages, emailParticipants } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import { ingestNewDraft, mirrorDraftMessage, removeDraftMessage } from './drafts.js';
import type { MailFolderNode, MailMessage, MailProvider, WellKnownFolder } from './provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface SyncWindow {
  startUtc: string;
  endUtc: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDate(value: string): { year: number; month: number; day: number } {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid date "${value}": expected YYYY-MM-DD`);
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`Invalid date "${value}": not a real calendar day`);
  }
  return { year, month, day };
}

/** Converts a `YYYY-MM-DD`..`YYYY-MM-DD` range (inclusive of both endpoint days) into a UTC window spanning whole local days. */
export function computeSyncWindow(startDate: string, endDate: string): SyncWindow {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  const startLocal = new Date(start.year, start.month - 1, start.day, 0, 0, 0, 0);
  const endLocal = new Date(end.year, end.month - 1, end.day + 1, 0, 0, 0, 0);

  if (startLocal.getTime() >= endLocal.getTime()) {
    throw new Error('startDate must not be after endDate');
  }

  return { startUtc: startLocal.toISOString(), endUtc: endLocal.toISOString() };
}

/** Derives the plain-text form of a message body: text passes through, html is converted (wrapping disabled, links inline). */
export function deriveBodyText(content: string, contentType: 'html' | 'text'): string {
  if (content === '') {
    return '';
  }
  if (contentType === 'text') {
    return content;
  }
  return convert(content, { wordwrap: false });
}

export interface SyncResult {
  status: 'complete' | 'interrupted';
  newCount: number;
  updatedCount: number;
  error?: string;
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

function findOrCreateAddressId(tx: AppDb, address: string): number {
  const [existing] = tx
    .select({ id: emailAddresses.id })
    .from(emailAddresses)
    .where(sql`lower(${emailAddresses.value}) = lower(${address})`)
    .limit(1)
    .all();
  if (existing) {
    return existing.id;
  }
  const [created] = tx
    .insert(emailAddresses)
    .values({ personId: null, value: address, isPrimary: false, createdAt: Date.now() })
    .returning()
    .all();
  return created!.id;
}

function findOrCreateConversationId(tx: AppDb, graphConversationId: string): number {
  const [existing] = tx
    .select({ id: emailConversations.id })
    .from(emailConversations)
    .where(eq(emailConversations.graphConversationId, graphConversationId))
    .limit(1)
    .all();
  if (existing) {
    return existing.id;
  }
  const [created] = tx
    .insert(emailConversations)
    .values({ graphConversationId, createdAt: Date.now() })
    .returning()
    .all();
  return created!.id;
}

const EXCLUDED_WELL_KNOWN_FOLDERS = new Set<WellKnownFolder>(['junkemail', 'deleteditems', 'drafts']);

/** Flattens a folder tree, pruning Junk/Deleted Items/Drafts subtrees entirely (R2) — every other folder, at any depth, syncs. */
export function flattenSyncableFolders(tree: MailFolderNode[]): MailFolderNode[] {
  const result: MailFolderNode[] = [];
  function walk(nodes: MailFolderNode[]): void {
    for (const node of nodes) {
      if (node.wellKnown && EXCLUDED_WELL_KNOWN_FOLDERS.has(node.wellKnown)) {
        continue;
      }
      result.push(node);
      walk(node.children);
    }
  }
  walk(tree);
  return result;
}

type IngestOutcome = 'new' | 'updated';

/** Ingests one message in a single transaction: inserts it if new, or refreshes its metadata (per R7) if already stored. */
async function ingestMessage(db: AppDb, provider: MailProvider, message: MailMessage, folderName: string): Promise<IngestOutcome> {
  const [existing] = db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(eq(emailMessages.graphMessageId, message.id))
    .limit(1)
    .all();

  const sentAt = Date.parse(message.sentDateTime);
  const receivedAt = Date.parse(message.receivedDateTime);
  const attachments = message.hasAttachments ? ((await provider.fetchAttachmentMetadata(message.id)) ?? []) : [];

  if (existing) {
    db.transaction((tx) => {
      tx.update(emailMessages)
        .set({
          sourceFolder: folderName,
          sentAt,
          receivedAt,
          isRead: message.isRead,
          importance: message.importance,
          flagStatus: message.flagStatus,
          categories: message.categories,
          webLink: message.webLink,
          internetMessageId: message.internetMessageId,
          isDraft: message.isDraft,
        })
        .where(eq(emailMessages.id, existing.id))
        .run();

      tx.delete(emailAttachments).where(eq(emailAttachments.messageId, existing.id)).run();
      for (const attachment of attachments) {
        tx.insert(emailAttachments)
          .values({
            messageId: existing.id,
            name: attachment.name,
            contentType: attachment.contentType,
            sizeBytes: attachment.sizeBytes,
            isInline: attachment.isInline,
          })
          .run();
      }
    });

    return 'updated';
  }

  const bodyText = deriveBodyText(message.body.content, message.body.contentType);
  const roles = participantsOf(message);

  db.transaction((tx) => {
    const conversationId = findOrCreateConversationId(tx, message.conversationId);

    const [inserted] = tx
      .insert(emailMessages)
      .values({
        conversationId,
        graphMessageId: message.id,
        sourceFolder: folderName,
        subject: message.subject,
        bodyOriginal: message.body.content,
        bodyContentType: message.body.contentType,
        bodyText,
        sentAt,
        receivedAt,
        isRead: message.isRead,
        importance: message.importance,
        flagStatus: message.flagStatus,
        categories: message.categories,
        webLink: message.webLink,
        internetMessageId: message.internetMessageId,
        isDraft: message.isDraft,
        createdAt: Date.now(),
      })
      .returning()
      .all();

    for (const { address, role, name } of roles) {
      const addressId = findOrCreateAddressId(tx, address);
      tx.insert(emailParticipants).values({ messageId: inserted!.id, addressId, role, displayName: name }).run();
    }

    for (const attachment of attachments) {
      tx.insert(emailAttachments)
        .values({
          messageId: inserted!.id,
          name: attachment.name,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
          isInline: attachment.isInline,
        })
        .run();
    }
  });

  return 'new';
}

/**
 * Pulls the entire Drafts folder (no date filter — FR-015) and mirrors every draft-flagged row: new
 * drafts are inserted, re-encountered drafts have all content fields + participants replaced
 * wholesale (research R6). At the end, reconciles removals — every store row still `is_draft = 1`
 * whose `graphMessageId` was not seen in this pull is deleted (discarded/sent-and-not-yet-ranged
 * drafts), uncounted.
 */
async function runDraftsPhase(db: AppDb, provider: MailProvider): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;
  const seenGraphMessageIds = new Set<string>();

  await provider.fetchDraftMessages((message) => {
    seenGraphMessageIds.add(message.id);
    const [existing] = db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.graphMessageId, message.id))
      .limit(1)
      .all();

    if (existing) {
      mirrorDraftMessage(db, existing.id, message);
      updatedCount += 1;
    } else {
      ingestNewDraft(db, message);
      newCount += 1;
    }
  });

  const staleDrafts = db
    .select({ id: emailMessages.id, graphMessageId: emailMessages.graphMessageId, conversationId: emailMessages.conversationId })
    .from(emailMessages)
    .where(eq(emailMessages.isDraft, true))
    .all()
    .filter((row) => !seenGraphMessageIds.has(row.graphMessageId));

  for (const row of staleDrafts) {
    removeDraftMessage(db, row.id, row.conversationId);
  }

  return { newCount, updatedCount };
}

/** Pulls every syncable folder (all but Junk/Deleted Items/Drafts) in the given window, storing new messages and refreshing already-stored ones, then mirrors the entire Drafts folder (US5). Partial progress survives a mid-run failure. */
export async function runSync(db: AppDb, provider: MailProvider, window: SyncWindow): Promise<SyncResult> {
  let newCount = 0;
  let updatedCount = 0;

  try {
    const tree = await provider.listFolders();
    const folders = flattenSyncableFolders(tree);
    for (const folder of folders) {
      for await (const page of provider.fetchMessages({ id: folder.id, wellKnown: folder.wellKnown }, window)) {
        for (const message of page) {
          const outcome = await ingestMessage(db, provider, message, folder.name);
          if (outcome === 'new') {
            newCount += 1;
          } else {
            updatedCount += 1;
          }
        }
      }
    }

    const drafts = await runDraftsPhase(db, provider);
    newCount += drafts.newCount;
    updatedCount += drafts.updatedCount;

    return { status: 'complete', newCount, updatedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (newCount === 0 && updatedCount === 0) {
      throw error instanceof Error ? error : new Error(message);
    }
    return { status: 'interrupted', newCount, updatedCount, error: message };
  }
}
