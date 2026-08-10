import { asc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailAddresses, emailConversations, emailMessages, emailParticipants, people } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';

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

export interface ConversationSummary {
  id: number;
  subject: string;
  messageCount: number;
  latestMessageAt: number;
}

export interface ConversationsPage {
  conversations: ConversationSummary[];
  nextCursor: string | null;
}

export function listConversations(db: AppDb, params: { limit: number; cursor?: string }): ConversationsPage {
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  const cursorCondition = cursor
    ? sql`AND (agg.latestMessageAt < ${cursor.primary} OR (agg.latestMessageAt = ${cursor.primary} AND agg.id < ${cursor.id}))`
    : sql``;

  const rows = db.all<ConversationSummary>(sql`
    WITH agg AS (
      SELECT conversation_id AS id, COUNT(*) AS messageCount, MAX(sent_at) AS latestMessageAt
      FROM email_messages
      GROUP BY conversation_id
    ),
    earliest AS (
      SELECT conversation_id, subject,
             ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY sent_at ASC, id ASC) AS rn
      FROM email_messages
    )
    SELECT agg.id AS id, earliest.subject AS subject, agg.messageCount AS messageCount, agg.latestMessageAt AS latestMessageAt
    FROM agg
    JOIN earliest ON earliest.conversation_id = agg.id AND earliest.rn = 1
    WHERE 1 = 1 ${cursorCondition}
    ORDER BY agg.latestMessageAt DESC, agg.id DESC
    LIMIT ${params.limit + 1}
  `);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ primary: last.latestMessageAt, id: last.id }) : null;

  return { conversations: page, nextCursor };
}

export interface ConversationParticipant {
  address: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
  person: { id: number; name: string } | null;
}

export interface ConversationMessage {
  id: number;
  subject: string;
  sentAt: number;
  bodyText: string;
  sourceFolder: string;
  participants: ConversationParticipant[];
}

export interface ConversationDetail {
  id: number;
  subject: string;
  messages: ConversationMessage[];
}

export interface PersonEmailAddressRole {
  address: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
}

export interface PersonEmail {
  messageId: number;
  conversationId: number;
  subject: string;
  sentAt: number;
  addresses: PersonEmailAddressRole[];
}

export interface PersonEmailsPage {
  emails: PersonEmail[];
  nextCursor: string | null;
}

export function emailsForPerson(db: AppDb, personId: number, params: { limit: number; cursor?: string }): PersonEmailsPage {
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  const cursorCondition = cursor
    ? sql`AND (m.sent_at < ${cursor.primary} OR (m.sent_at = ${cursor.primary} AND m.id < ${cursor.id}))`
    : sql``;

  const rows = db.all<{ id: number; conversationId: number; subject: string; sentAt: number }>(sql`
    SELECT DISTINCT m.id AS id, m.conversation_id AS conversationId, m.subject AS subject, m.sent_at AS sentAt
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
    const addresses = db.all<PersonEmailAddressRole>(sql`
      SELECT ea.value AS address, ep.role AS role
      FROM email_participants ep
      JOIN email_addresses ea ON ea.id = ep.address_id
      WHERE ep.message_id = ${row.id} AND ea.person_id = ${personId}
    `);
    return { messageId: row.id, conversationId: row.conversationId, subject: row.subject, sentAt: row.sentAt, addresses };
  });

  return { emails, nextCursor };
}

function participantsForMessage(db: AppDb, messageId: number): ConversationParticipant[] {
  const rows = db
    .select({
      role: emailParticipants.role,
      address: emailAddresses.value,
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
    role: row.role,
    person: row.personId != null ? { id: row.personId, name: `${row.firstName} ${row.lastName}` } : null,
  }));
}

export function getConversation(db: AppDb, conversationId: number): ConversationDetail | undefined {
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
    messages: messages.map((message) => ({
      id: message.id,
      subject: message.subject,
      sentAt: message.sentAt,
      bodyText: message.bodyText,
      sourceFolder: message.sourceFolder,
      participants: participantsForMessage(db, message.id),
    })),
  };
}
