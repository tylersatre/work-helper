import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { setAppState } from '../../src/server/services/app-state.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { FakeMailProvider, type FakeMailProviderOptions, type SeedMessage } from './helpers/fake-mail-provider.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';
const OWNER_ADDRESS = 'tyler@example.com';
const SYNC_START = '2026-08-01';
const SYNC_END = '2026-08-08';

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client | undefined;
let serverUrl: string;
let stub: StubIdentityProvider;
let mailProvider: FakeMailProvider;

// --- Fixtures ---

function pricingQuestion(): SeedMessage {
  return {
    id: 'msg-pricing-question',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-08-04T10:00:00Z',
    sentDateTime: '2026-08-04T10:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: OWNER_ADDRESS, name: 'Tyler Satre' }],
    ccRecipients: [{ address: 'ana.alvarez@example.com', name: 'Ana Alvarez' }],
    bccRecipients: [],
    folder: 'inbox',
    isRead: true,
  };
}

function existingSentMessage(): SeedMessage {
  return {
    id: 'msg-already-sent',
    conversationId: 'conv-already-sent',
    subject: 'Meeting notes',
    body: { content: 'Sent already.', contentType: 'text' },
    receivedDateTime: '2026-08-03T10:00:00Z',
    sentDateTime: '2026-08-03T10:00:00Z',
    from: { address: OWNER_ADDRESS, name: 'Tyler Satre' },
    toRecipients: [{ address: 'sam.rivera@example.com', name: 'Sam Rivera' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'sent',
    isRead: true,
  };
}

const ALL_SEEDS = [pricingQuestion(), existingSentMessage()];

// --- Harness ---

function buildTestApp(options: FakeMailProviderOptions = {}) {
  mailProvider = new FakeMailProvider(ALL_SEEDS, { ownerAddress: OWNER_ADDRESS, ...options });
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier: createIdentityVerifier(stub.url), mailProvider });
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

async function syncAll() {
  return client!.callTool({ name: 'sync-emails', arguments: { startDate: SYNC_START, endDate: SYNC_END } });
}

async function createDraft(args: Record<string, unknown>) {
  return client!.callTool({ name: 'create-draft', arguments: args });
}

async function createReplyDraft(args: Record<string, unknown>) {
  return client!.callTool({ name: 'create-reply-draft', arguments: args });
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

async function messageIdByBody(conversationId: number, bodyText: string): Promise<number> {
  const result = await getConversation(conversationId);
  const { messages } = result.structuredContent as { messages: { id: number; bodyText: string }[] };
  const match = messages.find((m) => m.bodyText === bodyText);
  if (!match) throw new Error(`No message with body "${bodyText}" in conversation ${conversationId}`);
  return match.id;
}

async function restConversations(): Promise<{ conversations: { id: number; subject: string; hasDraft: boolean }[] }> {
  const response = await app.inject({ method: 'GET', url: '/api/emails/conversations' });
  return response.json();
}

async function restConversation(conversationId: number): Promise<{ messages: { id: number; isDraft: boolean; bodyText: string }[] }> {
  const response = await app.inject({ method: 'GET', url: `/api/emails/conversations/${conversationId}` });
  return response.json();
}

async function syncRunCount(): Promise<number> {
  const response = await app.inject({ method: 'GET', url: '/api/email-sync/runs' });
  const { runs } = response.json() as { runs: unknown[] };
  return runs.length;
}

function setSignature(html: string): void {
  setAppState(db, 'email.signature', html);
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

describe('US1: create-draft — fresh drafts land in the Drafts folder', () => {
  it('with no saved signature, writes exactly the supplied body with nothing appended (AC1)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createDraft({
      to: ['sam.rivera@example.com'],
      subject: 'Pricing sheet',
      bodyHtml: '<p>Here is the pricing sheet.</p>',
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('Created draft \\"Pricing sheet\\"');
    const [draft] = mailProvider.draftsInMailbox();
    expect(draft!.body.content).toBe('<p>Here is the pricing sheet.</p>');
  });

  it('with a saved signature, the body reads supplied HTML then the signature, and to/cc/bcc all land through the tool (spec assumption 4)', async () => {
    buildTestApp();
    await startAndConnect();
    setSignature('<p>Tyler Satre</p><p>Example Corp</p>');

    const result = await createDraft({
      to: ['sam.rivera@example.com'],
      cc: ['ana.alvarez@example.com'],
      bcc: ['bob.jones@example.com'],
      subject: 'Pricing sheet',
      bodyHtml: '<p>Here is the pricing sheet.</p>',
    });

    expect(result.isError).toBeFalsy();
    const [draft] = mailProvider.draftsInMailbox();
    expect(draft!.body.content).toBe('<p>Here is the pricing sheet.</p><p>Tyler Satre</p><p>Example Corp</p>');
    expect(draft!.toRecipients.map((r) => r.address)).toEqual(['sam.rivera@example.com']);
    expect(draft!.ccRecipients.map((r) => r.address)).toEqual(['ana.alvarez@example.com']);
    expect(draft!.bccRecipients.map((r) => r.address)).toEqual(['bob.jones@example.com']);
  });

  it('after changing the saved signature, a further create appends the new value (FR-002)', async () => {
    buildTestApp();
    await startAndConnect();
    setSignature('<p>Old signature</p>');
    await createDraft({ to: ['sam.rivera@example.com'], subject: 'First', bodyHtml: '<p>One</p>' });

    setSignature('<p>New signature</p>');
    await createDraft({ to: ['sam.rivera@example.com'], subject: 'Second', bodyHtml: '<p>Two</p>' });

    const drafts = mailProvider.draftsInMailbox();
    const second = drafts.find((d) => d.subject === 'Second');
    expect(second!.body.content).toBe('<p>Two</p><p>New signature</p>');
  });

  it('the draft appears at once on every surface — no sync run, no new sync_runs row (AC2, FR-012/FR-013/FR-014)', async () => {
    buildTestApp();
    await startAndConnect();
    const runsBefore = await syncRunCount();

    const result = await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '<p>Hi</p>' });
    const { messageId, conversationId } = result.structuredContent as { messageId: number; conversationId: number };

    expect(await syncRunCount()).toBe(runsBefore);

    const { conversations } = (await listConversations()).structuredContent as { conversations: { id: number; hasDraft: boolean }[] };
    expect(conversations.find((c) => c.id === conversationId)!.hasDraft).toBe(true);

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { id: number; isDraft: boolean }[] };
    expect(conversation.messages.find((m) => m.id === messageId)!.isDraft).toBe(true);

    const { conversations: restConversationsList } = await restConversations();
    expect(restConversationsList.find((c) => c.id === conversationId)!.hasDraft).toBe(true);

    const restDetail = await restConversation(conversationId);
    expect(restDetail.messages.find((m) => m.id === messageId)!.isDraft).toBe(true);
  });

  it('never touches the Sent folder (SC-004)', async () => {
    buildTestApp();
    await startAndConnect();
    const sentBefore = mailProvider.sentMessages();

    await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '<p>Hi</p>' });

    expect(mailProvider.sentMessages()).toEqual(sentBefore);
  });

  it('fails with the not-connected sentence and creates nothing', async () => {
    buildTestApp({ writeAccess: 'not-connected' });
    await startAndConnect();

    const result = await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '<p>Hi</p>' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('The mailbox is not connected — connect the mailbox on the Sync page.');
    expect(mailProvider.draftsInMailbox()).toEqual([]);
  });

  it('fails with the expired sentence and creates nothing', async () => {
    buildTestApp({ writeAccess: 'expired' });
    await startAndConnect();

    const result = await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '<p>Hi</p>' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/The mailbox sign-in has expired \(.*\) — reconnect the mailbox on the Sync page\./);
    expect(mailProvider.draftsInMailbox()).toEqual([]);
  });

  it('fails with the no-write-permission sentence and creates nothing (AC3, FR-021)', async () => {
    buildTestApp({ writeAccess: 'no-write-permission' });
    await startAndConnect();

    const result = await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '<p>Hi</p>' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'The mailbox sign-in lacks permission to change mail — add delegated Mail.ReadWrite to the Entra app registration, then reconnect the mailbox on the Sync page to grant it.',
    );
    expect(mailProvider.draftsInMailbox()).toEqual([]);
  });

  it('fails with "A body is required" for an empty/whitespace bodyHtml and creates nothing (AC4, FR-022)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '   ' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('A body is required');
    expect(mailProvider.draftsInMailbox()).toEqual([]);
  });
});

describe('US2: create-reply-draft — replies shaped like Outlook', () => {
  it('reply and reply-all both carry "Re:" subject, sit inside the original conversation as drafts, and read supplied HTML → signature → quote (AC1, FR-005/FR-006, SC-002)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    setSignature('<p>Tyler Satre</p>');
    const conversationId = await conversationIdBySubject('Pricing question');
    const messageId = await messageIdByBody(conversationId, 'Can you send the updated pricing sheet?');

    const replyResult = await createReplyDraft({ messageId, bodyHtml: '<p>Sure, attached.</p>' });
    expect(replyResult.isError).toBeFalsy();
    expect(JSON.stringify(replyResult.content)).toContain('Created reply draft \\"Re: Pricing question\\"');
    const replySummary = replyResult.structuredContent as { conversationId: number; subject: string; to: string[]; cc: string[] };
    expect(replySummary.subject).toBe('Re: Pricing question');
    expect(replySummary.conversationId).toBe(conversationId);
    expect(replySummary.to).toEqual(['sam.rivera@example.com']);
    expect(replySummary.cc).toEqual([]);

    const replyAllResult = await createReplyDraft({ messageId, replyAll: true, bodyHtml: '<p>Sure, attached.</p>' });
    expect(JSON.stringify(replyAllResult.content)).toContain('Created reply-all draft');
    const replyAllSummary = replyAllResult.structuredContent as { to: string[]; cc: string[] };
    expect(replyAllSummary.to).toEqual(['sam.rivera@example.com']);
    expect(replyAllSummary.cc).toEqual(['ana.alvarez@example.com']);

    const drafts = mailProvider.draftsInMailbox().filter((d) => d.subject === 'Re: Pricing question');
    expect(drafts).toHaveLength(2);
    const [draft] = drafts;
    const suppliedIndex = draft!.body.content.indexOf('Sure, attached.');
    const signatureIndex = draft!.body.content.indexOf('Tyler Satre');
    const quoteIndex = draft!.body.content.indexOf('Can you send the updated pricing sheet?');
    expect(suppliedIndex).toBeGreaterThanOrEqual(0);
    expect(signatureIndex).toBeGreaterThan(suppliedIndex);
    expect(quoteIndex).toBeGreaterThan(signatureIndex);

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { isDraft: boolean }[] };
    expect(conversation.messages.filter((m) => m.isDraft)).toHaveLength(2);
  });

  it('fails with "Message 999999 not found" for an unsynced messageId and creates nothing (AC2, FR-022)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const result = await createReplyDraft({ messageId: 999999, bodyHtml: '<p>Hi</p>' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Message 999999 not found');
    expect(mailProvider.draftsInMailbox()).toEqual([]);
  });
});
