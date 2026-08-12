import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { LinkedCardSummary } from '../../../shared/types.js';
import { emailAddresses, emailAttachments, emailConversations, emailMessages, emailParticipants, people, syncRuns } from '../../db/schema.js';
import { cardsForConversation } from '../task-conversations.js';
import type * as schema from '../../db/schema.js';
import type { SyncRunRecord } from './sync-coordinator.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface Cursor {
  primary: number;
  id: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function decodeCursor(value: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf-8'));
  } catch {
    throw new Error('Invalid cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).primary !== 'number' ||
    typeof (parsed as Record<string, unknown>).id !== 'number'
  ) {
    throw new Error('Invalid cursor');
  }
  const { primary, id } = parsed as { primary: number; id: number };
  return { primary, id };
}

export interface ConversationParticipantSummary {
  address: string;
  displayName: string;
  person: { id: number; name: string } | null;
}

export interface ConversationSummary {
  id: number;
  subject: string;
  messageCount: number;
  latestMessageAt: number;
  hasUnread: boolean;
  hasAttachments: boolean;
  participants: ConversationParticipantSummary[];
}

export interface ConversationsPage {
  conversations: ConversationSummary[];
  nextCursor: string | null;
}

export function participantsForConversation(db: AppDb, conversationId: number): ConversationParticipantSummary[] {
  const rows = db.all<{
    address: string;
    displayName: string;
    personId: number | null;
    firstName: string | null;
    lastName: string | null;
  }>(sql`
    SELECT ea.value AS address, ep.display_name AS displayName, p.id AS personId, p.first_name AS firstName, p.last_name AS lastName
    FROM email_participants ep
    JOIN email_addresses ea ON ea.id = ep.address_id
    JOIN email_messages m ON m.id = ep.message_id
    LEFT JOIN people p ON p.id = ea.person_id
    WHERE m.conversation_id = ${conversationId}
    ORDER BY (ep.display_name = '') ASC, m.sent_at DESC
  `);

  const byAddress = new Map<string, ConversationParticipantSummary>();
  for (const row of rows) {
    if (byAddress.has(row.address)) continue;
    byAddress.set(row.address, {
      address: row.address,
      displayName: row.displayName,
      person: row.personId != null ? { id: row.personId, name: `${row.firstName} ${row.lastName}` } : null,
    });
  }
  return [...byAddress.values()];
}

export function listConversations(
  db: AppDb,
  params: { limit: number; cursor?: string; attachmentRollup?: 'all' | 'non-inline' },
): ConversationsPage {
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  const cursorCondition = cursor
    ? sql`AND (agg.latestMessageAt < ${cursor.primary} OR (agg.latestMessageAt = ${cursor.primary} AND agg.id < ${cursor.id}))`
    : sql``;
  const attachInlineCondition = params.attachmentRollup === 'non-inline' ? sql`WHERE a.is_inline = 0` : sql``;

  const rows = db.all<{
    id: number;
    subject: string;
    messageCount: number;
    latestMessageAt: number;
    hasUnreadRaw: number;
    hasAttachmentsRaw: number;
  }>(sql`
    WITH agg AS (
      SELECT conversation_id AS id, COUNT(*) AS messageCount, MAX(sent_at) AS latestMessageAt,
             MAX(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS hasUnreadRaw
      FROM email_messages
      GROUP BY conversation_id
    ),
    earliest AS (
      SELECT conversation_id, subject,
             ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY sent_at ASC, id ASC) AS rn
      FROM email_messages
    ),
    attach AS (
      SELECT DISTINCT m.conversation_id AS id
      FROM email_messages m
      JOIN email_attachments a ON a.message_id = m.id
      ${attachInlineCondition}
    )
    SELECT agg.id AS id, earliest.subject AS subject, agg.messageCount AS messageCount, agg.latestMessageAt AS latestMessageAt,
           agg.hasUnreadRaw AS hasUnreadRaw,
           CASE WHEN attach.id IS NULL THEN 0 ELSE 1 END AS hasAttachmentsRaw
    FROM agg
    JOIN earliest ON earliest.conversation_id = agg.id AND earliest.rn = 1
    LEFT JOIN attach ON attach.id = agg.id
    WHERE 1 = 1 ${cursorCondition}
    ORDER BY agg.latestMessageAt DESC, agg.id DESC
    LIMIT ${params.limit + 1}
  `);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ primary: last.latestMessageAt, id: last.id }) : null;

  const conversations = page.map((row) => ({
    id: row.id,
    subject: row.subject,
    messageCount: row.messageCount,
    latestMessageAt: row.latestMessageAt,
    hasUnread: row.hasUnreadRaw === 1,
    hasAttachments: row.hasAttachmentsRaw === 1,
    participants: participantsForConversation(db, row.id),
  }));

  return { conversations, nextCursor };
}

export interface ConversationParticipant {
  address: string;
  displayName: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
  person: { id: number; name: string } | null;
}

export interface EmailAttachment {
  name: string;
  contentType: string | null;
  sizeBytes: number;
}

export interface ConversationMessage {
  id: number;
  subject: string;
  sentAt: number;
  receivedAt: number;
  bodyText: string;
  bodyOriginal?: string;
  bodyContentType?: 'html' | 'text';
  sourceFolder: string;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  flagStatus: 'notFlagged' | 'complete' | 'flagged';
  categories: string[];
  webLink: string;
  internetMessageId: string;
  attachments: EmailAttachment[];
  participants: ConversationParticipant[];
}

export interface ConversationDetail {
  id: number;
  subject: string;
  messages: ConversationMessage[];
  cards: LinkedCardSummary[];
}

export interface PersonEmailAddressRole {
  address: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
  displayName: string;
}

export interface PersonEmail {
  messageId: number;
  conversationId: number;
  subject: string;
  sentAt: number;
  receivedAt: number;
  sourceFolder: string;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  flagStatus: 'notFlagged' | 'complete' | 'flagged';
  categories: string[];
  webLink: string;
  internetMessageId: string;
  attachments: EmailAttachment[];
  addresses: PersonEmailAddressRole[];
}

export interface PersonEmailsPage {
  emails: PersonEmail[];
  nextCursor: string | null;
}

function attachmentsForMessage(db: AppDb, messageId: number, filter: 'all' | 'non-inline' = 'all'): EmailAttachment[] {
  const condition =
    filter === 'non-inline'
      ? and(eq(emailAttachments.messageId, messageId), eq(emailAttachments.isInline, false))
      : eq(emailAttachments.messageId, messageId);
  return db
    .select({ name: emailAttachments.name, contentType: emailAttachments.contentType, sizeBytes: emailAttachments.sizeBytes })
    .from(emailAttachments)
    .where(condition)
    .all();
}

export function emailsForPerson(db: AppDb, personId: number, params: { limit: number; cursor?: string }): PersonEmailsPage {
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  const cursorCondition = cursor
    ? sql`AND (m.sent_at < ${cursor.primary} OR (m.sent_at = ${cursor.primary} AND m.id < ${cursor.id}))`
    : sql``;

  const rows = db.all<{ id: number; sentAt: number }>(sql`
    SELECT DISTINCT m.id AS id, m.sent_at AS sentAt
    FROM email_messages m
    JOIN email_participants ep ON ep.message_id = m.id
    JOIN email_addresses ea ON ea.id = ep.address_id
    WHERE ea.person_id = ${personId} ${cursorCondition}
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT ${params.limit + 1}
  `);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ primary: last.sentAt, id: last.id }) : null;

  const emails = page.map((row) => {
    const [message] = db.select().from(emailMessages).where(eq(emailMessages.id, row.id)).all();
    const addresses = db.all<PersonEmailAddressRole>(sql`
      SELECT ea.value AS address, ep.role AS role, ep.display_name AS displayName
      FROM email_participants ep
      JOIN email_addresses ea ON ea.id = ep.address_id
      WHERE ep.message_id = ${row.id} AND ea.person_id = ${personId}
    `);
    return {
      messageId: message!.id,
      conversationId: message!.conversationId,
      subject: message!.subject,
      sentAt: message!.sentAt,
      receivedAt: message!.receivedAt,
      sourceFolder: message!.sourceFolder,
      isRead: message!.isRead,
      importance: message!.importance,
      flagStatus: message!.flagStatus,
      categories: message!.categories,
      webLink: message!.webLink,
      internetMessageId: message!.internetMessageId,
      attachments: attachmentsForMessage(db, message!.id),
      addresses,
    };
  });

  return { emails, nextCursor };
}

function participantsForMessage(db: AppDb, messageId: number): ConversationParticipant[] {
  const rows = db
    .select({
      role: emailParticipants.role,
      address: emailAddresses.value,
      displayName: emailParticipants.displayName,
      personId: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(emailParticipants)
    .innerJoin(emailAddresses, eq(emailParticipants.addressId, emailAddresses.id))
    .leftJoin(people, eq(emailAddresses.personId, people.id))
    .where(eq(emailParticipants.messageId, messageId))
    .all();

  return rows.map((row) => ({
    address: row.address,
    displayName: row.displayName,
    role: row.role,
    person: row.personId != null ? { id: row.personId, name: `${row.firstName} ${row.lastName}` } : null,
  }));
}

export interface UnlinkedAddressSummary {
  address: string;
  messageCount: number;
  eventCount: number;
  displayName: string;
  lastMessageAt: number | null;
}

/**
 * Every unlinked address seen in mail or as a non-`resource` calendar event participant, complete
 * and computed live per call (FR-015–FR-017, FR-022, research R11). An address qualifies via mail
 * OR non-resource event participation — addresses seen only in the `resource` role (rooms,
 * equipment) never qualify. `messageCount`/`lastMessageAt` are 0/null for calendar-only addresses;
 * `eventCount` counts only non-resource event rows even for an address that also appears as a
 * resource elsewhere. The display name is the most recent non-empty name across both mail
 * (`sent_at`) and every event appearance regardless of role (`start_at`).
 */
export function listUnlinkedAddresses(db: AppDb): UnlinkedAddressSummary[] {
  const rows = db.all<{
    address: string;
    messageCount: number;
    eventCount: number;
    lastMessageAt: number | null;
    displayName: string;
  }>(sql`
    WITH mail_agg AS (
      SELECT ea.id AS addressId, COUNT(DISTINCT ep.message_id) AS messageCount, MAX(m.sent_at) AS lastMessageAt
      FROM email_addresses ea
      JOIN email_participants ep ON ep.address_id = ea.id
      JOIN email_messages m ON m.id = ep.message_id
      WHERE ea.person_id IS NULL
      GROUP BY ea.id
    ),
    event_agg AS (
      SELECT ea.id AS addressId, COUNT(DISTINCT cep.event_id) AS eventCount
      FROM email_addresses ea
      JOIN calendar_event_participants cep ON cep.address_id = ea.id AND cep.role != 'resource'
      WHERE ea.person_id IS NULL
      GROUP BY ea.id
    ),
    qualifying AS (
      SELECT addressId FROM mail_agg
      UNION
      SELECT addressId FROM event_agg
    ),
    name_candidates AS (
      SELECT ea.id AS addressId, ep.display_name AS displayName, m.sent_at AS ts, ep.id AS tieId
      FROM email_addresses ea
      JOIN email_participants ep ON ep.address_id = ea.id
      JOIN email_messages m ON m.id = ep.message_id
      WHERE ea.person_id IS NULL
      UNION ALL
      SELECT ea.id AS addressId, cep.display_name AS displayName, ce.start_at AS ts, cep.id AS tieId
      FROM email_addresses ea
      JOIN calendar_event_participants cep ON cep.address_id = ea.id
      JOIN calendar_events ce ON ce.id = cep.event_id
      WHERE ea.person_id IS NULL
    ),
    ranked_names AS (
      SELECT addressId, displayName,
             ROW_NUMBER() OVER (PARTITION BY addressId ORDER BY (displayName = '') ASC, ts DESC, tieId DESC) AS rn
      FROM name_candidates
    )
    SELECT
      ea.value AS address,
      COALESCE(mail_agg.messageCount, 0) AS messageCount,
      COALESCE(event_agg.eventCount, 0) AS eventCount,
      mail_agg.lastMessageAt AS lastMessageAt,
      ranked_names.displayName AS displayName
    FROM qualifying q
    JOIN email_addresses ea ON ea.id = q.addressId
    LEFT JOIN mail_agg ON mail_agg.addressId = q.addressId
    LEFT JOIN event_agg ON event_agg.addressId = q.addressId
    LEFT JOIN ranked_names ON ranked_names.addressId = q.addressId AND ranked_names.rn = 1
    ORDER BY messageCount DESC, lastMessageAt DESC, address ASC
  `);

  return rows.map((row) => ({
    address: row.address,
    messageCount: row.messageCount,
    eventCount: row.eventCount,
    displayName: row.displayName === '' ? row.address : row.displayName,
    lastMessageAt: row.lastMessageAt,
  }));
}

export function listSyncRuns(db: AppDb): SyncRunRecord[] {
  return db.select().from(syncRuns).orderBy(desc(syncRuns.ranAt), desc(syncRuns.id)).all();
}

/** The conversation's earliest message's subject, without loading the rest of the thread. */
export function conversationSubject(db: AppDb, conversationId: number): string {
  const [row] = db
    .select({ subject: emailMessages.subject })
    .from(emailMessages)
    .where(eq(emailMessages.conversationId, conversationId))
    .orderBy(asc(emailMessages.sentAt), asc(emailMessages.id))
    .limit(1)
    .all();
  return row?.subject ?? '';
}

export function getConversation(
  db: AppDb,
  conversationId: number,
  options?: { attachments?: 'all' | 'non-inline'; includeOriginalBody?: boolean },
): ConversationDetail | undefined {
  const [conversation] = db
    .select({ id: emailConversations.id })
    .from(emailConversations)
    .where(eq(emailConversations.id, conversationId))
    .limit(1)
    .all();
  if (!conversation) {
    return undefined;
  }

  const messages = db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.conversationId, conversationId))
    .orderBy(asc(emailMessages.sentAt), asc(emailMessages.id))
    .all();

  return {
    id: conversationId,
    subject: messages[0]?.subject ?? '',
    cards: cardsForConversation(db, conversationId),
    messages: messages.map((message) => ({
      id: message.id,
      subject: message.subject,
      sentAt: message.sentAt,
      receivedAt: message.receivedAt,
      bodyText: message.bodyText,
      ...(options?.includeOriginalBody ? { bodyOriginal: message.bodyOriginal, bodyContentType: message.bodyContentType } : {}),
      sourceFolder: message.sourceFolder,
      isRead: message.isRead,
      importance: message.importance,
      flagStatus: message.flagStatus,
      categories: message.categories,
      webLink: message.webLink,
      internetMessageId: message.internetMessageId,
      attachments: attachmentsForMessage(db, message.id, options?.attachments ?? 'all'),
      participants: participantsForMessage(db, message.id),
    })),
  };
}

export interface PersonConversationAddress {
  address: string;
  roles: ('from' | 'to' | 'cc' | 'bcc')[];
}

export interface PersonConversationSummary {
  conversationId: number;
  subject: string;
  latestMessageAt: number;
  addresses: PersonConversationAddress[];
}

/** All conversations involving any of a person's linked addresses, with per-address distinct-role rollups (R8). */
export function conversationsForPerson(db: AppDb, personId: number): PersonConversationSummary[] {
  const rows = db.all<{ conversationId: number; address: string; role: 'from' | 'to' | 'cc' | 'bcc'; sentAt: number }>(sql`
    SELECT DISTINCT m.conversation_id AS conversationId, ea.value AS address, ep.role AS role, m.sent_at AS sentAt
    FROM email_participants ep
    JOIN email_addresses ea ON ea.id = ep.address_id
    JOIN email_messages m ON m.id = ep.message_id
    WHERE ea.person_id = ${personId}
  `);

  const byConversation = new Map<number, { addresses: Map<string, Set<string>> }>();
  for (const row of rows) {
    let entry = byConversation.get(row.conversationId);
    if (!entry) {
      entry = { addresses: new Map() };
      byConversation.set(row.conversationId, entry);
    }
    const roles = entry.addresses.get(row.address) ?? new Set<string>();
    roles.add(row.role);
    entry.addresses.set(row.address, roles);
  }

  return [...byConversation.entries()]
    .map(([conversationId, entry]) => {
      // The conversation's own latest message date (not just the person's own messages within
      // it) — a person can drop off later replies in a long thread while the thread itself stays
      // recent, and the person's row must sort/display by the thread's true recency.
      const [agg] = db.all<{ subject: string; latestMessageAt: number }>(sql`
        SELECT
          (SELECT subject FROM email_messages WHERE conversation_id = ${conversationId} ORDER BY sent_at ASC, id ASC LIMIT 1) AS subject,
          MAX(sent_at) AS latestMessageAt
        FROM email_messages
        WHERE conversation_id = ${conversationId}
      `);
      return {
        conversationId,
        subject: agg?.subject ?? '',
        latestMessageAt: agg?.latestMessageAt ?? 0,
        addresses: [...entry.addresses.entries()].map(([address, roles]) => ({
          address,
          roles: [...roles] as ('from' | 'to' | 'cc' | 'bcc')[],
        })),
      };
    })
    .sort((a, b) => b.latestMessageAt - a.latestMessageAt || b.conversationId - a.conversationId);
}
