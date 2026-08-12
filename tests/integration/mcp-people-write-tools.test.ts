import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailAddresses } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';
const PERSON_FIELDS = ['Nickname', 'Company'];

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client;
let serverUrl: string;
let stub: StubIdentityProvider;

function buildTestApp(mailProvider?: FakeMailProvider) {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({
    db,
    lanes: LANES,
    personFields: PERSON_FIELDS,
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

async function createPersonViaApi(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function createPerson(args: Record<string, unknown>) {
  return client.callTool({ name: 'create-person', arguments: args });
}

async function getPerson(personId: number) {
  return client.callTool({ name: 'get-person', arguments: { personId } });
}

async function emailsForPerson(personId: number) {
  return client.callTool({ name: 'emails-for-person', arguments: { personId } });
}

async function addContactEntry(args: Record<string, unknown>) {
  return client.callTool({ name: 'add-contact-entry', arguments: args });
}

async function markContactPrimary(args: Record<string, unknown>) {
  return client.callTool({ name: 'mark-contact-primary', arguments: args });
}

async function removeContactEntry(args: Record<string, unknown>) {
  return client.callTool({ name: 'remove-contact-entry', arguments: args });
}

async function listUnlinked() {
  return client.callTool({ name: 'list-unlinked-addresses' });
}

async function updatePerson(args: Record<string, unknown>) {
  return client.callTool({ name: 'update-person', arguments: args });
}

async function personEmailsViaApi(personId: number): Promise<{ id: number; value: string; isPrimary: boolean }[]> {
  const response = await app.inject({ method: 'GET', url: `/api/people/${personId}` });
  return response.json().emails;
}

function seedMessage(overrides: Partial<SeedMessage> & { from: SeedMessage['from'] }): SeedMessage {
  return {
    id: `msg-${overrides.from?.address}-${Math.random()}`,
    conversationId: `conv-${overrides.from?.address}-${Math.random()}`,
    subject: 'Hello',
    body: { content: 'hi', contentType: 'text' },
    receivedDateTime: '2026-08-06T09:00:00Z',
    sentDateTime: '2026-08-06T09:00:00Z',
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    ...overrides,
  };
}

function quoteAttached(toAddress: string, toName: string): SeedMessage {
  return {
    id: 'msg-quote-attached',
    conversationId: 'conv-quote-attached',
    subject: 'Quote attached',
    body: { content: 'See attached.', contentType: 'text' },
    receivedDateTime: '2026-08-06T09:01:00Z',
    sentDateTime: '2026-08-06T09:00:00Z',
    from: { address: toAddress, name: toName },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('US1: create-person', () => {
  it('creates a fully populated person (AS1)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createPerson({
      firstName: 'Jordan',
      lastName: 'Smith',
      email: 'jordan.smith@example.com',
      phone: '555-0150',
      extraFields: { Nickname: 'Jo' },
    });

    expect(result.isError).toBeFalsy();
    expect((result.content as { text: string }[])[0]?.text).toBe('Created person "Jordan Smith".');

    const person = result.structuredContent as {
      id: number;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      emails: { id: number; value: string; isPrimary: boolean }[];
      phones: { id: number; value: string; isPrimary: boolean }[];
      extraFields: Record<string, string>;
      tags: string[];
    };
    expect(person.firstName).toBe('Jordan');
    expect(person.lastName).toBe('Smith');
    expect(person.email).toBe('jordan.smith@example.com');
    expect(person.phone).toBe('555-0150');
    expect(person.emails).toEqual([{ id: expect.any(Number), value: 'jordan.smith@example.com', isPrimary: true }]);
    expect(person.phones).toEqual([{ id: expect.any(Number), value: '555-0150', isPrimary: true }]);
    expect(person.extraFields).toEqual({ Nickname: 'Jo' });
    expect(person.tags).toEqual([]);

    const fetched = await getPerson(person.id);
    expect(fetched.structuredContent).toMatchObject({
      firstName: 'Jordan',
      lastName: 'Smith',
      email: 'jordan.smith@example.com',
      phone: '555-0150',
      extraFields: { Nickname: 'Jo' },
    });
  });

  it('links an existing unlinked synced address instead of duplicating it, bringing its mail history (AS2)', async () => {
    buildTestApp(new FakeMailProvider([quoteAttached('jordan.smith@example.com', 'Jordan Smith')]));
    await startAndConnect();
    await client.callTool({ name: 'sync-emails', arguments: { startDate: '2026-08-01', endDate: '2026-08-08' } });

    const [unlinkedRow] = db.select().from(emailAddresses).where(eq(emailAddresses.value, 'jordan.smith@example.com')).all();
    expect(unlinkedRow?.personId).toBeNull();

    const result = await createPerson({ firstName: 'Jordan', lastName: 'Smith', email: 'jordan.smith@example.com' });
    expect(result.isError).toBeFalsy();
    const person = result.structuredContent as { id: number; emails: { id: number; value: string }[] };
    expect(person.emails[0]!.id).toBe(unlinkedRow!.id);
    expect(person.emails[0]!.value).toBe('jordan.smith@example.com');

    const emails = await emailsForPerson(person.id);
    const { emails: list } = emails.structuredContent as { emails: { subject: string }[] };
    expect(list.map((e) => e.subject)).toContain('Quote attached');
  });

  it('rejects a duplicate email differing only by case, naming the holder, and creates no person (AS3)', async () => {
    buildTestApp();
    const samId = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();

    const before = await client.callTool({ name: 'search-people', arguments: { query: '' } });

    const result = await createPerson({ firstName: 'Other', lastName: 'Person', email: 'Sam.Rivera@example.com' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('That email is already in use by Sam Rivera');

    const after = await client.callTool({ name: 'search-people', arguments: { query: '' } });
    expect(after.structuredContent).toEqual(before.structuredContent);
    expect((await getPerson(samId)).isError).toBeFalsy();
  });

  it('rejects a whitespace-only first name (AS4)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createPerson({ firstName: '   ', lastName: 'Smith' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('First and last name are required');
  });

  it('rejects an unconfigured extra field, naming it, and creates no person (AS4)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createPerson({ firstName: 'Jordan', lastName: 'Smith', extraFields: { 'Favorite Color': 'Blue' } });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toBe('Unknown field "Favorite Color"');

    const search = await client.callTool({ name: 'search-people', arguments: { query: 'Jordan' } });
    expect((search.structuredContent as { people: unknown[] }).people).toEqual([]);
  });

  it('rejects a duplicate phone, naming the holder', async () => {
    buildTestApp();
    await createPersonViaApi({ firstName: 'Ana', lastName: 'Alvarez', phone: '555-0200' });
    await startAndConnect();

    const result = await createPerson({ firstName: 'Sam', lastName: 'Rivera', phone: '555-0200' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('That phone number is already in use by Ana Alvarez');
  });

  it('creates a names-only person with no email or phone (edge case)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createPerson({ firstName: 'Cy', lastName: 'Cole' });

    expect(result.isError).toBeFalsy();
    const person = result.structuredContent as { emails: unknown[]; phones: unknown[]; email: string | null; phone: string | null };
    expect(person.emails).toEqual([]);
    expect(person.phones).toEqual([]);
    expect(person.email).toBeNull();
    expect(person.phone).toBeNull();
  });

  it('rejects an explicitly blank email with "A value is required" (edge case)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createPerson({ firstName: 'Jordan', lastName: 'Smith', email: '   ' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('A value is required');
  });

  it('rejects an explicitly blank phone with "A value is required" (edge case)', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await createPerson({ firstName: 'Jordan', lastName: 'Smith', phone: '' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('A value is required');
  });

  it('cannot be reached without a bearer token — 401, nothing created (research D10)', async () => {
    buildTestApp();
    await startAndConnect();

    const response = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'create-person', arguments: { firstName: 'Jordan', lastName: 'Smith' } },
      }),
    });

    expect(response.status).toBe(401);

    const search = await client.callTool({ name: 'search-people', arguments: { query: 'Jordan' } });
    expect((search.structuredContent as { people: unknown[] }).people).toEqual([]);
  });
});

describe('US3: add-contact-entry / mark-contact-primary / remove-contact-entry', () => {
  it('adds, marks primary, and removes an email entry in sequence, updating exactly one primary throughout (AS1)', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', email: 'jordan.smith@example.com' });
    await startAndConnect();
    const originalId = (await personEmailsViaApi(jordanId))[0]!.id;

    const added = await addContactEntry({ personId: jordanId, type: 'email', value: 'jordan@personal.example.com' });
    expect(added.isError).toBeFalsy();
    expect((added.content as { text: string }[])[0]?.text).toBe('Added email "jordan@personal.example.com" to Jordan Smith.');
    const afterAdd = added.structuredContent as { personId: number; type: string; entries: { id: number; value: string; isPrimary: boolean }[] };
    expect(afterAdd).toMatchObject({ personId: jordanId, type: 'email' });
    expect(afterAdd.entries).toHaveLength(2);
    expect(afterAdd.entries.find((e) => e.id === originalId)).toMatchObject({ isPrimary: true });
    const newEntryId = afterAdd.entries.find((e) => e.value === 'jordan@personal.example.com')!.id;
    expect(afterAdd.entries.find((e) => e.id === newEntryId)).toMatchObject({ isPrimary: false });

    const marked = await markContactPrimary({ personId: jordanId, type: 'email', entryId: newEntryId });
    expect(marked.isError).toBeFalsy();
    const afterMark = marked.structuredContent as { entries: { id: number; isPrimary: boolean }[] };
    expect(afterMark.entries.find((e) => e.id === newEntryId)).toMatchObject({ isPrimary: true });
    expect(afterMark.entries.find((e) => e.id === originalId)).toMatchObject({ isPrimary: false });

    const removed = await removeContactEntry({ personId: jordanId, type: 'email', entryId: originalId });
    expect(removed.isError).toBeFalsy();
    expect((removed.content as { text: string }[])[0]?.text).toBe('Removed email "jordan.smith@example.com" from Jordan Smith.');
    const afterRemove = removed.structuredContent as { entries: { id: number; value: string; isPrimary: boolean }[] };
    expect(afterRemove.entries).toEqual([{ id: newEntryId, value: 'jordan@personal.example.com', isPrimary: true }]);
  });

  it('links an existing unlinked synced address on add, and rejects a duplicate held by another person (AS2)', async () => {
    buildTestApp(new FakeMailProvider([seedMessage({ from: { address: 'ana.alvarez@example.com', name: 'Ana Alvarez' } })]));
    const anaId = await createPersonViaApi({ firstName: 'Ana', lastName: 'Alvarez' });
    await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    await client.callTool({ name: 'sync-emails', arguments: { startDate: '2026-08-01', endDate: '2026-08-08' } });

    const added = await addContactEntry({ personId: anaId, type: 'email', value: 'ana.alvarez@example.com' });
    expect(added.isError).toBeFalsy();
    const afterAdd = added.structuredContent as { entries: { value: string; isPrimary: boolean }[] };
    expect(afterAdd.entries).toEqual([{ id: expect.any(Number), value: 'ana.alvarez@example.com', isPrimary: true }]);

    const emails = await emailsForPerson(anaId);
    const { emails: list } = emails.structuredContent as { emails: { addresses: { address: string; role: string }[] }[] };
    expect(list).toHaveLength(1);
    expect(list[0]!.addresses).toEqual([{ address: 'ana.alvarez@example.com', role: 'from', displayName: 'Ana Alvarez' }]);

    const conflict = await addContactEntry({ personId: anaId, type: 'email', value: 'Sam.Rivera@example.com' });
    expect(conflict.isError).toBe(true);
    expect((conflict.content as { text: string }[])[0]?.text).toBe('That email is already in use by Sam Rivera');
    expect(await personEmailsViaApi(anaId)).toEqual([expect.objectContaining({ value: 'ana.alvarez@example.com' })]);
  });

  it('adds and marks a phone primary, persisting, and rejects a duplicate phone held by another person (AS3)', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', phone: '555-0142' });
    await createPersonViaApi({ firstName: 'Ana', lastName: 'Alvarez', phone: '555-0200' });
    await startAndConnect();

    const added = await addContactEntry({ personId: jordanId, type: 'phone', value: '555-0199' });
    const afterAdd = added.structuredContent as { entries: { id: number; value: string; isPrimary: boolean }[] };
    expect(afterAdd.entries.find((e) => e.value === '555-0142')).toMatchObject({ isPrimary: true });
    const newEntryId = afterAdd.entries.find((e) => e.value === '555-0199')!.id;

    const marked = await markContactPrimary({ personId: jordanId, type: 'phone', entryId: newEntryId });
    const afterMark = marked.structuredContent as { entries: { value: string; isPrimary: boolean }[] };
    expect(afterMark.entries.find((e) => e.value === '555-0199')).toMatchObject({ isPrimary: true });
    expect(afterMark.entries.find((e) => e.value === '555-0142')).toMatchObject({ isPrimary: false });

    const conflict = await addContactEntry({ personId: jordanId, type: 'phone', value: '555-0200' });
    expect(conflict.isError).toBe(true);
    expect((conflict.content as { text: string }[])[0]?.text).toBe('That phone number is already in use by Ana Alvarez');
  });

  it('adding a value the target person already holds fails, naming that same person as the holder (edge case)', async () => {
    buildTestApp();
    const samId = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();

    const result = await addContactEntry({ personId: samId, type: 'email', value: 'Sam.Rivera@example.com' });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toBe('That email is already in use by Sam Rivera');
  });

  it('marking the current primary again succeeds as a no-op', async () => {
    buildTestApp();
    const samId = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    const entryId = (await personEmailsViaApi(samId))[0]!.id;

    const result = await markContactPrimary({ personId: samId, type: 'email', entryId });

    expect(result.isError).toBeFalsy();
    const { entries } = result.structuredContent as { entries: { id: number; isPrimary: boolean }[] };
    expect(entries).toEqual([{ id: entryId, value: 'sam.rivera@example.com', isPrimary: true }]);
  });

  it('promotes the lowest-id remaining entry when the primary is removed (edge case)', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', email: 'a@example.com' });
    const firstId = (await personEmailsViaApi(jordanId))[0]!.id;
    await startAndConnect();
    const afterB = await addContactEntry({ personId: jordanId, type: 'email', value: 'b@example.com' });
    const bId = (afterB.structuredContent as { entries: { id: number; value: string }[] }).entries.find((e) => e.value === 'b@example.com')!.id;
    await addContactEntry({ personId: jordanId, type: 'email', value: 'c@example.com' });

    const removed = await removeContactEntry({ personId: jordanId, type: 'email', entryId: firstId });

    const { entries } = removed.structuredContent as { entries: { id: number; value: string; isPrimary: boolean }[] };
    expect(entries.find((e) => e.id === bId)).toMatchObject({ isPrimary: true });
    expect(entries.filter((e) => e.isPrimary)).toHaveLength(1);
  });

  it('removing the last entry of a type is valid and leaves none', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', phone: '555-0142' });
    await startAndConnect();
    const entryId = (await app.inject({ method: 'GET', url: `/api/people/${jordanId}` })).json().phones[0].id;

    const result = await removeContactEntry({ personId: jordanId, type: 'phone', entryId });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { entries: unknown[] }).entries).toEqual([]);
  });

  it('reverts a mail-referenced address to unlinked on removal — mail is untouched and it reappears in discovery', async () => {
    buildTestApp(new FakeMailProvider([seedMessage({ from: { address: 'someone@example.com', name: 'Someone' } })]));
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', email: 'someone@example.com' });
    await startAndConnect();
    await client.callTool({ name: 'sync-emails', arguments: { startDate: '2026-08-01', endDate: '2026-08-08' } });
    const entryId = (await personEmailsViaApi(jordanId))[0]!.id;

    const before = await emailsForPerson(jordanId);
    expect((before.structuredContent as { emails: unknown[] }).emails).toHaveLength(1);

    const removed = await removeContactEntry({ personId: jordanId, type: 'email', entryId });
    expect(removed.isError).toBeFalsy();
    expect((removed.structuredContent as { entries: unknown[] }).entries).toEqual([]);

    const after = await emailsForPerson(jordanId);
    expect((after.structuredContent as { emails: unknown[] }).emails).toEqual([]);

    const unlinked = await listUnlinked();
    const { addresses } = unlinked.structuredContent as { addresses: { address: string }[] };
    expect(addresses.map((a) => a.address)).toContain('someone@example.com');
  });

  it('rejects a blank value on add with "A value is required"', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith' });
    await startAndConnect();

    const result = await addContactEntry({ personId: jordanId, type: 'email', value: '   ' });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toBe('A value is required');
  });

  it('errors with "Person N not found" for an unknown person on add/mark/remove', async () => {
    buildTestApp();
    await startAndConnect();

    const addResult = await addContactEntry({ personId: 42, type: 'email', value: 'x@example.com' });
    expect((addResult.content as { text: string }[])[0]?.text).toBe('Person 42 not found');

    const markResult = await markContactPrimary({ personId: 42, type: 'email', entryId: 1 });
    expect((markResult.content as { text: string }[])[0]?.text).toBe('Person 42 not found');

    const removeResult = await removeContactEntry({ personId: 42, type: 'email', entryId: 1 });
    expect((removeResult.content as { text: string }[])[0]?.text).toBe('Person 42 not found');
  });

  it('errors with "Entry N not found" for an unknown entry id, or one belonging to a different person', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', email: 'jordan.smith@example.com' });
    const anaId = await createPersonViaApi({ firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com' });
    await startAndConnect();
    const anaEntryId = (await personEmailsViaApi(anaId))[0]!.id;

    const unknown = await markContactPrimary({ personId: jordanId, type: 'email', entryId: 999999 });
    expect((unknown.content as { text: string }[])[0]?.text).toBe('Entry 999999 not found');

    const wrongOwner = await removeContactEntry({ personId: jordanId, type: 'email', entryId: anaEntryId });
    expect((wrongOwner.content as { text: string }[])[0]?.text).toBe(`Entry ${anaEntryId} not found`);
  });
});

describe('US4: update-person', () => {
  it('edits the last name and an extra field, leaving the first name untouched (AS1)', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', extraFields: { Nickname: 'Jo' } });
    await startAndConnect();

    const result = await updatePerson({ personId: jordanId, lastName: 'Smith-Lee', extraFields: { Nickname: 'JS' } });

    expect(result.isError).toBeFalsy();
    expect((result.content as { text: string }[])[0]?.text).toBe('Updated person "Jordan Smith-Lee".');
    const person = result.structuredContent as { firstName: string; lastName: string; extraFields: Record<string, string> };
    expect(person.firstName).toBe('Jordan');
    expect(person.lastName).toBe('Smith-Lee');
    expect(person.extraFields).toMatchObject({ Nickname: 'JS' });
  });

  it('rejects a blank or whitespace-only name, leaving the person unchanged (AS2)', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith' });
    await startAndConnect();

    const blank = await updatePerson({ personId: jordanId, lastName: '' });
    expect(blank.isError).toBe(true);
    expect((blank.content as { text: string }[])[0]?.text).toBe('First and last name are required');

    const whitespace = await updatePerson({ personId: jordanId, firstName: '   ' });
    expect(whitespace.isError).toBe(true);
    expect((whitespace.content as { text: string }[])[0]?.text).toBe('First and last name are required');

    const fetched = await getPerson(jordanId);
    expect(fetched.structuredContent).toMatchObject({ firstName: 'Jordan', lastName: 'Smith' });
  });

  it('rejects an unconfigured extra field, leaving the person unchanged', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith' });
    await startAndConnect();

    const result = await updatePerson({ personId: jordanId, extraFields: { 'Favorite Color': 'Blue' } });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toBe('Unknown field "Favorite Color"');
    const fetched = await getPerson(jordanId);
    expect(fetched.structuredContent).toMatchObject({ firstName: 'Jordan', lastName: 'Smith' });
  });

  it('merges provided extraFields keys over current ones — omitted keys survive, an empty string clears a field', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', extraFields: { Nickname: 'Jo', Company: 'Acme' } });
    await startAndConnect();

    const first = await updatePerson({ personId: jordanId, extraFields: { Nickname: 'JS' } });
    expect((first.structuredContent as { extraFields: Record<string, string> }).extraFields).toEqual({ Nickname: 'JS', Company: 'Acme' });

    const second = await updatePerson({ personId: jordanId, extraFields: { Company: '' } });
    expect((second.structuredContent as { extraFields: Record<string, string> }).extraFields).toEqual({ Nickname: 'JS' });
  });

  it('a call providing only personId is a valid no-op returning the current person', async () => {
    buildTestApp();
    const jordanId = await createPersonViaApi({ firstName: 'Jordan', lastName: 'Smith', extraFields: { Nickname: 'Jo' } });
    await startAndConnect();

    const result = await updatePerson({ personId: jordanId });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ firstName: 'Jordan', lastName: 'Smith', extraFields: { Nickname: 'Jo' } });
  });

  it('errors with "Person N not found" for an unknown person', async () => {
    buildTestApp();
    await startAndConnect();

    const result = await updatePerson({ personId: 42, firstName: 'Someone' });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toBe('Person 42 not found');
  });
});

describe('Parity boundary (FR-013, FR-020): the agent tool surface grants no power the UI lacks', () => {
  it('registers no tool that deletes a person or edits an email/phone value in place', async () => {
    buildTestApp();
    await startAndConnect();

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('create-person');
    expect(names).toContain('update-person');
    expect(names).toContain('add-contact-entry');
    expect(names).toContain('mark-contact-primary');
    expect(names).toContain('remove-contact-entry');
    expect(names).toContain('list-unlinked-addresses');
    expect(names).not.toContain('delete-person');
    expect(names).not.toContain('edit-contact-entry');
    expect(names).not.toContain('update-contact-entry');
    expect(names).not.toContain('edit-person-email');
    expect(names).not.toContain('edit-person-phone');
  });
});
