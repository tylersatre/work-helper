import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailAddresses, emailAttachments, emailConversations, emailMessages, emailParticipants } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import type { MailProvider } from '../../src/server/services/email/provider.js';
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

function oldThread(): SeedMessage {
  return {
    id: 'msg-old-1',
    conversationId: 'conv-old',
    subject: 'Old thread',
    body: { content: 'ancient', contentType: 'text' },
    receivedDateTime: '2026-05-01T16:00:00Z',
    sentDateTime: '2026-05-01T16:00:00Z',
    from: { address: 'someone@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function invoiceAttached(): SeedMessage {
  return {
    id: 'msg-invoice-1',
    conversationId: 'conv-invoice',
    subject: 'Invoice attached',
    body: { content: 'See attached.', contentType: 'text' },
    receivedDateTime: '2026-08-02T16:00:00Z',
    sentDateTime: '2026-08-02T16:00:00Z',
    from: { address: 'billing@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function buildTestApp(mailProvider: MailProvider) {
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

async function syncEmails(startDate: string | undefined, endDate: string | undefined) {
  const args: Record<string, unknown> = {};
  if (startDate !== undefined) args.startDate = startDate;
  if (endDate !== undefined) args.endDate = endDate;
  return client.callTool({ name: 'sync-emails', arguments: args });
}

async function listConversations(args: Record<string, unknown> = {}) {
  return client.callTool({ name: 'list-conversations', arguments: args });
}

function allMessages() {
  return db.select().from(emailMessages).all();
}

function allConversations() {
  return db.select().from(emailConversations).all();
}

function participantsFor(messageId: number) {
  return db
    .select({ role: emailParticipants.role, address: emailAddresses.value })
    .from(emailParticipants)
    .innerJoin(emailAddresses, eq(emailParticipants.addressId, emailAddresses.id))
    .where(eq(emailParticipants.messageId, messageId))
    .all();
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('US1: sync-emails', () => {
  it('pulls only in-range Inbox+Sent messages, reports the count, and groups the Sent reply into the Inbox conversation (AS1)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), lunchThursday(), pricingReply(), oldThread()]));
    await startAndConnect();

    const result = await syncEmails('2026-07-01', '2026-07-31');

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ status: 'complete', syncedCount: 3, updatedCount: 0 });

    const messages = allMessages();
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.graphMessageId).sort()).toEqual(['msg-lunch-1', 'msg-pricing-1', 'msg-pricing-2'].sort());

    const conversations = allConversations();
    expect(conversations).toHaveLength(2);
    const pricingConv = conversations.find((c) => c.graphConversationId === 'conv-pricing')!;
    const pricingMessages = messages.filter((m) => m.conversationId === pricingConv.id);
    expect(pricingMessages).toHaveLength(2);
  });

  it('overlapping re-run stores only the new message and leaves prior conversations unchanged (AS2)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), lunchThursday(), pricingReply(), oldThread(), invoiceAttached()]));
    await startAndConnect();

    await syncEmails('2026-07-01', '2026-07-31');
    const second = await syncEmails('2026-07-15', '2026-08-05');

    expect(second.isError).toBeFalsy();
    expect(second.structuredContent).toEqual({ status: 'complete', syncedCount: 1, updatedCount: 0 });

    const messages = allMessages();
    expect(messages).toHaveLength(4);
    expect(messages.filter((m) => m.graphMessageId === 'msg-invoice-1')).toHaveLength(1);

    const conversations = allConversations();
    const pricingConv = conversations.find((c) => c.graphConversationId === 'conv-pricing')!;
    expect(messages.filter((m) => m.conversationId === pricingConv.id)).toHaveLength(2);
  });

  it('rejects a call missing the date range with a validation error and stores nothing (AS3)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();

    const missingBoth = await syncEmails(undefined, undefined);
    expect(missingBoth.isError).toBe(true);
    expect(JSON.stringify(missingBoth.content)).toMatch(/start date and end date/i);

    const missingEnd = await syncEmails('2026-07-01', undefined);
    expect(missingEnd.isError).toBe(true);

    expect(allMessages()).toHaveLength(0);
  });

  it('rejects a range where start is after end, same as a missing range', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));
    await startAndConnect();

    const result = await syncEmails('2026-07-31', '2026-07-01');

    expect(result.isError).toBe(true);
    expect(allMessages()).toHaveLength(0);
  });

  it('keeps a synced message unchanged after it is deleted from the mailbox (AS4)', async () => {
    const provider = new FakeMailProvider([pricingQuestion(), lunchThursday(), pricingReply(), oldThread()]);
    buildTestApp(provider);
    await startAndConnect();

    await syncEmails('2026-07-01', '2026-07-31');
    expect(allMessages().find((m) => m.graphMessageId === 'msg-lunch-1')).toBeDefined();

    app.mailProvider = new FakeMailProvider([pricingQuestion(), pricingReply(), oldThread()]);
    const rerun = await syncEmails('2026-07-01', '2026-07-31');

    expect(rerun.structuredContent).toEqual({ status: 'complete', syncedCount: 0, updatedCount: 0 });
    const lunchMessage = allMessages().find((m) => m.graphMessageId === 'msg-lunch-1');
    expect(lunchMessage).toBeDefined();
    expect(lunchMessage?.subject).toBe('Lunch Thursday');
  });

  it('stores a message with an empty body and blank subject as-is', async () => {
    const blank: SeedMessage = {
      id: 'msg-blank-1',
      conversationId: 'conv-blank',
      subject: '',
      body: { content: '', contentType: 'text' },
      receivedDateTime: '2026-07-05T18:00:00Z',
      sentDateTime: '2026-07-05T18:00:00Z',
      from: { address: 'someone@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    };
    buildTestApp(new FakeMailProvider([blank]));
    await startAndConnect();

    await syncEmails('2026-07-01', '2026-07-31');

    const [stored] = allMessages();
    expect(stored?.subject).toBe('');
    expect(stored?.bodyOriginal).toBe('');
    expect(stored?.bodyText).toBe('');
  });

  it('records the same address in two roles on one message as two participant rows', async () => {
    const doubled: SeedMessage = {
      id: 'msg-doubled-1',
      conversationId: 'conv-doubled',
      subject: 'FYI',
      body: { content: 'see cc', contentType: 'text' },
      receivedDateTime: '2026-07-06T18:00:00Z',
      sentDateTime: '2026-07-06T18:00:00Z',
      from: { address: 'someone@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [{ address: 'tyler@example.com' }],
      bccRecipients: [],
      folder: 'inbox',
    };
    buildTestApp(new FakeMailProvider([doubled]));
    await startAndConnect();

    await syncEmails('2026-07-01', '2026-07-31');

    const [stored] = allMessages();
    const participants = participantsFor(stored!.id);
    const tylerRows = participants.filter((p) => p.address === 'tyler@example.com');
    expect(tylerRows).toHaveLength(2);
    expect(tylerRows.map((p) => p.role).sort()).toEqual(['cc', 'to']);
  });

  it('stores a Sent message bcc recipient with role "bcc"', async () => {
    buildTestApp(new FakeMailProvider([pricingReply()]));
    await startAndConnect();

    await syncEmails('2026-07-01', '2026-07-31');

    const [stored] = allMessages();
    const participants = participantsFor(stored!.id);
    expect(participants).toContainEqual({ role: 'bcc', address: 'ana.alvarez@example.com' });
  });

  it('reports a connection error and leaves the store unchanged when the mailbox is unreachable', async () => {
    buildTestApp(new FakeMailProvider([], { failImmediately: true }));
    await startAndConnect();

    const result = await syncEmails('2026-07-01', '2026-07-31');

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/mail:signin/);
    expect(allMessages()).toHaveLength(0);
  });

  it('keeps partial progress and reports "interrupted" when the connection drops mid-run, then completes on re-run without duplicates', async () => {
    const allSeeded = [pricingQuestion(), lunchThursday(), pricingReply()];
    buildTestApp(new FakeMailProvider(allSeeded, { pageSize: 1, throwAfterMessageCount: 2 }));
    await startAndConnect();

    const interrupted = await syncEmails('2026-07-01', '2026-07-31');

    expect(interrupted.isError).toBeFalsy();
    const interruptedContent = interrupted.structuredContent as { status: string; syncedCount: number; updatedCount: number; error?: string };
    expect(interruptedContent.status).toBe('interrupted');
    expect(interruptedContent.syncedCount).toBe(2);
    expect(interruptedContent.updatedCount).toBe(0);
    expect(typeof interruptedContent.error).toBe('string');
    expect(allMessages()).toHaveLength(2);

    app.mailProvider = new FakeMailProvider(allSeeded);
    const completed = await syncEmails('2026-07-01', '2026-07-31');

    expect(completed.structuredContent).toEqual({ status: 'complete', syncedCount: 1, updatedCount: 0 });
    expect(allMessages()).toHaveLength(3);
    const graphIds = allMessages().map((m) => m.graphMessageId);
    expect(new Set(graphIds).size).toBe(3);
  });
});

describe('US1: sync-emails records run history through the shared coordinator', () => {
  interface RunSummary {
    id: number;
    source: string;
    status: string;
    newCount: number;
    updatedCount: number;
    error: string | null;
  }

  async function getRuns(): Promise<RunSummary[]> {
    const response = await app.inject({ method: 'GET', url: '/api/email-sync/runs' });
    return (response.json() as { runs: RunSummary[] }).runs;
  }

  it('records an executed run with source "mcp" and its counts (US1 scenario 6, FR-007)', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion(), lunchThursday()]));
    await startAndConnect();

    await syncEmails('2026-07-01', '2026-07-31');

    const runs = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ source: 'mcp', status: 'success', newCount: 2, updatedCount: 0, error: null });
  });

  it('rejects a tool call arriving while a sync is active with "A sync is already running" and records nothing for it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    class GatedProvider implements MailProvider {
      async listFolders() {
        return [{ id: 'inbox', name: 'Inbox', wellKnown: 'inbox' as const, children: [] }];
      }

      async *fetchMessages(): AsyncIterable<never[]> {
        markStarted();
        await gate;
        yield [];
      }

      async fetchAttachmentMetadata() {
        return [];
      }
    }
    buildTestApp(new GatedProvider());
    await startAndConnect();

    const firstPromise = syncEmails('2026-07-01', '2026-07-31');
    await started;

    const second = await syncEmails('2026-07-01', '2026-07-31');
    expect(second.isError).toBe(true);
    expect(JSON.stringify(second.content)).toMatch(/already running/i);

    release();
    await firstPromise;

    const runs = await getRuns();
    expect(runs).toHaveLength(1);
  });

  it('records a failure run when the mailbox is unreachable, alongside the existing tool-error response', async () => {
    buildTestApp(new FakeMailProvider([], { failImmediately: true }));
    await startAndConnect();

    const result = await syncEmails('2026-07-01', '2026-07-31');
    expect(result.isError).toBe(true);

    const runs = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ source: 'mcp', status: 'failure' });
    expect(typeof runs[0]!.error).toBe('string');
  });
});

describe('US2: full metadata capture', () => {
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
      importance: 'high',
      flagStatus: 'flagged',
      categories: ['Orange category'],
      webLink: 'https://outlook.office.com/mail/msg-quote-1',
      internetMessageId: '<msg-quote-1@example.com>',
      attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 }],
    };
  }

  it('stores every FR-009 field for a fully-populated message (US2 scenario 1)', async () => {
    buildTestApp(new FakeMailProvider([quoteAttached()]));
    await startAndConnect();

    await syncEmails('2026-08-01', '2026-08-08');

    const [stored] = allMessages();
    expect(stored).toMatchObject({
      subject: 'Quote attached',
      sourceFolder: 'Inbox',
      isRead: false,
      importance: 'high',
      flagStatus: 'flagged',
      categories: ['Orange category'],
      webLink: 'https://outlook.office.com/mail/msg-quote-1',
      internetMessageId: '<msg-quote-1@example.com>',
    });
    expect(stored!.sentAt).toBe(Date.parse('2026-08-06T09:00:00Z'));
    expect(stored!.receivedAt).toBe(Date.parse('2026-08-06T09:01:00Z'));

    const participants = db
      .select({ role: emailParticipants.role, address: emailAddresses.value, displayName: emailParticipants.displayName })
      .from(emailParticipants)
      .innerJoin(emailAddresses, eq(emailParticipants.addressId, emailAddresses.id))
      .where(eq(emailParticipants.messageId, stored!.id))
      .all();
    expect(participants).toContainEqual({ role: 'from', address: 'sam.rivera@example.com', displayName: 'Sam Rivera' });
    expect(participants).toContainEqual({ role: 'to', address: 'tyler@example.com', displayName: 'Tyler Satre' });

    const attachments = db.select().from(emailAttachments).where(eq(emailAttachments.messageId, stored!.id)).all();
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 });
  });

  it('syncs a message with no attachments, normal importance, no flag, no categories, and an address-only sender cleanly (FR-011)', async () => {
    const plain: SeedMessage = {
      id: 'msg-plain-1',
      conversationId: 'conv-plain',
      subject: 'Just checking in',
      body: { content: 'Hi', contentType: 'text' },
      receivedDateTime: '2026-08-06T09:01:00Z',
      sentDateTime: '2026-08-06T09:00:00Z',
      from: { address: 'someone@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    };
    buildTestApp(new FakeMailProvider([plain]));
    await startAndConnect();

    await syncEmails('2026-08-01', '2026-08-08');

    const [stored] = allMessages();
    expect(stored).toMatchObject({
      importance: 'normal',
      flagStatus: 'notFlagged',
      categories: [],
      webLink: '',
      internetMessageId: '',
    });

    const attachments = db.select().from(emailAttachments).where(eq(emailAttachments.messageId, stored!.id)).all();
    expect(attachments).toHaveLength(0);

    const participants = db
      .select({ displayName: emailParticipants.displayName })
      .from(emailParticipants)
      .where(eq(emailParticipants.messageId, stored!.id))
      .all();
    expect(participants.every((p) => p.displayName === '')).toBe(true);
  });
});

describe('US3: sync all meaningful folders', () => {
  function folderMessage(id: string, subject: string, folder: string): SeedMessage {
    return {
      id,
      conversationId: `conv-${id}`,
      subject,
      body: { content: subject, contentType: 'text' },
      receivedDateTime: '2026-08-06T12:00:00Z',
      sentDateTime: '2026-08-06T12:00:00Z',
      from: { address: 'someone@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder,
    };
  }

  it('covers Inbox, Archive, and custom folders while excluding Junk/Drafts/Deleted Items (US3 scenario 1)', async () => {
    const seeds = [
      folderMessage('msg-hello', 'Hello', 'inbox'),
      folderMessage('msg-board', 'Board minutes', 'archive'),
      folderMessage('msg-survey', 'Site survey', 'Projects'),
      folderMessage('msg-prize', 'You won a prize', 'junk'),
      folderMessage('msg-draft', 'Half-written', 'drafts'),
      folderMessage('msg-old', 'Old news', 'deleted items'),
    ];
    buildTestApp(new FakeMailProvider(seeds));
    await startAndConnect();

    const result = await syncEmails('2026-08-01', '2026-08-08');
    expect(result.structuredContent).toMatchObject({ status: 'complete', syncedCount: 3 });

    const stored = allMessages();
    expect(stored).toHaveLength(3);
    const bySubject = new Map(stored.map((m) => [m.subject, m.sourceFolder]));
    expect(bySubject.get('Hello')).toBe('Inbox');
    expect(bySubject.get('Board minutes')).toBe('Archive');
    expect(bySubject.get('Site survey')).toBe('Projects');
    expect(bySubject.has('You won a prize')).toBe(false);
    expect(bySubject.has('Half-written')).toBe(false);
    expect(bySubject.has('Old news')).toBe(false);

    const listed = await listConversations();
    const { conversations } = listed.structuredContent as { conversations: { subject: string }[] };
    const subjects = conversations.map((c) => c.subject);
    expect(subjects).toEqual(expect.arrayContaining(['Hello', 'Board minutes', 'Site survey']));
    expect(subjects).not.toContain('You won a prize');
    expect(subjects).not.toContain('Half-written');
    expect(subjects).not.toContain('Old news');
  });
});
