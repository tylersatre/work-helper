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

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client;
let serverUrl: string;
let stub: StubIdentityProvider;

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

function buildTestApp(mailProvider: FakeMailProvider) {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier: createIdentityVerifier(stub.url), mailProvider });
}

async function startAndConnect(): Promise<void> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;

  const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub.mint('tyler') });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
}

async function syncEmails(startDate: string, endDate: string) {
  return client.callTool({ name: 'sync-emails', arguments: { startDate, endDate } });
}

async function listConversations(args: Record<string, unknown> = {}) {
  return client.callTool({ name: 'list-conversations', arguments: args });
}

async function getConversation(conversationId: number) {
  return client.callTool({ name: 'get-conversation', arguments: { conversationId } });
}

async function createPerson(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('US2: read tools', () => {
  it('lists conversations newest-first with counts and latest-message dates (AS1)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), lunchThursday(), pricingReply()]));
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const result = await listConversations();
    expect(result.isError).toBeFalsy();

    const { conversations, nextCursor } = result.structuredContent as {
      conversations: { id: number; subject: string; messageCount: number; latestMessageAt: number }[];
      nextCursor: string | null;
    };
    expect(nextCursor).toBeNull();
    expect(conversations.map((c) => c.subject)).toEqual(['Lunch Thursday', 'Pricing question']);

    const pricing = conversations.find((c) => c.subject === 'Pricing question')!;
    expect(pricing.messageCount).toBe(2);
    expect(pricing.latestMessageAt).toBe(Date.parse('2026-07-11T15:00:00Z'));

    const lunch = conversations.find((c) => c.subject === 'Lunch Thursday')!;
    expect(lunch.messageCount).toBe(1);
  });

  it('fetches a conversation with chronological messages, bodies, and role tags including linked/unlinked people and bcc (AS2)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), pricingReply()]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const listed = await listConversations();
    const { conversations } = listed.structuredContent as { conversations: { id: number; subject: string }[] };
    const pricingId = conversations.find((c) => c.subject === 'Pricing question')!.id;

    const result = await getConversation(pricingId);
    expect(result.isError).toBeFalsy();

    const conversation = result.structuredContent as {
      id: number;
      subject: string;
      messages: {
        id: number;
        subject: string;
        sentAt: number;
        bodyText: string;
        sourceFolder: string;
        participants: { address: string; role: string; person: { id: number; name: string } | null }[];
      }[];
    };

    expect(conversation.subject).toBe('Pricing question');
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages.map((m) => m.subject)).toEqual(['Pricing question', 'Re: Pricing question']);
    expect(conversation.messages[0]!.sentAt).toBeLessThan(conversation.messages[1]!.sentAt);

    const first = conversation.messages[0]!;
    expect(first.bodyText).toBe('Can you send the updated pricing sheet?');
    expect(first.sourceFolder).toBe('inbox');
    expect(first.participants).toContainEqual({ address: 'sam.rivera@example.com', role: 'from', person: { id: sam, name: 'Sam Rivera' } });
    expect(first.participants).toContainEqual({ address: 'tyler@example.com', role: 'to', person: null });
    expect(first.participants).toContainEqual({ address: 'ana.alvarez@example.com', role: 'cc', person: null });

    const second = conversation.messages[1]!;
    expect(second.sourceFolder).toBe('sent');
    expect(second.participants).toContainEqual({ address: 'ana.alvarez@example.com', role: 'bcc', person: null });
    expect(second.participants).toContainEqual({ address: 'sam.rivera@example.com', role: 'to', person: { id: sam, name: 'Sam Rivera' } });
  });

  it('errors with "Conversation N not found" for an unknown id', async () => {
    buildTestApp(new FakeMailProvider([]));
    await startAndConnect();

    const result = await getConversation(999999);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Conversation 999999 not found');
  });

  it('rejects an invalid cursor with a tool error', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const result = await listConversations({ cursor: 'not-a-valid-cursor' });

    expect(result.isError).toBe(true);
  });

  it('rejects limit below 1 or above 200', async () => {
    buildTestApp(new FakeMailProvider([]));
    await startAndConnect();

    const tooLow = await listConversations({ limit: 0 });
    expect(tooLow.isError).toBe(true);

    const tooHigh = await listConversations({ limit: 201 });
    expect(tooHigh.isError).toBe(true);
  });

  it('pages with keyset cursors: exactly-once ordering, and a mid-paging bump is absent from the rest of that sequence but first on a fresh listing', async () => {
    const alpha: SeedMessage = {
      id: 'msg-alpha-1',
      conversationId: 'conv-alpha',
      subject: 'Alpha',
      body: { content: 'a', contentType: 'text' },
      receivedDateTime: '2026-07-01T18:00:00Z',
      sentDateTime: '2026-07-01T18:00:00Z',
      from: { address: 'a@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    };
    const bravo: SeedMessage = { ...alpha, id: 'msg-bravo-1', conversationId: 'conv-bravo', subject: 'Bravo', receivedDateTime: '2026-07-05T18:00:00Z', sentDateTime: '2026-07-05T18:00:00Z' };
    const charlie: SeedMessage = { ...alpha, id: 'msg-charlie-1', conversationId: 'conv-charlie', subject: 'Charlie', receivedDateTime: '2026-07-10T18:00:00Z', sentDateTime: '2026-07-10T18:00:00Z' };

    buildTestApp(new FakeMailProvider([alpha, bravo, charlie]));
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const page1 = await listConversations({ limit: 2 });
    const page1Content = page1.structuredContent as { conversations: { subject: string }[]; nextCursor: string | null };
    expect(page1Content.conversations.map((c) => c.subject)).toEqual(['Charlie', 'Bravo']);
    expect(page1Content.nextCursor).not.toBeNull();

    const alphaBump: SeedMessage = { ...alpha, id: 'msg-alpha-2', receivedDateTime: '2026-07-25T18:00:00Z', sentDateTime: '2026-07-25T18:00:00Z' };
    app.mailProvider = new FakeMailProvider([alphaBump]);
    await syncEmails('2026-07-01', '2026-07-31');

    const page2 = await listConversations({ limit: 2, cursor: page1Content.nextCursor! });
    const page2Content = page2.structuredContent as { conversations: { subject: string }[]; nextCursor: string | null };
    expect(page2Content.conversations).toEqual([]);
    expect(page2Content.nextCursor).toBeNull();

    const fresh = await listConversations({ limit: 10 });
    const freshContent = fresh.structuredContent as { conversations: { subject: string }[] };
    expect(freshContent.conversations.map((c) => c.subject)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });
});
