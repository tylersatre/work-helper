import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';

let app: FastifyInstance | undefined;
let db: BetterSQLite3Database<typeof schema>;
let client: Client | undefined;
let serverUrl: string;
let stub: StubIdentityProvider | undefined;

function pricingQuestion(): SeedMessage {
  return {
    id: 'msg-pricing-1',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-08-01T10:00:00Z',
    sentDateTime: '2026-08-01T10:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function quoteAttached(): SeedMessage {
  return {
    id: 'msg-quote-1',
    conversationId: 'conv-quote',
    subject: 'Quote attached',
    body: { content: 'See the attached quote.', contentType: 'text' },
    receivedDateTime: '2026-08-02T10:00:00Z',
    sentDateTime: '2026-08-02T10:00:00Z',
    from: { address: 'ana.alvarez@example.com', name: 'Ana Alvarez' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function lunchThursday(): SeedMessage {
  return {
    id: 'msg-lunch-1',
    conversationId: 'conv-lunch',
    subject: 'Lunch Thursday',
    body: { content: 'Thursday at noon?', contentType: 'text' },
    receivedDateTime: '2026-08-03T10:00:00Z',
    sentDateTime: '2026-08-03T10:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function buildTestApp(mailProvider: FakeMailProvider) {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier: createIdentityVerifier(stub!.url), mailProvider });
}

async function listenOnly(): Promise<void> {
  await app!.listen({ port: 0, host: '127.0.0.1' });
  const address = app!.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;
}

async function startAndConnect(): Promise<void> {
  await listenOnly();
  const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub!.mint('tyler') });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
}

async function createTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'create-task', arguments: args });
}

async function linkConversationToTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'link-conversation-to-task', arguments: args });
}

async function unlinkConversationFromTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'unlink-conversation-from-task', arguments: args });
}

async function getTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'get-task', arguments: args });
}

async function getConversation(conversationId: number) {
  return client!.callTool({ name: 'get-conversation', arguments: { conversationId } });
}

async function listConversations(args: Record<string, unknown> = {}) {
  return client!.callTool({ name: 'list-conversations', arguments: args });
}

async function listBoard() {
  return client!.callTool({ name: 'list-board', arguments: {} });
}

async function syncEmails(startDate: string, endDate: string) {
  return client!.callTool({ name: 'sync-emails', arguments: { startDate, endDate } });
}

type ConversationSummary = {
  id: number;
  subject: string;
  participants: { address: string; displayName: string; person: { id: number; name: string } | null }[];
  latestMessageAt: number;
};

async function findConversationBySubject(subject: string): Promise<ConversationSummary> {
  const listed = await listConversations();
  const { conversations } = listed.structuredContent as { conversations: ConversationSummary[] };
  const found = conversations.find((c) => c.subject === subject);
  if (!found) {
    throw new Error(`no synced conversation with subject "${subject}"`);
  }
  return found;
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  if (client) {
    await client.close();
    client = undefined;
  }
  if (app) {
    await app.close();
    app = undefined;
  }
  if (stub) {
    await stub.close();
    stub = undefined;
  }
});

describe('link-conversation-to-task (US1)', () => {
  it('links a conversation to a task: exact text, and structuredContent.conversations carries the detail fields', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');

    const linked = await linkConversationToTask({ taskId, conversationId: pricing.id });

    expect(linked.isError).toBeFalsy();
    expect((linked.content as { text: string }[])[0]?.text).toBe('Linked conversation "Pricing question" to task "Follow up with Sam".');

    const structured = linked.structuredContent as { conversations: ConversationSummary[] };
    expect(structured.conversations).toHaveLength(1);
    expect(structured.conversations[0]).toEqual({
      id: pricing.id,
      subject: 'Pricing question',
      participants: pricing.participants,
      latestMessageAt: pricing.latestMessageAt,
    });
  });

  it('get-task carries the link after linking (FR-004)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');

    const before = await getTask({ taskId });
    expect((before.structuredContent as { conversations: unknown[] }).conversations).toEqual([]);

    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const after = await getTask({ taskId });
    const { conversations } = after.structuredContent as { conversations: ConversationSummary[] };
    expect(conversations.map((c) => c.subject)).toContain('Pricing question');
    expect(conversations.find((c) => c.id === pricing.id)).toEqual({
      id: pricing.id,
      subject: 'Pricing question',
      participants: pricing.participants,
      latestMessageAt: pricing.latestMessageAt,
    });
  });

  it('get-conversation carries the link back to the card, with lane (FR-004)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');

    const before = await getConversation(pricing.id);
    expect((before.structuredContent as { cards: unknown[] }).cards).toEqual([]);

    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const after = await getConversation(pricing.id);
    const { cards } = after.structuredContent as { cards: { id: number; title: string; lane: string }[] };
    expect(cards).toEqual([{ id: taskId, title: 'Follow up with Sam', lane: 'To Do' }]);
  });

  it('is many-to-many: a card lists every linked conversation, and a conversation lists every linked card (US1 AS2)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), quoteAttached(), lunchThursday()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const pricing = await findConversationBySubject('Pricing question');
    const quote = await findConversationBySubject('Quote attached');
    const lunch = await findConversationBySubject('Lunch Thursday');

    // Card side: "Follow up with Sam" linked to two distinct conversations.
    const cardTask = await createTask({ title: 'Follow up with Sam' });
    const cardTaskId = (cardTask.structuredContent as { id: number }).id;
    await linkConversationToTask({ taskId: cardTaskId, conversationId: pricing.id });
    await linkConversationToTask({ taskId: cardTaskId, conversationId: quote.id });

    const cardDetail = await getTask({ taskId: cardTaskId });
    const { conversations: cardConversations } = cardDetail.structuredContent as { conversations: ConversationSummary[] };
    expect(cardConversations.map((c) => c.subject).sort()).toEqual(['Pricing question', 'Quote attached']);

    // Conversation side: "Lunch Thursday" linked to two distinct cards.
    const taskB = await createTask({ title: 'Draft Q3 goals' });
    const taskC = await createTask({ title: 'Renew lease' });
    const taskBId = (taskB.structuredContent as { id: number }).id;
    const taskCId = (taskC.structuredContent as { id: number }).id;
    await linkConversationToTask({ taskId: taskBId, conversationId: lunch.id });
    await linkConversationToTask({ taskId: taskCId, conversationId: lunch.id });

    const conversationDetail = await getConversation(lunch.id);
    const { cards } = conversationDetail.structuredContent as { cards: { id: number; title: string; lane: string }[] };
    expect(cards.map((c) => c.title).sort()).toEqual(['Draft Q3 goals', 'Renew lease']);
    expect(cards).toEqual(
      expect.arrayContaining([
        { id: taskBId, title: 'Draft Q3 goals', lane: 'To Do' },
        { id: taskCId, title: 'Renew lease', lane: 'To Do' },
      ]),
    );
  });

  it('refuses an unauthenticated POST /mcp calling link-conversation-to-task with 401 and WWW-Authenticate', async () => {
    buildTestApp(new FakeMailProvider([]));
    await listenOnly();

    const response = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'link-conversation-to-task', arguments: { taskId: 1, conversationId: 1 } },
      }),
    });

    expect(response.status).toBe(401);
    const wwwAuthenticate = response.headers.get('www-authenticate');
    expect(wwwAuthenticate).toContain('Bearer');
    expect(wwwAuthenticate).toContain(`${serverUrl}/.well-known/oauth-protected-resource`);
  });

  it('refuses an unauthenticated POST /mcp calling unlink-conversation-from-task with 401 and WWW-Authenticate', async () => {
    buildTestApp(new FakeMailProvider([]));
    await listenOnly();

    const response = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'unlink-conversation-from-task', arguments: { taskId: 1, conversationId: 1 } },
      }),
    });

    expect(response.status).toBe(401);
    const wwwAuthenticate = response.headers.get('www-authenticate');
    expect(wwwAuthenticate).toContain('Bearer');
    expect(wwwAuthenticate).toContain(`${serverUrl}/.well-known/oauth-protected-resource`);
  });
});

describe('unlink-conversation-from-task (US3)', () => {
  it('unlinks a conversation from a task: exact text, and structuredContent.conversations no longer carries it', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const unlinked = await unlinkConversationFromTask({ taskId, conversationId: pricing.id });

    expect(unlinked.isError).toBeFalsy();
    expect((unlinked.content as { text: string }[])[0]?.text).toBe('Unlinked conversation "Pricing question" from task "Follow up with Sam".');
    expect((unlinked.structuredContent as { conversations: ConversationSummary[] }).conversations).toEqual([]);
  });

  it('after unlinking both of a card\'s conversations, get-task shows [] and each get-conversation shows cards: []', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), quoteAttached()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    const quote = await findConversationBySubject('Quote attached');
    await linkConversationToTask({ taskId, conversationId: pricing.id });
    await linkConversationToTask({ taskId, conversationId: quote.id });

    await unlinkConversationFromTask({ taskId, conversationId: pricing.id });
    await unlinkConversationFromTask({ taskId, conversationId: quote.id });

    const taskAfter = await getTask({ taskId });
    expect((taskAfter.structuredContent as { conversations: unknown[] }).conversations).toEqual([]);

    const pricingAfter = await getConversation(pricing.id);
    expect((pricingAfter.structuredContent as { cards: unknown[] }).cards).toEqual([]);
    const quoteAfter = await getConversation(quote.id);
    expect((quoteAfter.structuredContent as { cards: unknown[] }).cards).toEqual([]);
  });
});

describe('error discipline (US4)', () => {
  it('duplicate link fails with the exact contract message and leaves stored links unchanged (FR-005, SC-003)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const duplicate = await linkConversationToTask({ taskId, conversationId: pricing.id });

    expect(duplicate.isError).toBe(true);
    expect((duplicate.content as { text: string }[])[0]?.text).toBe(`Task ${taskId} is already linked to conversation ${pricing.id}`);

    const after = await getTask({ taskId });
    expect((after.structuredContent as { conversations: ConversationSummary[] }).conversations).toHaveLength(1);
  });

  it('link with a nonexistent task id fails "Task N not found" (FR-006) and leaves links unchanged', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const missing = await linkConversationToTask({ taskId: 999, conversationId: pricing.id });

    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toBe('Task 999 not found');

    const after = await getTask({ taskId });
    expect((after.structuredContent as { conversations: ConversationSummary[] }).conversations).toHaveLength(1);
  });

  it('link with a nonexistent conversation id fails "Conversation N not found" and leaves links unchanged', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const missing = await linkConversationToTask({ taskId, conversationId: 999 });

    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toBe('Conversation 999 not found');

    const after = await getTask({ taskId });
    expect((after.structuredContent as { conversations: ConversationSummary[] }).conversations).toHaveLength(1);
  });

  it('unlink with a nonexistent task id fails "Task N not found" and leaves links unchanged', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const missing = await unlinkConversationFromTask({ taskId: 999, conversationId: pricing.id });

    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toBe('Task 999 not found');

    const after = await getTask({ taskId });
    expect((after.structuredContent as { conversations: ConversationSummary[] }).conversations).toHaveLength(1);
  });

  it('unlink with a nonexistent conversation id fails "Conversation N not found" and leaves links unchanged', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const missing = await unlinkConversationFromTask({ taskId, conversationId: 999 });

    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toBe('Conversation 999 not found');

    const after = await getTask({ taskId });
    expect((after.structuredContent as { conversations: ConversationSummary[] }).conversations).toHaveLength(1);
  });

  it('unlinking a pair that is not linked fails with the exact contract message and leaves links unchanged', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), quoteAttached()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');

    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    const pricing = await findConversationBySubject('Pricing question');
    const quote = await findConversationBySubject('Quote attached');
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const notLinked = await unlinkConversationFromTask({ taskId, conversationId: quote.id });

    expect(notLinked.isError).toBe(true);
    expect((notLinked.content as { text: string }[])[0]?.text).toBe(`Task ${taskId} is not linked to conversation ${quote.id}`);

    const after = await getTask({ taskId });
    expect((after.structuredContent as { conversations: ConversationSummary[] }).conversations).toHaveLength(1);
  });
});

describe('create-task then link-conversation-to-task (US5)', () => {
  it('composes into a card in the "To Do" lane with the conversation linked both ways', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');
    const pricing = await findConversationBySubject('Pricing question');

    const task = await createTask({ title: 'Send Sam the quote' });
    const taskId = (task.structuredContent as { id: number }).id;
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const board = await listBoard();
    const { lanes } = board.structuredContent as { lanes: { name: string; tasks: { id: number; lane: string }[] }[] };
    const todoLane = lanes.find((lane) => lane.name === 'To Do')!;
    expect(todoLane.tasks.some((t) => t.id === taskId && t.lane === 'To Do')).toBe(true);

    const taskDetail = await getTask({ taskId });
    expect((taskDetail.structuredContent as { conversations: ConversationSummary[] }).conversations.map((c) => c.id)).toEqual([pricing.id]);

    const conversationDetail = await getConversation(pricing.id);
    expect((conversationDetail.structuredContent as { cards: { id: number; lane: string }[] }).cards).toEqual([
      { id: taskId, title: 'Send Sam the quote', lane: 'To Do' },
    ]);
  });
});

describe('list surfaces stay unchanged (FR-013)', () => {
  it('list-board carries no link/conversation data even with links present', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');
    const pricing = await findConversationBySubject('Pricing question');
    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const board = await listBoard();
    const { lanes } = board.structuredContent as { lanes: { tasks: Record<string, unknown>[] }[] };
    const linkedTask = lanes.flatMap((lane) => lane.tasks).find((t) => t.id === taskId)!;
    expect(Object.keys(linkedTask).sort()).toEqual(
      ['archived', 'createdAt', 'id', 'lane', 'position', 'title', 'dueDate', 'priority', 'effort', 'description'].sort(),
    );
  });

  it('list-conversations carries no card/link data even with links present', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-08-01', '2026-08-10');
    const pricing = await findConversationBySubject('Pricing question');
    const task = await createTask({ title: 'Follow up with Sam' });
    const taskId = (task.structuredContent as { id: number }).id;
    await linkConversationToTask({ taskId, conversationId: pricing.id });

    const listed = await listConversations();
    const { conversations } = listed.structuredContent as { conversations: Record<string, unknown>[] };
    const linkedConversation = conversations.find((c) => c.id === pricing.id)!;
    expect(Object.keys(linkedConversation).sort()).toEqual(
      ['hasAttachments', 'hasDraft', 'hasUnread', 'id', 'latestMessageAt', 'messageCount', 'participants', 'subject'].sort(),
    );
  });
});
