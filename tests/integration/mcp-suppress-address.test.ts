import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { suppressedAddresses } from '../../src/server/db/schema.js';
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
async function seedStandardStore(): Promise<{ samPersonId: number }> {
  const newsMessage = msg({ from: { address: 'news@example.com', name: 'Newsletter' } });
  const jordanMessages = [
    msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-02T09:00:00Z', sentDateTime: '2026-08-02T09:00:00Z' }),
    msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-03T09:00:00Z', sentDateTime: '2026-08-03T09:00:00Z' }),
    msg({ from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' }, receivedDateTime: '2026-08-04T09:00:00Z', sentDateTime: '2026-08-04T09:00:00Z' }),
  ];
  const samMessage = msg({ from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' } });

  buildTestApp(new FakeMailProvider([newsMessage, ...jordanMessages, samMessage]));
  const samPersonId = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
  await startAndConnect();
  await sync();
  return { samPersonId };
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

describe('US2: list-suppressed-addresses', () => {
  it('includes a suppressed address (AS1)', async () => {
    await seedStandardStore();

    await suppressAddress('news@example.com');

    const result = await listSuppressed();
    expect(result.isError).toBeFalsy();
    const { addresses } = result.structuredContent as { addresses: { address: string; suppressedAt: number }[] };
    expect(addresses.map((a) => a.address)).toContain('news@example.com');
  });

  it('orders by suppression time, most recently suppressed first (AS2, FR-005)', async () => {
    await seedStandardStore();

    await suppressAddress('news@example.com');
    await suppressAddress('jordan.smith@example.com');

    const result = await listSuppressed();
    const { addresses } = result.structuredContent as { addresses: { address: string; suppressedAt: number }[] };
    expect(addresses.map((a) => a.address)).toEqual(['jordan.smith@example.com', 'news@example.com']);
  });

  it('breaks a suppressedAt tie by most-recently-inserted first, so same-millisecond suppressions still order deterministically (FR-005)', async () => {
    await seedStandardStore();

    await suppressAddress('news@example.com');
    await suppressAddress('jordan.smith@example.com');

    // Force a tie: two real suppress calls can land in the same millisecond in practice, so
    // collapse them here to prove ordering doesn't silently fall back to insertion (rowid) order.
    const tiedAt = Date.now();
    db.update(suppressedAddresses).set({ suppressedAt: tiedAt }).run();

    const result = await listSuppressed();
    const { addresses } = result.structuredContent as { addresses: { address: string; suppressedAt: number }[] };
    expect(addresses.every((a) => a.suppressedAt === tiedAt)).toBe(true);
    expect(addresses.map((a) => a.address)).toEqual(['jordan.smith@example.com', 'news@example.com']);
  });
});

describe('US3: unsuppress-address', () => {
  it('clears a suppression, so the address reappears in list-unlinked-addresses and drops from list-suppressed-addresses (AS1)', async () => {
    await seedStandardStore();
    await suppressAddress('news@example.com');

    const result = await unsuppressAddress('news@example.com');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ address: 'news@example.com', wasSuppressed: true });

    const unlinked = await listUnlinked();
    const unlinkedAddresses = (unlinked.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(unlinkedAddresses).toContain('news@example.com');

    const suppressed = await listSuppressed();
    const suppressedAddressList = (suppressed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(suppressedAddressList).not.toContain('news@example.com');
  });

  it('is a no-op for an address that is not currently suppressed, succeeding with wasSuppressed: false (FR-007)', async () => {
    await seedStandardStore();

    const result = await unsuppressAddress('jordan.smith@example.com');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ address: 'jordan.smith@example.com', wasSuppressed: false });
  });

  it('is a no-op for an address that has never been seen at all, succeeding with wasSuppressed: false (FR-007)', async () => {
    await seedStandardStore();

    const result = await unsuppressAddress('never-seen@example.com');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ address: 'never-seen@example.com', wasSuppressed: false });
  });

  it('resolves address matching case-insensitively and echoes the stored (synced) casing, not the caller\'s casing (FR-011)', async () => {
    await seedStandardStore();
    await suppressAddress('news@example.com');

    const result = await unsuppressAddress('NEWS@Example.com');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ address: 'news@example.com', wasSuppressed: true });
  });
});

describe('US4: suppression respects and defers to real linking', () => {
  it('clears the suppression flag automatically when create-person links the address to a new person (AS3)', async () => {
    await seedStandardStore();
    await suppressAddress('jordan.smith@example.com');

    const createResult = await client.callTool({
      name: 'create-person',
      arguments: { firstName: 'Jordan', lastName: 'Smith', email: 'jordan.smith@example.com' },
    });
    expect(createResult.isError).toBeFalsy();

    const suppressed = await listSuppressed();
    const suppressedAddressList = (suppressed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(suppressedAddressList).not.toContain('jordan.smith@example.com');
  });

  it('clears the suppression flag automatically when add-contact-entry links the address to an existing person', async () => {
    const { samPersonId } = await seedStandardStore();
    await suppressAddress('news@example.com');

    const addResult = await client.callTool({
      name: 'add-contact-entry',
      arguments: { personId: samPersonId, type: 'email', value: 'news@example.com' },
    });
    expect(addResult.isError).toBeFalsy();

    const suppressed = await listSuppressed();
    const suppressedAddressList = (suppressed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(suppressedAddressList).not.toContain('news@example.com');
  });

  it('does not reactivate a cleared suppression flag when the address is later unlinked again (AS4)', async () => {
    await seedStandardStore();
    await suppressAddress('jordan.smith@example.com');

    const createResult = await client.callTool({
      name: 'create-person',
      arguments: { firstName: 'Jordan', lastName: 'Smith', email: 'jordan.smith@example.com' },
    });
    const person = createResult.structuredContent as { id: number; emails: { id: number; value: string }[] };
    const entryId = person.emails.find((e) => e.value === 'jordan.smith@example.com')!.id;

    const removeResult = await client.callTool({
      name: 'remove-contact-entry',
      arguments: { personId: person.id, type: 'email', entryId },
    });
    expect(removeResult.isError).toBeFalsy();

    const unlinked = await listUnlinked();
    const unlinkedAddresses = (unlinked.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(unlinkedAddresses).toContain('jordan.smith@example.com');

    const suppressed = await listSuppressed();
    const suppressedAddressList = (suppressed.structuredContent as { addresses: { address: string }[] }).addresses.map((a) => a.address);
    expect(suppressedAddressList).not.toContain('jordan.smith@example.com');
  });
});

describe('Polish: suppression has no effect on synced mail (FR-012)', () => {
  it('still shows a suppressed address as a normal participant via list-conversations', async () => {
    await seedStandardStore();

    await suppressAddress('news@example.com');

    const conversations = await client.callTool({ name: 'list-conversations', arguments: {} });
    expect(conversations.isError).toBeFalsy();
    const { conversations: list } = conversations.structuredContent as {
      conversations: { participants: { address: string }[] }[];
    };
    const allParticipantAddresses = list.flatMap((c) => c.participants.map((p) => p.address));
    expect(allParticipantAddresses).toContain('news@example.com');
  });
});
