import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailAddresses, emailMessages } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { connectThroughPasswordGate } from './helpers/oauth-client.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const PASSWORD = 'correct-horse-battery';

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client;
let serverUrl: string;

function buildTestApp(mailProvider: FakeMailProvider) {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, connectorPassword: PASSWORD, mailProvider });
}

async function startAndConnect(): Promise<void> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;

  const provider = await connectThroughPasswordGate(`${serverUrl}/mcp`, PASSWORD);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
}

async function syncEmails(startDate: string, endDate: string) {
  return client.callTool({ name: 'sync-emails', arguments: { startDate, endDate } });
}

async function getConversation(conversationId: number) {
  return client.callTool({ name: 'get-conversation', arguments: { conversationId } });
}

async function emailsForPerson(args: Record<string, unknown>) {
  return client.callTool({ name: 'emails-for-person', arguments: args });
}

async function createPerson(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function addEmail(personId: number, value: string) {
  return app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value } });
}

function pricingWithCc(): SeedMessage {
  return {
    id: 'msg-pricing-1',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-07-10T18:00:00Z',
    sentDateTime: '2026-07-10T18:00:00Z',
    from: { address: 'Sam.Rivera@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [{ address: 'ana.alvarez@example.com' }],
    bccRecipients: [],
    folder: 'inbox',
  };
}

afterEach(async () => {
  await client.close();
  await app.close();
});

describe('US3: connect synced email to people', () => {
  it('links a case-different from-address to the tracked person while an unmatched cc address stays unlinked (AS1)', async () => {
    buildTestApp(new FakeMailProvider([pricingWithCc()]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const [message] = db.select().from(emailMessages).all();
    const result = await getConversation(message!.conversationId);

    expect(result.isError).toBeFalsy();
    const conversation = result.structuredContent as {
      messages: { participants: { address: string; role: string; person: { id: number; name: string } | null }[] }[];
    };
    const [first] = conversation.messages;
    const fromParticipant = first!.participants.find((p) => p.role === 'from')!;
    expect(fromParticipant.person).toEqual({ id: sam, name: 'Sam Rivera' });
    const ccParticipant = first!.participants.find((p) => p.role === 'cc')!;
    expect(ccParticipant.person).toBeNull();
    expect(ccParticipant.address).toBe('ana.alvarez@example.com');
  });

  it('links an existing unlinked address on add, and previously synced mail immediately counts as the person\'s correspondence (AS2)', async () => {
    buildTestApp(new FakeMailProvider([pricingWithCc()]));
    const ana = await createPerson({ firstName: 'Ana', lastName: 'Alvarez' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const response = await addEmail(ana, 'ana.alvarez@example.com');
    expect(response.statusCode).toBe(201);
    const entries = response.json().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ value: 'ana.alvarez@example.com', isPrimary: true });

    const result = await emailsForPerson({ personId: ana });
    expect(result.isError).toBeFalsy();
    const { emails } = result.structuredContent as {
      emails: { subject: string; addresses: { address: string; role: string }[] }[];
    };
    expect(emails).toHaveLength(1);
    expect(emails[0]!.subject).toBe('Pricing question');
    expect(emails[0]!.addresses).toEqual([{ address: 'ana.alvarez@example.com', role: 'cc' }]);
  });

  it('rejects adding an email already owned by another person, leaving the record unchanged (AS3)', async () => {
    buildTestApp(new FakeMailProvider([]));
    await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    const ana = await createPerson({ firstName: 'Ana', lastName: 'Alvarez' });
    await startAndConnect();

    const response = await addEmail(ana, 'sam.rivera@example.com');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${ana}` });
    expect(fetched.json().emails).toEqual([]);
  });

  it("returns every synced email across a person's addresses, each tagged with that address's role (AS4)", async () => {
    const fromSam: SeedMessage = pricingWithCc();
    const toSamPersonal: SeedMessage = {
      id: 'msg-personal-1',
      conversationId: 'conv-personal',
      subject: 'Weekend plans',
      body: { content: 'See you Saturday.', contentType: 'text' },
      receivedDateTime: '2026-07-12T18:00:00Z',
      sentDateTime: '2026-07-12T18:00:00Z',
      from: { address: 'friend@example.com' },
      toRecipients: [{ address: 'sam.personal@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    };
    buildTestApp(new FakeMailProvider([fromSam, toSamPersonal]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    await addEmail(sam, 'sam.personal@example.com');
    await syncEmails('2026-07-01', '2026-07-31');

    const result = await emailsForPerson({ personId: sam });
    expect(result.isError).toBeFalsy();
    const { emails } = result.structuredContent as {
      emails: { subject: string; addresses: { address: string; role: string }[] }[];
    };
    expect(emails).toHaveLength(2);
    const pricing = emails.find((e) => e.subject === 'Pricing question')!;
    expect(pricing.addresses).toEqual([{ address: 'sam.rivera@example.com', role: 'from' }]);
    const personal = emails.find((e) => e.subject === 'Weekend plans')!;
    expect(personal.addresses).toEqual([{ address: 'sam.personal@example.com', role: 'to' }]);
  });

  it('rejects editing an entry to a value that already exists as an unlinked synced record', async () => {
    const unknownSender: SeedMessage = {
      id: 'msg-unknown-1',
      conversationId: 'conv-unknown',
      subject: 'Hi',
      body: { content: 'hello', contentType: 'text' },
      receivedDateTime: '2026-07-10T18:00:00Z',
      sentDateTime: '2026-07-10T18:00:00Z',
      from: { address: 'unknown.person@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    };
    buildTestApp(new FakeMailProvider([unknownSender]));
    const ana = await createPerson({ firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const before = await app.inject({ method: 'GET', url: `/api/people/${ana}` });
    const entryId = before.json().emails[0].id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/people/${ana}/emails/${entryId}`,
      payload: { value: 'unknown.person@example.com' },
    });

    expect(response.statusCode).toBe(409);
    const after = await app.inject({ method: 'GET', url: `/api/people/${ana}` });
    expect(after.json().emails[0]).toMatchObject({ value: 'ana.alvarez@example.com' });
  });

  it('unlinks a participant-referenced address on remove but fully deletes an unreferenced one', async () => {
    buildTestApp(new FakeMailProvider([pricingWithCc()]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await addEmail(sam, 'sam.other@example.com');
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const before = await app.inject({ method: 'GET', url: `/api/people/${sam}` });
    const referencedId = before.json().emails.find((e: { value: string }) => e.value === 'sam.rivera@example.com').id;
    const unreferencedId = before.json().emails.find((e: { value: string }) => e.value === 'sam.other@example.com').id;

    await app.inject({ method: 'DELETE', url: `/api/people/${sam}/emails/${referencedId}` });
    await app.inject({ method: 'DELETE', url: `/api/people/${sam}/emails/${unreferencedId}` });

    const referencedRow = db.select().from(emailAddresses).where(eq(emailAddresses.value, 'sam.rivera@example.com')).all();
    expect(referencedRow).toHaveLength(1);
    expect(referencedRow[0]?.personId).toBeNull();

    const unreferencedRow = db.select().from(emailAddresses).where(eq(emailAddresses.value, 'sam.other@example.com')).all();
    expect(unreferencedRow).toHaveLength(0);
  });

  it('applies the same unlink-or-delete rule to each address on person delete', async () => {
    buildTestApp(new FakeMailProvider([pricingWithCc()]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await addEmail(sam, 'sam.other@example.com');
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/people/${sam}` });
    expect(deleteResponse.statusCode).toBe(204);

    const referencedRow = db.select().from(emailAddresses).where(eq(emailAddresses.value, 'sam.rivera@example.com')).all();
    expect(referencedRow).toHaveLength(1);
    expect(referencedRow[0]?.personId).toBeNull();

    const unreferencedRow = db.select().from(emailAddresses).where(eq(emailAddresses.value, 'sam.other@example.com')).all();
    expect(unreferencedRow).toHaveLength(0);
  });

  it('never surfaces an unlinked address in People API responses', async () => {
    buildTestApp(new FakeMailProvider([pricingWithCc()]));
    const ana = await createPerson({ firstName: 'Ana', lastName: 'Alvarez' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${ana}` });
    expect(fetched.json().emails).toEqual([]);

    const list = await app.inject({ method: 'GET', url: '/api/people?q=ana.alvarez' });
    expect(list.json()).toEqual([]);
  });

  it('sets is_primary on link only when the person had no prior email', async () => {
    buildTestApp(new FakeMailProvider([pricingWithCc()]));
    const ana = await createPerson({ firstName: 'Ana', lastName: 'Alvarez', email: 'ana.primary@example.com' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const response = await addEmail(ana, 'ana.alvarez@example.com');
    expect(response.statusCode).toBe(201);
    const entries = response.json().entries as { value: string; isPrimary: boolean }[];
    expect(entries.find((e) => e.value === 'ana.primary@example.com')).toMatchObject({ isPrimary: true });
    expect(entries.find((e) => e.value === 'ana.alvarez@example.com')).toMatchObject({ isPrimary: false });
  });

  it('errors with "Person N not found" for an unknown personId', async () => {
    buildTestApp(new FakeMailProvider([]));
    await startAndConnect();

    const result = await emailsForPerson({ personId: 999999 });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Person 999999 not found');
  });

  it('rejects an invalid cursor with a tool error', async () => {
    buildTestApp(new FakeMailProvider([]));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();

    const result = await emailsForPerson({ personId: sam, cursor: 'not-a-valid-cursor' });

    expect(result.isError).toBe(true);
  });

  it('returns an empty list (not an error) for a person with no addresses or no involved mail', async () => {
    buildTestApp(new FakeMailProvider([]));
    const cy = await createPerson({ firstName: 'Cy', lastName: 'Cole' });
    await startAndConnect();

    const result = await emailsForPerson({ personId: cy });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { emails: unknown[] }).emails).toEqual([]);
  });

  it('pages emails-for-person with keyset cursors — every email exactly once', async () => {
    const messages: SeedMessage[] = Array.from({ length: 3 }, (_, i) => ({
      id: `msg-page-${i}`,
      conversationId: `conv-page-${i}`,
      subject: `Message ${i}`,
      body: { content: 'hi', contentType: 'text' },
      receivedDateTime: `2026-07-0${i + 1}T18:00:00Z`,
      sentDateTime: `2026-07-0${i + 1}T18:00:00Z`,
      from: { address: 'sam.rivera@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    }));
    buildTestApp(new FakeMailProvider(messages));
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await startAndConnect();
    await syncEmails('2026-07-01', '2026-07-31');

    const seen = new Set<number>();
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await emailsForPerson({ personId: sam, limit: 1, cursor });
      const content = result.structuredContent as { emails: { messageId: number }[]; nextCursor: string | null };
      for (const email of content.emails) {
        expect(seen.has(email.messageId)).toBe(false);
        seen.add(email.messageId);
      }
      if (!content.nextCursor) break;
      cursor = content.nextCursor;
    }
    expect(seen.size).toBe(3);
  });
});
