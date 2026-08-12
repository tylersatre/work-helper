import { and, asc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { LinkedCardSummary, LinkedConversationSummary } from '../../shared/types.js';
import { emailConversations, tasks, taskConversations } from '../db/schema.js';
import { participantsForConversation } from './email/queries.js';
import { getTaskDetail } from './tasks.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

function taskExists(db: AppDb, id: number): boolean {
  const [row] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1).all();
  return row !== undefined;
}

function conversationExists(db: AppDb, id: number): boolean {
  const [row] = db.select({ id: emailConversations.id }).from(emailConversations).where(eq(emailConversations.id, id)).limit(1).all();
  return row !== undefined;
}

function linkExists(db: AppDb, taskId: number, conversationId: number): boolean {
  const [row] = db
    .select({ taskId: taskConversations.taskId })
    .from(taskConversations)
    .where(and(eq(taskConversations.taskId, taskId), eq(taskConversations.conversationId, conversationId)))
    .limit(1)
    .all();
  return row !== undefined;
}

export function conversationsForTask(db: AppDb, taskId: number): LinkedConversationSummary[] {
  const rows = db.all<{ id: number; subject: string | null; latestMessageAt: number | null }>(sql`
    SELECT ec.id AS id,
           (SELECT subject FROM email_messages WHERE conversation_id = ec.id ORDER BY sent_at ASC, id ASC LIMIT 1) AS subject,
           (SELECT MAX(sent_at) FROM email_messages WHERE conversation_id = ec.id) AS latestMessageAt
    FROM task_conversations tc
    JOIN email_conversations ec ON ec.id = tc.conversation_id
    WHERE tc.task_id = ${taskId}
    ORDER BY latestMessageAt DESC, ec.id DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject ?? '',
    latestMessageAt: row.latestMessageAt ?? 0,
    participants: participantsForConversation(db, row.id),
  }));
}

export function cardsForConversation(db: AppDb, conversationId: number): LinkedCardSummary[] {
  return db
    .select({ id: tasks.id, title: tasks.title, lane: tasks.lane })
    .from(taskConversations)
    .innerJoin(tasks, eq(taskConversations.taskId, tasks.id))
    .where(eq(taskConversations.conversationId, conversationId))
    .orderBy(asc(sql`${tasks.title} COLLATE NOCASE`))
    .all();
}

export type LinkConversationResult =
  | { ok: true; task: NonNullable<ReturnType<typeof getTaskDetail>> }
  | { ok: false; error: 'task-not-found' | 'conversation-not-found' | 'already-linked' };

export function linkConversationToTask(db: AppDb, taskId: number, conversationId: number): LinkConversationResult {
  if (!taskExists(db, taskId)) {
    return { ok: false, error: 'task-not-found' };
  }
  if (!conversationExists(db, conversationId)) {
    return { ok: false, error: 'conversation-not-found' };
  }
  if (linkExists(db, taskId, conversationId)) {
    return { ok: false, error: 'already-linked' };
  }

  db.insert(taskConversations).values({ taskId, conversationId }).run();

  return { ok: true, task: getTaskDetail(db, taskId)! };
}

export type UnlinkConversationResult =
  | { ok: true; task: NonNullable<ReturnType<typeof getTaskDetail>> }
  | { ok: false; error: 'task-not-found' | 'conversation-not-found' | 'link-not-found' };

export function unlinkConversationFromTask(db: AppDb, taskId: number, conversationId: number): UnlinkConversationResult {
  if (!taskExists(db, taskId)) {
    return { ok: false, error: 'task-not-found' };
  }
  if (!conversationExists(db, conversationId)) {
    return { ok: false, error: 'conversation-not-found' };
  }
  if (!linkExists(db, taskId, conversationId)) {
    return { ok: false, error: 'link-not-found' };
  }

  db.delete(taskConversations)
    .where(and(eq(taskConversations.taskId, taskId), eq(taskConversations.conversationId, conversationId)))
    .run();

  return { ok: true, task: getTaskDetail(db, taskId)! };
}
