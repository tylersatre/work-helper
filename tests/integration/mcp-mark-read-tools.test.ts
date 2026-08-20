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
import { FakeMailProvider, type FakeMailProviderOptions, type SeedMessage } from './helpers/fake-mail-provider.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';
const SYNC_START = '2026-08-01';
const SYNC_END = '2026-08-08';

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client | undefined;
let serverUrl: string;
let stub: StubIdentityProvider;
let mailProvider: FakeMailProvider;

// --- Fixtures (spec's named conversations) ---

function quoteAttached(): SeedMessage {
  return {
    id: 'msg-quote-1',
    conversationId: 'conv-quote',
    subject: 'Quote attached',
    body: { content: 'See the attached quote.', contentType: 'text' },
    receivedDateTime: '2026-08-06T09:01:00Z',
    sentDateTime: '2026-08-06T09:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    isRead: false,
    flagStatus: 'flagged',
    categories: ['Orange category'],
  };
}

function pricingQuestion(): SeedMessage {
  return {
    id: 'msg-pricing-question',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-08-04T10:00:00Z',
    sentDateTime: '2026-08-04T10:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    isRead: false,
  };
}

function pricingReply(): SeedMessage {
  return {
    id: 'msg-pricing-reply',
    conversationId: 'conv-pricing',
    subject: 'Re: Pricing question',
    body: { content: 'Here it is.', contentType: 'text' },
    receivedDateTime: '2026-08-05T10:00:00Z',
    sentDateTime: '2026-08-05T10:00:00Z',
    from: { address: 'tyler@example.com', name: 'Tyler Satre' },
    toRecipients: [{ address: 'sam.rivera@example.com', name: 'Sam Rivera' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'sent',
    isRead: true,
  };
}

function pricingFollowUp(): SeedMessage {
  return {
    id: 'msg-pricing-followup',
    conversationId: 'conv-pricing',
    subject: 'Re: Pricing question',
    body: { content: 'Any update on this?', contentType: 'text' },
    receivedDateTime: '2026-08-06T10:00:00Z',
    sentDateTime: '2026-08-06T10:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    isRead: false,
  };
}

function lunchThursday(): SeedMessage {
  return {
    id: 'msg-lunch-1',
    conversationId: 'conv-lunch',
    subject: 'Lunch Thursday',
    body: { content: 'Thursday at noon?', contentType: 'text' },
    receivedDateTime: '2026-08-06T11:00:00Z',
    sentDateTime: '2026-08-06T11:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    isRead: false,
  };
}

const ALL_SEEDS = [quoteAttached(), pricingQuestion(), pricingReply(), pricingFollowUp(), lunchThursday()];

// --- Harness ---

function buildTestApp(options: FakeMailProviderOptions = {}) {
  mailProvider = new FakeMailProvider(ALL_SEEDS, options);
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier: createIdentityVerifier(stub.url), mailProvider });
}

/** No mailProvider configured at all — the not-connected branch of FR-008 (research R5). */
function buildTestAppWithoutMailProvider() {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier: createIdentityVerifier(stub.url) });
}

async function listenOnly(): Promise<void> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;
}

async function startAndConnect(): Promise<void> {
  await listenOnly();
  const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub.mint('tyler') });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
}

/** Syncs the full fixture window so every named conversation above is in the store. */
async function syncAll() {
  return client!.callTool({ name: 'sync-emails', arguments: { startDate: SYNC_START, endDate: SYNC_END } });
}

async function setEmailReadState(messageIds: number[], state: string) {
  return client!.callTool({ name: 'set-email-read-state', arguments: { messageIds, state } });
}

async function listConversations() {
  return client!.callTool({ name: 'list-conversations', arguments: {} });
}

async function getConversation(conversationId: number) {
  return client!.callTool({ name: 'get-conversation', arguments: { conversationId } });
}

async function conversationIdBySubject(subject: string): Promise<number> {
  const result = await listConversations();
  const { conversations } = result.structuredContent as { conversations: { id: number; subject: string }[] };
  const match = conversations.find((c) => c.subject === subject);
  if (!match) throw new Error(`No synced conversation with subject "${subject}"`);
  return match.id;
}

/** Looks up a message's internal (store) id within a synced conversation by its unique seeded body text. */
async function messageIdByBody(conversationId: number, bodyText: string): Promise<number> {
  const result = await getConversation(conversationId);
  const { messages } = result.structuredContent as { messages: { id: number; bodyText: string }[] };
  const match = messages.find((m) => m.bodyText === bodyText);
  if (!match) throw new Error(`No message with body "${bodyText}" in conversation ${conversationId}`);
  return match.id;
}

async function restConversations(): Promise<{ conversations: { id: number; subject: string; hasUnread: boolean }[] }> {
  const response = await app.inject({ method: 'GET', url: '/api/emails/conversations' });
  return response.json();
}

async function restConversation(conversationId: number): Promise<{ messages: { id: number; isRead: boolean }[] }> {
  const response = await app.inject({ method: 'GET', url: `/api/emails/conversations/${conversationId}` });
  return response.json();
}

async function syncRunCount(): Promise<number> {
  const response = await app.inject({ method: 'GET', url: '/api/email-sync/runs' });
  const { runs } = response.json() as { runs: unknown[] };
  return runs.length;
}

async function createTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'create-task', arguments: args });
}

async function linkConversationToTask(taskId: number, conversationId: number) {
  return client!.callTool({ name: 'link-conversation-to-task', arguments: { taskId, conversationId } });
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  if (client) {
    await client.close();
    client = undefined;
  }
  await app.close();
  await stub.close();
});

describe('set-email-read-state harness', () => {
  it('connects and syncs the fixture conversations (scaffold smoke test)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await syncAll();
    expect(result.isError).toBeFalsy();

    const { conversations } = (await listConversations()).structuredContent as { conversations: { subject: string }[] };
    expect(conversations.map((c) => c.subject).sort()).toEqual(['Lunch Thursday', 'Pricing question', 'Quote attached']);
  });
});

describe('US1: agent marks a message read, mailbox and work-helper agree instantly', () => {
  it('leaves read state untouched by fetching/linking, then marks read everywhere with nothing else changed (AS1)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');

    // FR-010 negative clause: fetching and linking never change read state.
    await getConversation(conversationId);
    await restConversation(conversationId);
    const { id: taskId } = (await createTask({ title: 'Follow up on quote' })).structuredContent as { id: number };
    await linkConversationToTask(taskId, conversationId);

    expect(mailProvider.readStateOf('msg-quote-1')).toBe(false);
    expect(mailProvider.recordedWrites).toEqual([]);
    const beforeConversation = (await getConversation(conversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(beforeConversation.messages[0]!.isRead).toBe(false);

    const runsBefore = await syncRunCount();
    const result = await setEmailReadState([messageId], 'read');

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      state: 'read',
      outcomes: [{ messageId, status: 'marked' }],
      markedCount: 1,
      alreadyCount: 0,
      notFoundCount: 0,
      failedCount: 0,
    });
    expect(JSON.stringify(result.content)).toMatch(/Marked 1 message read\./);

    expect(mailProvider.readStateOf('msg-quote-1')).toBe(true);

    const afterConversation = (await getConversation(conversationId)).structuredContent as {
      messages: { isRead: boolean; flagStatus: string; categories: string[]; sourceFolder: string; subject: string; bodyText: string }[];
    };
    const message = afterConversation.messages[0]!;
    expect(message.isRead).toBe(true);
    expect(message.flagStatus).toBe('flagged');
    expect(message.categories).toEqual(['Orange category']);
    expect(message.sourceFolder).toBe('Inbox');
    expect(message.subject).toBe('Quote attached');
    expect(message.bodyText).toBe('See the attached quote.');

    const { conversations: mcpConversations } = (await listConversations()).structuredContent as {
      conversations: { subject: string; hasUnread: boolean }[];
    };
    expect(mcpConversations.find((c) => c.subject === 'Quote attached')!.hasUnread).toBe(false);

    const { conversations: restConversationsList } = await restConversations();
    expect(restConversationsList.find((c) => c.subject === 'Quote attached')!.hasUnread).toBe(false);

    expect(await syncRunCount()).toBe(runsBefore);
  });

  it('a duplicate call reports already-in-state and touches nothing (AS2)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');
    await setEmailReadState([messageId], 'read');
    expect(mailProvider.recordedWrites).toHaveLength(1);

    const result = await setEmailReadState([messageId], 'read');

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      state: 'read',
      outcomes: [{ messageId, status: 'already-in-state' }],
      markedCount: 0,
      alreadyCount: 1,
      notFoundCount: 0,
      failedCount: 0,
    });
    expect(mailProvider.recordedWrites).toHaveLength(1);
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(true);
    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(conversation.messages[0]!.isRead).toBe(true);
  });
});

describe('US2: agent marks many messages in one call with an outcome per message', () => {
  it('reports marked/already-in-state per id, in input order, across all three Pricing question messages (AS1)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const conversationId = await conversationIdBySubject('Pricing question');
    const questionId = await messageIdByBody(conversationId, 'Can you send the updated pricing sheet?');
    const replyId = await messageIdByBody(conversationId, 'Here it is.');
    const followUpId = await messageIdByBody(conversationId, 'Any update on this?');

    const result = await setEmailReadState([questionId, replyId, followUpId], 'read');

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as {
      outcomes: { messageId: number; status: string }[];
      markedCount: number;
      alreadyCount: number;
    };
    expect(content.outcomes).toEqual([
      { messageId: questionId, status: 'marked' },
      { messageId: replyId, status: 'already-in-state' },
      { messageId: followUpId, status: 'marked' },
    ]);
    expect(content.markedCount).toBe(2);
    expect(content.alreadyCount).toBe(1);

    expect(mailProvider.readStateOf('msg-pricing-question')).toBe(true);
    expect(mailProvider.readStateOf('msg-pricing-followup')).toBe(true);

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(conversation.messages.every((m) => m.isRead)).toBe(true);

    const { conversations: mcpConversations } = (await listConversations()).structuredContent as {
      conversations: { subject: string; hasUnread: boolean }[];
    };
    expect(mcpConversations.find((c) => c.subject === 'Pricing question')!.hasUnread).toBe(false);
    const { conversations: restConversationsList } = await restConversations();
    expect(restConversationsList.find((c) => c.subject === 'Pricing question')!.hasUnread).toBe(false);
  });

  it('reports not-found for an unknown id alongside two real marks, changing only the real messages (AS2)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const quoteConversationId = await conversationIdBySubject('Quote attached');
    const quoteMessageId = await messageIdByBody(quoteConversationId, 'See the attached quote.');
    const pricingConversationId = await conversationIdBySubject('Pricing question');
    const followUpId = await messageIdByBody(pricingConversationId, 'Any update on this?');

    const result = await setEmailReadState([quoteMessageId, followUpId, 999999], 'read');

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as { outcomes: { messageId: number; status: string }[]; notFoundCount: number };
    expect(content.outcomes).toEqual([
      { messageId: quoteMessageId, status: 'marked' },
      { messageId: followUpId, status: 'marked' },
      { messageId: 999999, status: 'not-found' },
    ]);
    expect(content.notFoundCount).toBe(1);
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(true);
    expect(mailProvider.readStateOf('msg-pricing-followup')).toBe(true);
  });

  it('reports failed with a reason when the mailbox no longer has the message, while another id in the same call still succeeds (AS3)', async () => {
    buildTestApp({ deletedGraphMessageIds: ['msg-lunch-1'] });
    await startAndConnect();
    await syncAll();

    const quoteConversationId = await conversationIdBySubject('Quote attached');
    const quoteMessageId = await messageIdByBody(quoteConversationId, 'See the attached quote.');
    const lunchConversationId = await conversationIdBySubject('Lunch Thursday');
    const lunchMessageId = await messageIdByBody(lunchConversationId, 'Thursday at noon?');

    const result = await setEmailReadState([quoteMessageId, lunchMessageId], 'read');

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as { outcomes: { messageId: number; status: string; reason?: string }[] };
    expect(content.outcomes[0]).toEqual({ messageId: quoteMessageId, status: 'marked' });
    expect(content.outcomes[1]!.status).toBe('failed');
    expect(content.outcomes[1]!.reason).toMatch(/mailbox no longer has this message/i);

    expect(mailProvider.readStateOf('msg-quote-1')).toBe(true);
    const lunchConversation = (await getConversation(lunchConversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(lunchConversation.messages[0]!.isRead).toBe(false);
  });

  it('a mid-list mailbox rejection fails only that id — earlier successes stand, later ids still process (batch edge case)', async () => {
    buildTestApp({ failWriteGraphMessageIds: ['msg-pricing-followup'] });
    await startAndConnect();
    await syncAll();

    const pricingConversationId = await conversationIdBySubject('Pricing question');
    const questionId = await messageIdByBody(pricingConversationId, 'Can you send the updated pricing sheet?');
    const followUpId = await messageIdByBody(pricingConversationId, 'Any update on this?');
    const lunchConversationId = await conversationIdBySubject('Lunch Thursday');
    const lunchMessageId = await messageIdByBody(lunchConversationId, 'Thursday at noon?');

    const result = await setEmailReadState([questionId, followUpId, lunchMessageId], 'read');

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as { outcomes: { messageId: number; status: string }[] };
    expect(content.outcomes[0]).toEqual({ messageId: questionId, status: 'marked' });
    expect(content.outcomes[1]!.status).toBe('failed');
    expect(content.outcomes[2]).toEqual({ messageId: lunchMessageId, status: 'marked' });
    expect(mailProvider.readStateOf('msg-pricing-question')).toBe(true);
    expect(mailProvider.readStateOf('msg-lunch-1')).toBe(true);
  });

  it('the same id listed twice in one call: first occurrence marked, second already-in-state (batch edge case)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');

    const result = await setEmailReadState([messageId, messageId], 'read');

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as { outcomes: { messageId: number; status: string }[] };
    expect(content.outcomes).toEqual([
      { messageId, status: 'marked' },
      { messageId, status: 'already-in-state' },
    ]);
  });
});

describe('US5: a call the mailbox cannot take fails with nothing changed', () => {
  it('fails whole with the not-connected sentence, touching nothing (AS1)', async () => {
    buildTestApp({ writeAccess: 'not-connected' });
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');
    const runsBefore = await syncRunCount();

    const result = await setEmailReadState([messageId], 'read');

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result.content)).toContain('The mailbox is not connected — connect the mailbox on the Sync page.');
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(false);
    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(conversation.messages[0]!.isRead).toBe(false);
    expect(await syncRunCount()).toBe(runsBefore);
  });

  it('fails whole with the expired sentence, touching nothing (AS1)', async () => {
    buildTestApp({ writeAccess: 'expired' });
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');

    const result = await setEmailReadState([messageId], 'read');

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result.content)).toMatch(/The mailbox sign-in has expired \(.*\) — reconnect the mailbox on the Sync page\./);
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(false);
  });

  it('fails whole with the missing-write-permission sentence, touching nothing (AS1)', async () => {
    buildTestApp({ writeAccess: 'no-write-permission' });
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');

    const result = await setEmailReadState([messageId], 'read');

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result.content)).toContain(
      'The mailbox sign-in predates read-state changes and lacks permission to change mail — reconnect the mailbox on the Sync page to grant it.',
    );
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(false);
  });

  it('fails whole with the not-connected sentence when no mailProvider is configured at all (AS1)', async () => {
    buildTestAppWithoutMailProvider();
    await startAndConnect();

    const result = await setEmailReadState([1], 'read');

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('The mailbox is not connected — connect the mailbox on the Sync page.');
  });

  it('rejects more than 50 message ids with the exact sentence, marking nothing (AS2)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const messageIds = Array.from({ length: 51 }, (_, i) => i + 1);

    const result = await setEmailReadState(messageIds, 'read');

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('At most 50 messages per call');
    expect(mailProvider.recordedWrites).toEqual([]);
  });

  it('rejects an empty messageIds list with the exact sentence (AS2)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const result = await setEmailReadState([], 'read');

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('At least one message id is required');
    expect(mailProvider.recordedWrites).toEqual([]);
  });

  it('rejects an invalid state with the exact sentence, marking nothing (AS2)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');

    const result = await setEmailReadState([messageId], 'archived');

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('State must be read or unread');
    expect(mailProvider.recordedWrites).toEqual([]);
  });

  it('rejects a non-numeric message id at the SDK/zod boundary before the handler runs', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const result = await client!.callTool({ name: 'set-email-read-state', arguments: { messageIds: ['not-a-number'], state: 'read' } });

    expect(result.isError).toBe(true);
    expect(mailProvider.recordedWrites).toEqual([]);
  });

  it('accepts exactly 50 message ids (built by repeating seeded ids) with 50 outcomes in input order, no id silently dropped (SC-002 boundary)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');
    const messageIds = Array.from({ length: 50 }, () => messageId);

    const result = await setEmailReadState(messageIds, 'read');

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as { outcomes: { messageId: number; status: string }[] };
    expect(content.outcomes).toHaveLength(50);
    expect(content.outcomes[0]).toEqual({ messageId, status: 'marked' });
    expect(content.outcomes.slice(1).every((o) => o.status === 'already-in-state')).toBe(true);
  });

  it('rejects an unauthenticated POST /mcp calling set-email-read-state, changing nothing (spec edge case)', async () => {
    buildTestApp();
    await listenOnly();

    const response = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'set-email-read-state', arguments: { messageIds: [1], state: 'read' } },
      }),
    });

    expect(response.status).toBe(401);
    const wwwAuthenticate = response.headers.get('www-authenticate');
    expect(wwwAuthenticate).toContain('Bearer');
    expect(wwwAuthenticate).toContain(`${serverUrl}/.well-known/oauth-protected-resource`);
    expect(mailProvider.recordedWrites).toEqual([]);
  });
});

describe('US3: agent marks a message back to unread', () => {
  it('moves a read message back to unread everywhere (AS1)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');
    await setEmailReadState([messageId], 'read');
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(true);

    const result = await setEmailReadState([messageId], 'unread');

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      state: 'unread',
      outcomes: [{ messageId, status: 'marked' }],
      markedCount: 1,
      alreadyCount: 0,
      notFoundCount: 0,
      failedCount: 0,
    });
    expect(JSON.stringify(result.content)).toContain('Marked 1 message unread.');
    expect(mailProvider.readStateOf('msg-quote-1')).toBe(false);

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(conversation.messages[0]!.isRead).toBe(false);

    const { conversations: mcpConversations } = (await listConversations()).structuredContent as {
      conversations: { subject: string; hasUnread: boolean }[];
    };
    expect(mcpConversations.find((c) => c.subject === 'Quote attached')!.hasUnread).toBe(true);
    const { conversations: restConversationsList } = await restConversations();
    expect(restConversationsList.find((c) => c.subject === 'Quote attached')!.hasUnread).toBe(true);
  });
});

describe('US4: a later sync confirms the mark instead of reverting it', () => {
  it('a sync over the marked message\'s date range still shows it read afterward, and only the sync itself adds a run (AS1)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Quote attached');
    const messageId = await messageIdByBody(conversationId, 'See the attached quote.');

    const result = await setEmailReadState([messageId], 'read');
    expect(result.isError).toBeFalsy();
    const runsAfterMark = await syncRunCount();

    const secondSync = await syncAll();
    expect(secondSync.isError).toBeFalsy();

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { isRead: boolean }[] };
    expect(conversation.messages[0]!.isRead).toBe(true);
    const { conversations: restConversationsList } = await restConversations();
    expect(restConversationsList.find((c) => c.subject === 'Quote attached')!.hasUnread).toBe(false);

    expect(await syncRunCount()).toBe(runsAfterMark + 1);
  });
});
