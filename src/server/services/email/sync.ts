import { convert } from 'html-to-text';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailAddresses, emailAttachments, emailConversations, emailMessages, emailParticipants } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';
import type { MailFolder, MailMessage, MailProvider } from './provider.js';

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

/** Ingests one message in a single transaction; returns whether it was newly stored (false when already present). */
async function ingestMessage(db: AppDb, provider: MailProvider, message: MailMessage, folder: MailFolder): Promise<boolean> {
  const [existing] = db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(eq(emailMessages.graphMessageId, message.id))
    .limit(1)
    .all();
  if (existing) {
    return false;
  }

  const sentAt = Date.parse(message.sentDateTime);
  const receivedAt = Date.parse(message.receivedDateTime);
  const bodyText = deriveBodyText(message.body.content, message.body.contentType);
  const roles = participantsOf(message);
  const attachments = message.hasAttachments ? await provider.fetchAttachmentMetadata(message.id) : [];

  db.transaction((tx) => {
    const conversationId = findOrCreateConversationId(tx, message.conversationId);

    const [inserted] = tx
      .insert(emailMessages)
      .values({
        conversationId,
        graphMessageId: message.id,
        sourceFolder: folder,
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
        .values({ messageId: inserted!.id, name: attachment.name, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes })
        .run();
    }
  });

  return true;
}

/** Pulls Inbox + Sent messages in the given window and stores each once. Partial progress survives a mid-run failure. */
export async function runSync(db: AppDb, provider: MailProvider, window: SyncWindow): Promise<SyncResult> {
  let newCount = 0;
  const updatedCount = 0;

  try {
    for (const folder of ['inbox', 'sent'] as const) {
      for await (const page of provider.fetchMessages(folder, window)) {
        for (const message of page) {
          if (await ingestMessage(db, provider, message, folder)) {
            newCount += 1;
          }
        }
      }
    }
    return { status: 'complete', newCount, updatedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (newCount === 0) {
      throw error instanceof Error ? error : new Error(message);
    }
    return { status: 'interrupted', newCount, updatedCount, error: message };
  }
}
