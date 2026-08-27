import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailMessages } from '../../src/server/db/schema.js';
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

async function updateDraft(args: Record<string, unknown>) {
  return client!.callTool({ name: 'update-draft', arguments: args });
}

async function deleteDraft(args: Record<string, unknown>) {
  return client!.callTool({ name: 'delete-draft', arguments: args });
}

async function createTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'create-task', arguments: args });
}

async function linkConversationToTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'link-conversation-to-task', arguments: args });
}

async function getTask(args: Record<string, unknown>) {
  return client!.callTool({ name: 'get-task', arguments: args });
}

function graphMessageIdOf(storeMessageId: number): string {
  const [row] = db.select({ graphMessageId: emailMessages.graphMessageId }).from(emailMessages).where(eq(emailMessages.id, storeMessageId)).limit(1).all();
  return row!.graphMessageId;
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

  it("a fresh draft's conversation sorts first, not last, even though Graph reports an unset sentDateTime for it (regression)", async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();

    const result = await createDraft({ to: ['sam.rivera@example.com'], subject: 'Brand new draft', bodyHtml: '<p>Hi</p>' });
    const { conversationId } = result.structuredContent as { conversationId: number };

    const { conversations } = (await listConversations()).structuredContent as { conversations: { id: number }[] };
    expect(conversations[0]!.id).toBe(conversationId);
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

  it("a reply draft does not retitle its conversation to \"Re: ...\", even though Graph reports an unset sentDateTime for it (regression)", async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Pricing question');
    const messageId = await messageIdByBody(conversationId, 'Can you send the updated pricing sheet?');

    await createReplyDraft({ messageId, bodyHtml: '<p>Sure, attached.</p>' });

    const { conversations } = (await listConversations()).structuredContent as { conversations: { id: number; subject: string }[] };
    expect(conversations.find((c) => c.id === conversationId)!.subject).toBe('Pricing question');
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

describe('US3: update-draft / delete-draft — guarded by the draft flag', () => {
  it('update-draft replaces the body verbatim (nothing appended, signature untouched), changes cc, leaves to/subject unchanged, visible immediately with no sync run (AC1, FR-009/FR-012)', async () => {
    buildTestApp();
    await startAndConnect();
    setSignature('<p>Tyler Satre</p>');
    const created = (await createDraft({ to: ['sam.rivera@example.com'], subject: 'Pricing sheet', bodyHtml: '<p>Draft one.</p>' }))
      .structuredContent as { messageId: number; conversationId: number };
    const runsBefore = await syncRunCount();

    const result = await updateDraft({ messageId: created.messageId, bodyHtml: '<p>Replaced body.</p>', cc: ['ana.alvarez@example.com'] });

    expect(result.isError).toBeFalsy();
    const summary = result.structuredContent as { subject: string; to: string[]; cc: string[] };
    expect(summary.subject).toBe('Pricing sheet');
    expect(summary.to).toEqual(['sam.rivera@example.com']);
    expect(summary.cc).toEqual(['ana.alvarez@example.com']);
    expect(await syncRunCount()).toBe(runsBefore);

    const draft = mailProvider.draftsInMailbox().find((d) => d.id === graphMessageIdOf(created.messageId));
    expect(draft!.body.content).toBe('<p>Replaced body.</p>');

    const restDetail = await restConversation(created.conversationId);
    expect(restDetail.messages.find((m) => m.id === created.messageId)!.bodyText).toBe('Replaced body.');
  });

  it('delete-draft removes the draft from the mailbox and conversation, leaving real messages and other drafts untouched, adding no sync_runs row (AC2, FR-010, FR-014)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Pricing question');
    const messageId = await messageIdByBody(conversationId, 'Can you send the updated pricing sheet?');
    const reply = (await createReplyDraft({ messageId, bodyHtml: '<p>Reply body.</p>' })).structuredContent as { messageId: number };
    const replyAll = (await createReplyDraft({ messageId, replyAll: true, bodyHtml: '<p>Reply-all body.</p>' })).structuredContent as {
      messageId: number;
    };
    const runsBefore = await syncRunCount();

    const result = await deleteDraft({ messageId: reply.messageId });

    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('Deleted draft');
    expect(await syncRunCount()).toBe(runsBefore);

    const drafts = mailProvider.draftsInMailbox();
    expect(drafts.some((d) => d.body.content.includes('Reply body.'))).toBe(false);
    expect(drafts.some((d) => d.body.content.includes('Reply-all body.'))).toBe(true);

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { id: number; isDraft: boolean }[] };
    expect(conversation.messages.some((m) => m.id === reply.messageId)).toBe(false);
    expect(conversation.messages.some((m) => m.id === replyAll.messageId)).toBe(true);
    expect(conversation.messages.filter((m) => !m.isDraft)).toHaveLength(1);
  });

  it("deleting a draft-only conversation's last draft does not drop its task link (regression)", async () => {
    buildTestApp();
    await startAndConnect();
    const created = (await createDraft({ to: ['sam.rivera@example.com'], subject: 'Linked draft', bodyHtml: '<p>Hi</p>' }))
      .structuredContent as { messageId: number; conversationId: number };
    const task = await createTask({ title: 'Follow up' });
    const taskId = (task.structuredContent as { id: number }).id;
    await linkConversationToTask({ taskId, conversationId: created.conversationId });

    await deleteDraft({ messageId: created.messageId });

    const after = (await getTask({ taskId })).structuredContent as { conversations: { id: number }[] };
    expect(after.conversations.some((c) => c.id === created.conversationId)).toBe(true);
  });

  it('update-draft and delete-draft against a non-draft message id each fail and change nothing (AC3, FR-011, SC-005)', async () => {
    buildTestApp();
    await startAndConnect();
    await syncAll();
    const conversationId = await conversationIdBySubject('Pricing question');
    const messageId = await messageIdByBody(conversationId, 'Can you send the updated pricing sheet?');
    const guardMessage = `Message ${messageId} is not a draft — only draft messages can be edited or deleted.`;

    const updateResult = await updateDraft({ messageId, bodyHtml: '<p>x</p>' });
    expect(updateResult.isError).toBe(true);
    expect(JSON.stringify(updateResult.content)).toContain(guardMessage);

    const deleteResult = await deleteDraft({ messageId });
    expect(deleteResult.isError).toBe(true);
    expect(JSON.stringify(deleteResult.content)).toContain(guardMessage);

    const conversation = (await getConversation(conversationId)).structuredContent as { messages: { id: number; bodyText: string }[] };
    expect(conversation.messages.find((m) => m.id === messageId)!.bodyText).toBe('Can you send the updated pricing sheet?');
  });

  it('update-draft against a stale draft (gone from the mailbox since last sync) fails cleanly with the store untouched (AC4, FR-022)', async () => {
    buildTestApp();
    await startAndConnect();
    const created = (await createDraft({ to: ['sam.rivera@example.com'], subject: 'Stale draft', bodyHtml: '<p>Original.</p>' }))
      .structuredContent as { messageId: number; conversationId: number };
    mailProvider.discardDraftFromMailbox(graphMessageIdOf(created.messageId));

    const result = await updateDraft({ messageId: created.messageId, bodyHtml: '<p>New.</p>' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('The mailbox no longer has this draft — the next sync will reconcile it.');
    const restDetail = await restConversation(created.conversationId);
    expect(restDetail.messages.find((m) => m.id === created.messageId)!.bodyText).toBe('Original.');
  });

  it('update-draft against a draft that was sent from Outlook since the last sync fails cleanly, touching neither the sent message nor the store (research R6, FR-022)', async () => {
    buildTestApp();
    await startAndConnect();
    const created = (await createDraft({ to: ['sam.rivera@example.com'], subject: 'About to be sent', bodyHtml: '<p>Original.</p>' }))
      .structuredContent as { messageId: number; conversationId: number };
    const graphId = graphMessageIdOf(created.messageId);
    mailProvider.sendDraftFromMailbox(graphId, '2026-08-06T10:00:00Z');

    const result = await updateDraft({ messageId: created.messageId, bodyHtml: '<p>New.</p>' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('The mailbox no longer has this draft — the next sync will reconcile it.');
    const [sentCopy] = mailProvider.sentMessages().filter((m) => m.id === graphId);
    expect(sentCopy!.body.content).toBe('<p>Original.</p>');
    const restDetail = await restConversation(created.conversationId);
    expect(restDetail.messages.find((m) => m.id === created.messageId)!.bodyText).toBe('Original.');
  });

  it('delete-draft against a draft that was sent from Outlook since the last sync fails cleanly, never deleting the sent message (research R6, FR-019/FR-022)', async () => {
    buildTestApp();
    await startAndConnect();
    const created = (await createDraft({ to: ['sam.rivera@example.com'], subject: 'About to be sent', bodyHtml: '<p>Original.</p>' }))
      .structuredContent as { messageId: number; conversationId: number };
    const graphId = graphMessageIdOf(created.messageId);
    mailProvider.sendDraftFromMailbox(graphId, '2026-08-06T10:00:00Z');

    const result = await deleteDraft({ messageId: created.messageId });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('The mailbox no longer has this draft — the next sync will reconcile it.');
    expect(mailProvider.sentMessages().some((m) => m.id === graphId)).toBe(true);
    const restDetail = await restConversation(created.conversationId);
    expect(restDetail.messages.find((m) => m.id === created.messageId)).toBeDefined();
  });
});
