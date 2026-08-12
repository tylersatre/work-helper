import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailConversations, emailMessages, taskConversations, tasks } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { getConversation } from '../../src/server/services/email/queries.js';
import { computeSyncWindow, runSync } from '../../src/server/services/email/sync.js';
import { getTaskDetail } from '../../src/server/services/tasks.js';
import {
  cardsForConversation,
  conversationsForTask,
  linkConversationToTask,
  unlinkConversationFromTask,
} from '../../src/server/services/task-conversations.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

const dirsToClean: string[] = [];

afterEach(() => {
  while (dirsToClean.length > 0) {
    const dir = dirsToClean.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function buildTestApp(dbPath = ':memory:'): { app: FastifyInstance; db: AppDb } {
  const { db } = createDb(dbPath);
  const app = buildApp({ db, lanes: LANES });
  return { app, db };
}

async function createTask(app: FastifyInstance, title: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

async function createPerson(app: FastifyInstance, payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

/** Syncs the given seed messages (all sharing one graph conversation id) through the real sync
 * path, then resolves and returns the resulting local `email_conversations.id`. */
async function seedConversation(db: AppDb, messages: SeedMessage[], startDate: string, endDate: string): Promise<number> {
  await runSync(db, new FakeMailProvider(messages), computeSyncWindow(startDate, endDate));
  const graphConversationId = messages[0]!.conversationId;
  const [row] = db
    .select({ id: emailConversations.id })
    .from(emailConversations)
    .where(eq(emailConversations.graphConversationId, graphConversationId))
    .limit(1)
    .all();
  if (!row) {
    throw new Error(`conversation ${graphConversationId} not found after sync`);
  }
  return row.id;
}

function pricingQuestion(): SeedMessage {
  return {
    id: 'msg-pricing-1',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-07-10T18:00:00Z',
    sentDateTime: '2026-07-10T18:00:00Z',
    from: { address: 'sam.rivera@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [{ address: 'ana.alvarez@example.com' }],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function pricingReply(): SeedMessage {
  return {
    id: 'msg-pricing-2',
    conversationId: 'conv-pricing',
    subject: 'Re: Pricing question',
    body: { content: 'Here it is.', contentType: 'text' },
    receivedDateTime: '2026-07-11T15:00:00Z',
    sentDateTime: '2026-07-11T15:00:00Z',
    from: { address: 'tyler@example.com' },
    toRecipients: [{ address: 'sam.rivera@example.com' }],
    ccRecipients: [],
    bccRecipients: [{ address: 'ana.alvarez@example.com' }],
    folder: 'sent',
  };
}

function lunchThursday(): SeedMessage {
  return {
    id: 'msg-lunch-1',
    conversationId: 'conv-lunch',
    subject: 'Lunch Thursday',
    body: { content: 'Thursday at noon?', contentType: 'text' },
    receivedDateTime: '2026-07-20T18:00:00Z',
    sentDateTime: '2026-07-20T18:00:00Z',
    from: { address: 'sam.rivera@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

describe('linkConversationToTask', () => {
  it('inserts one task_conversations row and returns { ok: true }, visible via conversationsForTask', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');

    const result = linkConversationToTask(db, task.id, conversationId);

    expect(result).toEqual({ ok: true });
    const conversations = conversationsForTask(db, task.id);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ id: conversationId, subject: 'Pricing question' });

    const rows = db.select().from(taskConversations).where(eq(taskConversations.taskId, task.id)).all();
    expect(rows).toEqual([{ taskId: task.id, conversationId }]);
  });

  it('returns task-not-found for a missing task, conversation-not-found for a missing conversation, and already-linked for a duplicate pair', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');

    expect(linkConversationToTask(db, 999, conversationId)).toEqual({ ok: false, error: 'task-not-found' });
    expect(linkConversationToTask(db, task.id, 999)).toEqual({ ok: false, error: 'conversation-not-found' });

    const first = linkConversationToTask(db, task.id, conversationId);
    expect(first.ok).toBe(true);
    expect(linkConversationToTask(db, task.id, conversationId)).toEqual({ ok: false, error: 'already-linked' });

    const rows = db.select().from(taskConversations).where(eq(taskConversations.taskId, task.id)).all();
    expect(rows).toHaveLength(1);
  });
});

describe('unlinkConversationFromTask', () => {
  it('deletes exactly one join row and returns { ok: true }, no longer visible via conversationsForTask', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');
    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const result = unlinkConversationFromTask(db, task.id, conversationId);

    expect(result).toEqual({ ok: true });
    expect(conversationsForTask(db, task.id)).toEqual([]);

    const rows = db.select().from(taskConversations).where(eq(taskConversations.taskId, task.id)).all();
    expect(rows).toEqual([]);
  });

  it("leaves the card, the conversation, and all its messages unchanged (SC-004, FR-012), and the pair can be re-linked", async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');
    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const tasksBefore = db.select().from(tasks).all();
    const messagesBefore = db.select().from(emailMessages).where(eq(emailMessages.conversationId, conversationId)).all();

    expect(unlinkConversationFromTask(db, task.id, conversationId).ok).toBe(true);

    expect(db.select().from(tasks).all()).toEqual(tasksBefore);
    expect(db.select().from(emailMessages).where(eq(emailMessages.conversationId, conversationId)).all()).toEqual(messagesBefore);

    const relinked = linkConversationToTask(db, task.id, conversationId);
    expect(relinked).toEqual({ ok: true });
    expect(conversationsForTask(db, task.id)).toHaveLength(1);
  });

  it('returns task-not-found for a missing task, conversation-not-found for a missing conversation, and link-not-found for a not-linked pair', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');

    expect(unlinkConversationFromTask(db, 999, conversationId)).toEqual({ ok: false, error: 'task-not-found' });
    expect(unlinkConversationFromTask(db, task.id, 999)).toEqual({ ok: false, error: 'conversation-not-found' });
    expect(unlinkConversationFromTask(db, task.id, conversationId)).toEqual({ ok: false, error: 'link-not-found' });
  });
});

describe('conversationsForTask', () => {
  it('returns both linked conversations with earliest-message subject, deduped-by-address participants, MAX(sentAt) latestMessageAt, ordered latestMessageAt DESC, id DESC', async () => {
    const { app, db } = buildTestApp();
    const sam = await createPerson(app, { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    const task = await createTask(app, 'Follow up with Sam');

    const pricingId = await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');
    const lunchId = await seedConversation(db, [lunchThursday()], '2026-07-01', '2026-07-31');

    expect(linkConversationToTask(db, task.id, pricingId).ok).toBe(true);
    expect(linkConversationToTask(db, task.id, lunchId).ok).toBe(true);

    const result = conversationsForTask(db, task.id);

    // Ordered latestMessageAt DESC, id DESC: lunch's single message is later than pricing's latest reply.
    expect(result.map((c) => c.id)).toEqual([lunchId, pricingId]);

    const pricing = result.find((c) => c.id === pricingId)!;
    // Earliest message's subject ('Pricing question'), not the latest reply's ('Re: Pricing question').
    expect(pricing.subject).toBe('Pricing question');
    expect(pricing.latestMessageAt).toBe(Date.parse('2026-07-11T15:00:00Z'));
    expect(pricing.participants).toHaveLength(3);
    expect(pricing.participants).toContainEqual({ address: 'sam.rivera@example.com', displayName: '', person: { id: sam, name: 'Sam Rivera' } });
    expect(pricing.participants).toContainEqual({ address: 'tyler@example.com', displayName: '', person: null });
    expect(pricing.participants).toContainEqual({ address: 'ana.alvarez@example.com', displayName: '', person: null });

    const lunch = result.find((c) => c.id === lunchId)!;
    expect(lunch.subject).toBe('Lunch Thursday');
    expect(lunch.latestMessageAt).toBe(Date.parse('2026-07-20T18:00:00Z'));
    expect(lunch.participants).toContainEqual({ address: 'sam.rivera@example.com', displayName: '', person: { id: sam, name: 'Sam Rivera' } });
  });

  it('returns [] for a task with no linked conversations', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'No links here');

    expect(conversationsForTask(db, task.id)).toEqual([]);
  });
});

describe('cardsForConversation', () => {
  it('returns exactly the linked cards, ordered by title COLLATE NOCASE', async () => {
    const { app, db } = buildTestApp();
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');

    const zephyr = await createTask(app, 'Zephyr onboarding');
    const alpha = await createTask(app, 'alpha rollout');
    const beta = await createTask(app, 'Beta launch');
    await createTask(app, 'Unrelated card');

    expect(linkConversationToTask(db, zephyr.id, conversationId).ok).toBe(true);
    expect(linkConversationToTask(db, alpha.id, conversationId).ok).toBe(true);
    expect(linkConversationToTask(db, beta.id, conversationId).ok).toBe(true);

    const result = cardsForConversation(db, conversationId);

    // Case-sensitive ordering would give "Beta launch", "Zephyr onboarding", "alpha rollout".
    // NOCASE ordering gives alpha, Beta, Zephyr.
    expect(result).toEqual([
      { id: alpha.id, title: 'alpha rollout', lane: 'To Do' },
      { id: beta.id, title: 'Beta launch', lane: 'To Do' },
      { id: zephyr.id, title: 'Zephyr onboarding', lane: 'To Do' },
    ]);
  });

  it('returns [] for a conversation with no linked cards', async () => {
    const { db } = buildTestApp();
    const conversationId = await seedConversation(db, [lunchThursday()], '2026-07-01', '2026-07-31');

    expect(cardsForConversation(db, conversationId)).toEqual([]);
  });
});

describe('getTaskDetail conversations field', () => {
  it('matches conversationsForTask output for a linked task, and is [] for an unlinked task', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const unlinkedTask = await createTask(app, 'No links here');
    const conversationId = await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');

    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const detail = getTaskDetail(db, task.id)!;
    expect(detail.conversations).toEqual(conversationsForTask(db, task.id));
    expect(detail.conversations).toHaveLength(1);
    expect(detail.conversations[0]).toMatchObject({ id: conversationId, subject: 'Pricing question' });

    const unlinkedDetail = getTaskDetail(db, unlinkedTask.id)!;
    expect(unlinkedDetail.conversations).toEqual([]);
  });
});

describe('getConversation cards field', () => {
  it('matches cardsForConversation output for a linked conversation, and is [] for an unlinked conversation', async () => {
    const { app, db } = buildTestApp();
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');
    const unlinkedConversationId = await seedConversation(db, [lunchThursday()], '2026-07-01', '2026-07-31');
    const task = await createTask(app, 'Follow up with Sam');

    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const detail = getConversation(db, conversationId)!;
    expect(detail.cards).toEqual(cardsForConversation(db, conversationId));
    expect(detail.cards).toHaveLength(1);
    expect(detail.cards[0]).toEqual({ id: task.id, title: 'Follow up with Sam', lane: 'To Do' });

    const unlinkedDetail = getConversation(db, unlinkedConversationId)!;
    expect(unlinkedDetail.cards).toEqual([]);
  });
});

describe('GET /api/tasks/:id', () => {
  it('includes a conversations field with the right shape, and [] when unlinked', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const before = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(before.statusCode).toBe(200);
    expect(before.json().conversations).toEqual([]);

    const conversationId = await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');
    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const after = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().conversations).toEqual([
      {
        id: conversationId,
        subject: 'Pricing question',
        latestMessageAt: Date.parse('2026-07-11T15:00:00Z'),
        participants: expect.arrayContaining([
          { address: 'sam.rivera@example.com', displayName: '', person: null },
          { address: 'tyler@example.com', displayName: '', person: null },
          { address: 'ana.alvarez@example.com', displayName: '', person: null },
        ]),
      },
    ]);
  });
});

describe('GET /api/emails/conversations/:id', () => {
  it('includes a cards field with the right shape, and [] when unlinked', async () => {
    const { app, db } = buildTestApp();
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');

    const before = await app.inject({ method: 'GET', url: `/api/emails/conversations/${conversationId}` });
    expect(before.statusCode).toBe(200);
    expect(before.json().cards).toEqual([]);

    const task = await createTask(app, 'Follow up with Sam');
    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const after = await app.inject({ method: 'GET', url: `/api/emails/conversations/${conversationId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().cards).toEqual([{ id: task.id, title: 'Follow up with Sam', lane: 'To Do' }]);
  });
});

describe('edge cases', () => {
  it('deleting a card with links cascades away only its task_conversations rows; the conversation and its messages survive (spec edge case)', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');
    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const messagesBefore = db.select().from(emailMessages).where(eq(emailMessages.conversationId, conversationId)).all();

    db.delete(tasks).where(eq(tasks.id, task.id)).run();

    expect(db.select().from(taskConversations).where(eq(taskConversations.taskId, task.id)).all()).toEqual([]);
    const conversationRow = db.select().from(emailConversations).where(eq(emailConversations.id, conversationId)).all();
    expect(conversationRow).toHaveLength(1);
    expect(db.select().from(emailMessages).where(eq(emailMessages.conversationId, conversationId)).all()).toEqual(messagesBefore);
  });

  it('a newly synced reply into a linked conversation is reflected in conversationsForTask.latestMessageAt, and the link survives (spec edge case)', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(db, [pricingQuestion()], '2026-07-01', '2026-07-31');
    expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);

    const before = conversationsForTask(db, task.id);
    expect(before[0]!.latestMessageAt).toBe(Date.parse('2026-07-10T18:00:00Z'));

    await seedConversation(db, [pricingQuestion(), pricingReply()], '2026-07-01', '2026-07-31');

    const after = conversationsForTask(db, task.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(conversationId);
    expect(after[0]!.latestMessageAt).toBe(Date.parse('2026-07-11T15:00:00Z'));
  });

  it('a card linked to 5+ conversations, and a conversation linked to 5+ cards, each return every entry (FR-015, no truncation)', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Hub card');
    for (let i = 0; i < 6; i += 1) {
      const conversationId = await seedConversation(
        db,
        [
          {
            id: `msg-hub-${i}`,
            conversationId: `conv-hub-${i}`,
            subject: `Hub thread ${i}`,
            body: { content: 'hi', contentType: 'text' },
            receivedDateTime: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
            sentDateTime: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
            from: { address: 'sam.rivera@example.com' },
            toRecipients: [{ address: 'tyler@example.com' }],
            ccRecipients: [],
            bccRecipients: [],
            folder: 'inbox',
          },
        ],
        '2026-07-01',
        '2026-07-31',
      );
      expect(linkConversationToTask(db, task.id, conversationId).ok).toBe(true);
    }
    expect(conversationsForTask(db, task.id)).toHaveLength(6);

    const hubConversationId = await seedConversation(db, [lunchThursday()], '2026-07-01', '2026-07-31');
    for (let i = 0; i < 6; i += 1) {
      const hubTask = await createTask(app, `Hub task ${i}`);
      expect(linkConversationToTask(db, hubTask.id, hubConversationId).ok).toBe(true);
    }
    expect(cardsForConversation(db, hubConversationId)).toHaveLength(6);
  });
});

describe('FR-011: links survive re-querying on a reopened DB', () => {
  it('persists a task-conversation link across a db close and reopen against the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'work-helper-task-conversation-links-'));
    dirsToClean.push(dir);
    const dbPath = join(dir, 'work-helper.db');

    const opened = createDb(dbPath);
    const app = buildApp({ db: opened.db, lanes: LANES });
    const task = await createTask(app, 'Follow up with Sam');
    const conversationId = await seedConversation(opened.db, [pricingQuestion()], '2026-07-01', '2026-07-31');

    const linkResult = linkConversationToTask(opened.db, task.id, conversationId);
    expect(linkResult.ok).toBe(true);

    await app.close();
    opened.sqlite.close();

    const reopened = createDb(dbPath);
    try {
      const detail = getTaskDetail(reopened.db, task.id)!;
      expect(detail.conversations).toHaveLength(1);
      expect(detail.conversations[0]).toMatchObject({ id: conversationId, subject: 'Pricing question' });

      const conversationDetail = getConversation(reopened.db, conversationId)!;
      expect(conversationDetail.cards).toEqual([{ id: task.id, title: 'Follow up with Sam', lane: 'To Do' }]);
    } finally {
      reopened.sqlite.close();
    }
  });
});
