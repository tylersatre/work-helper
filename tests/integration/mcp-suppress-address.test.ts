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

async function createPersonViaApi(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function listUnlinked() {
  return client.callTool({ name: 'list-unlinked-addresses' });
}

async function listSuppressed() {
  return client.callTool({ name: 'list-suppressed-addresses' });
}

async function suppressAddress(address: string) {
  return client.callTool({ name: 'suppress-address', arguments: { address } });
}

async function unsuppressAddress(address: string) {
  return client.callTool({ name: 'unsuppress-address', arguments: { address } });
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

/** Seeds news@example.com (1 msg, unlinked), jordan.smith@example.com (3 msg, unlinked), and
 * sam.rivera@example.com (1 msg, linked to person "Sam Rivera"), synced and ready. */
async function seedStandardStore(): Promise<void> {
  const newsMessage = msg({ from: { address: 'news@example.com', name: 'Newsletter' } });
  const jordanMessages = [
    msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-02T09:00:00Z', sentDateTime: '2026-08-02T09:00:00Z' }),
    msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-03T09:00:00Z', sentDateTime: '2026-08-03T09:00:00Z' }),
    msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-04T09:00:00Z', sentDateTime: '2026-08-04T09:00:00Z' }),
  ];
  const samMessage = msg({ from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' } });

  buildTestApp(new FakeMailProvider([newsMessage, ...jordanMessages, samMessage]));
  await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
  await startAndConnect();
  await sync();
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

describe('US1: suppress-address', () => {
  it('drops a suppressed address from list-unlinked-addresses on the very next call, leaving other unlinked addresses in place (AS1)', async () => {
    await seedStandardStore();

    const before = await listUnlinked();
    const beforeAddresses = (before.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(beforeAddresses).toContain('news@example.com');
    expect(beforeAddresses).toContain('jordan.smith@example.com');

    const suppressResult = await suppressAddress('news@example.com');
    expect(suppressResult.isError).toBeFalsy();
    expect(suppressResult.structuredContent).toMatchObject({ address: 'news@example.com' });
    expect((suppressResult.structuredContent as { suppressedAt: number }).suppressedAt).toBeTypeOf('number');

    const after = await listUnlinked();
    const afterAddresses = (after.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(afterAddresses).not.toContain('news@example.com');
    expect(afterAddresses).toContain('jordan.smith@example.com');
  });

  it('is idempotent: suppressing an already-suppressed address succeeds as a no-op, leaving suppressedAt unchanged (FR-004)', async () => {
    await seedStandardStore();

    const first = await suppressAddress('news@example.com');
    const firstSuppressedAt = (first.structuredContent as { suppressedAt: number }).suppressedAt;

    const second = await suppressAddress('news@example.com');
    expect(second.isError).toBeFalsy();
    expect((second.structuredContent as { suppressedAt: number }).suppressedAt).toBe(firstSuppressedAt);
  });

  it('resolves address matching case-insensitively and echoes the stored (synced) casing, not the caller\'s casing (FR-011)', async () => {
    await seedStandardStore();

    const result = await suppressAddress('NEWS@Example.com');
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { address: string }).address).toBe('news@example.com');

    const listed = await listSuppressed();
    const addresses = (listed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(addresses).toEqual(['news@example.com']);
  });

  it('rejects an address that has never appeared in any synced message, and it never appears in list-suppressed-addresses (US4 AS1, FR-002)', async () => {
    await seedStandardStore();

    const result = await suppressAddress('never-seen@example.com');
    expect(result.isError).toBe(true);

    const listed = await listSuppressed();
    const addresses = (listed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(addresses).not.toContain('never-seen@example.com');
  });

  it('rejects an address already linked to a person, naming that person, and it never appears in list-suppressed-addresses (US4 AS2, FR-003)', async () => {
    await seedStandardStore();

    const result = await suppressAddress('sam.rivera@example.com');
    expect(result.isError).toBe(true);
    const text = result.content as { type: string; text: string }[];
    expect(text[0]?.text).toContain('Sam Rivera');

    const listed = await listSuppressed();
    const addresses = (listed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(addresses).not.toContain('sam.rivera@example.com');
  });
});
