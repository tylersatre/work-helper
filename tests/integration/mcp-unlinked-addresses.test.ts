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

function buildTestApp(mailProvider: FakeMailProvider) {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({
    db,
    lanes: LANES,
    personFields: [],
    mcpTokenSecret: MCP_TOKEN_SECRET,
    identityVerifier: createIdentityVerifier(stub.url),
    mailProvider,
  });
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

async function sync(): Promise<void> {
  await client.callTool({ name: 'sync-emails', arguments: { startDate: '2026-07-01', endDate: '2026-08-31' } });
}

async function listUnlinked(args?: Record<string, unknown>) {
  return client.callTool(args === undefined ? { name: 'list-unlinked-addresses' } : { name: 'list-unlinked-addresses', arguments: args });
}

async function createPersonViaApi(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

let seq = 0;
function msg(overrides: Partial<SeedMessage> & { from: SeedMessage['from'] }): SeedMessage {
  seq += 1;
  return {
    id: `msg-${seq}`,
    conversationId: `conv-${seq}`,
    subject: `Message ${seq}`,
    body: { content: 'hi', contentType: 'text' },
    receivedDateTime: '2026-08-01T09:00:00Z',
    sentDateTime: '2026-08-01T09:00:00Z',
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    ...overrides,
  };
}

beforeEach(async () => {
  seq = 0;
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('US2: list-unlinked-addresses', () => {
  it('lists unlinked addresses ordered by message count descending, excludes linked ones, and reflects a link immediately (AS1)', async () => {
    const samMessages = Array.from({ length: 5 }, (_, i) =>
      msg({ from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' }, receivedDateTime: `2026-08-0${i + 1}T09:00:00Z`, sentDateTime: `2026-08-0${i + 1}T09:00:00Z` }),
    );
    const jordanMessages = [
      msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-01T09:00:00Z', sentDateTime: '2026-08-01T09:00:00Z' }),
      msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-03T09:00:00Z', sentDateTime: '2026-08-03T09:00:00Z' }),
      msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
    ];
    const newsMessage = msg({ from: { address: 'news@example.com', name: 'Newsletter' }, receivedDateTime: '2026-08-06T09:00:00Z', sentDateTime: '2026-08-06T09:00:00Z' });

    buildTestApp(new FakeMailProvider([...samMessages, ...jordanMessages, newsMessage]));
    await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await createPersonViaApi({ firstName: 'Tyler', lastName: 'Satre', email: 'tyler@example.com' });
    await startAndConnect();
    await sync();

    const first = await listUnlinked();
    expect(first.isError).toBeFalsy();
    const { addresses } = first.structuredContent as {
      addresses: { address: string; messageCount: number; displayName: string; lastMessageAt: number }[];
    };
    expect(addresses.map((a) => a.address)).toEqual(['jordan.smith@example.com', 'news@example.com']);
    expect(addresses[0]).toEqual({
      address: 'jordan.smith@example.com',
      messageCount: 3,
      displayName: 'Jordan Smith',
      lastMessageAt: Date.parse('2026-08-05T09:00:00Z'),
    });
    expect(addresses[1]).toMatchObject({ address: 'news@example.com', messageCount: 1 });

    await client.callTool({ name: 'create-person', arguments: { firstName: 'Jordan', lastName: 'Smith', email: 'jordan.smith@example.com' } });

    const second = await listUnlinked();
    const { addresses: after } = second.structuredContent as { addresses: { address: string }[] };
    expect(after.map((a) => a.address)).toEqual(['news@example.com']);
  });

  it('lets an agent drain the entire discovery list using only create-person, after which every new person has their mail history and the list is empty (SC-003)', async () => {
    const addresses = ['alex@example.com', 'brianna@example.com', 'cody@example.com'];
    const messages = addresses.map((address) => msg({ from: { address, name: undefined } }));
    buildTestApp(new FakeMailProvider(messages));
    await createPersonViaApi({ firstName: 'Tyler', lastName: 'Satre', email: 'tyler@example.com' });
    await startAndConnect();
    await sync();

    const created: { id: number; address: string }[] = [];
    for (let i = 0; i < addresses.length + 1; i++) {
      const result = await listUnlinked();
      const { addresses: remaining } = result.structuredContent as { addresses: { address: string }[] };
      if (remaining.length === 0) break;
      const next = remaining[0]!;
      const createResult = await client.callTool({
        name: 'create-person',
        arguments: { firstName: `Person${i}`, lastName: 'Test', email: next.address },
      });
      created.push({ id: (createResult.structuredContent as { id: number }).id, address: next.address });
    }

    expect(created.map((c) => c.address).sort()).toEqual(addresses.sort());

    const finalResult = await listUnlinked();
    expect(finalResult.structuredContent).toEqual({ addresses: [] });

    for (const person of created) {
      const emails = await client.callTool({ name: 'emails-for-person', arguments: { personId: person.id } });
      const { emails: list } = emails.structuredContent as { emails: unknown[] };
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it('orders by messageCount desc, then lastMessageAt desc, then address asc for ties', async () => {
    const bbb = [
      msg({ from: { address: 'bbb@example.com' }, receivedDateTime: '2026-08-06T09:00:00Z', sentDateTime: '2026-08-06T09:00:00Z' }),
      msg({ from: { address: 'bbb@example.com' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
    ];
    const aaa = [
      msg({ from: { address: 'aaa@example.com' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
      msg({ from: { address: 'aaa@example.com' }, receivedDateTime: '2026-08-01T09:00:00Z', sentDateTime: '2026-08-01T09:00:00Z' }),
    ];
    const zzz = [
      msg({ from: { address: 'zzz@example.com' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
      msg({ from: { address: 'zzz@example.com' }, receivedDateTime: '2026-08-01T09:00:00Z', sentDateTime: '2026-08-01T09:00:00Z' }),
    ];
    buildTestApp(new FakeMailProvider([...bbb, ...aaa, ...zzz]));
    await createPersonViaApi({ firstName: 'Tyler', lastName: 'Satre', email: 'tyler@example.com' });
    await startAndConnect();
    await sync();

    const result = await listUnlinked();
    const { addresses } = result.structuredContent as { addresses: { address: string }[] };
    expect(addresses.map((a) => a.address)).toEqual(['bbb@example.com', 'aaa@example.com', 'zzz@example.com']);
  });

  it('picks the most recently seen non-empty display name, and falls back to the bare address when mail never carried one', async () => {
    const namedMessages = [
      msg({ from: { address: 'jordan.smith@example.com', name: 'Old Name' }, receivedDateTime: '2026-08-01T09:00:00Z', sentDateTime: '2026-08-01T09:00:00Z' }),
      msg({ from: { address: 'jordan.smith@example.com', name: 'New Name' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
    ];
    const unnamedMessage = msg({ from: { address: 'no-name@example.com', name: undefined } });
    buildTestApp(new FakeMailProvider([...namedMessages, unnamedMessage]));
    await startAndConnect();
    await sync();

    const result = await listUnlinked();
    const { addresses } = result.structuredContent as { addresses: { address: string; displayName: string }[] };
    expect(addresses.find((a) => a.address === 'jordan.smith@example.com')?.displayName).toBe('New Name');
    expect(addresses.find((a) => a.address === 'no-name@example.com')?.displayName).toBe('no-name@example.com');
  });

  it('picks a display name deterministically when two messages tie on sent_at with different non-empty names', async () => {
    const tiedMessages = [
      msg({ from: { address: 'news@example.com', name: 'Acme News' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
      msg({ from: { address: 'news@example.com', name: 'Acme Newsletter' }, receivedDateTime: '2026-08-05T09:00:00Z', sentDateTime: '2026-08-05T09:00:00Z' }),
    ];
    buildTestApp(new FakeMailProvider(tiedMessages));
    await startAndConnect();
    await sync();

    const first = await listUnlinked();
    const second = await listUnlinked();
    const firstName = (first.structuredContent as { addresses: { address: string; displayName: string }[] }).addresses.find((a) => a.address === 'news@example.com')?.displayName;
    const secondName = (second.structuredContent as { addresses: { address: string; displayName: string }[] }).addresses.find((a) => a.address === 'news@example.com')?.displayName;

    expect(firstName).toBe('Acme Newsletter');
    expect(secondName).toBe(firstName);
  });

  it('never suppresses the mailbox owner\'s own address (FR-017)', async () => {
    buildTestApp(new FakeMailProvider([msg({ from: { address: 'someone@example.com' }, toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }] })]));
    await startAndConnect();
    await sync();

    const result = await listUnlinked();
    const { addresses } = result.structuredContent as { addresses: { address: string }[] };
    expect(addresses.map((a) => a.address)).toContain('tyler@example.com');
  });

  it('returns an empty list, not an error, for an empty synced store', async () => {
    buildTestApp(new FakeMailProvider([]));
    await startAndConnect();

    const result = await listUnlinked();
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ addresses: [] });
  });

  it('returns an empty list, not an error, when every synced address is linked', async () => {
    buildTestApp(new FakeMailProvider([msg({ from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' } })]));
    await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await createPersonViaApi({ firstName: 'Tyler', lastName: 'Satre', email: 'tyler@example.com' });
    await startAndConnect();
    await sync();

    const result = await listUnlinked();
    expect(result.structuredContent).toEqual({ addresses: [] });
  });

  it('succeeds when the client omits `arguments` entirely', async () => {
    buildTestApp(new FakeMailProvider([]));
    await startAndConnect();

    const result = await listUnlinked(undefined);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ addresses: [] });
  });

  it('cannot be reached without a bearer token', async () => {
    buildTestApp(new FakeMailProvider([]));
    await startAndConnect();

    const response = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list-unlinked-addresses', arguments: {} } }),
    });

    expect(response.status).toBe(401);
  });
});
