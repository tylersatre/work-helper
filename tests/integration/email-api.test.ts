import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';

const LANES = ['To Do'];

let app: FastifyInstance;

function buildTestApp(seed: SeedMessage[]) {
  const { db } = createDb(':memory:');
  app = buildApp({ db, lanes: LANES, mailProvider: new FakeMailProvider(seed) });
}

async function sync(startDate = '2026-01-01', endDate = '2026-12-31') {
  const response = await app.inject({ method: 'POST', url: '/api/email-sync/runs', payload: { startDate, endDate } });
  expect(response.statusCode).toBe(201);
}

async function createPerson(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function listConversations(query = '') {
  return app.inject({ method: 'GET', url: `/api/emails/conversations${query}` });
}

afterEach(async () => {
  await app.close();
});

function quoteAttached(overrides: Partial<SeedMessage> = {}): SeedMessage {
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
    attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248, isInline: false }],
    ...overrides,
  };
}

function pricingQuestion(overrides: Partial<SeedMessage> = {}): SeedMessage {
  return {
    id: 'msg-pricing-1',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-08-04T18:00:00Z',
    sentDateTime: '2026-08-04T18:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    isRead: true,
    ...overrides,
  };
}

describe('GET /api/emails/conversations', () => {
  it('returns an empty page for an empty store', async () => {
    buildTestApp([]);

    const response = await listConversations();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ conversations: [], nextCursor: null });
  });

  it('orders newest-first by latestMessageAt then id, with default limit 25', async () => {
    buildTestApp([quoteAttached(), pricingQuestion()]);
    await sync();

    const response = await listConversations();
    const { conversations, nextCursor } = response.json() as { conversations: { subject: string }[]; nextCursor: string | null };

    expect(conversations.map((c) => c.subject)).toEqual(['Quote attached', 'Pricing question']);
    expect(nextCursor).toBeNull();
  });

  it('pages with a cursor: nextCursor is non-null when more exist and fetches the remainder', async () => {
    const seed: SeedMessage[] = Array.from({ length: 3 }, (_, i) => ({
      id: `msg-page-${i}`,
      conversationId: `conv-page-${i}`,
      subject: `Message ${i}`,
      body: { content: 'hi', contentType: 'text' },
      receivedDateTime: `2026-08-0${i + 1}T09:00:00Z`,
      sentDateTime: `2026-08-0${i + 1}T09:00:00Z`,
      from: { address: 'sam.rivera@example.com' },
      toRecipients: [{ address: 'tyler@example.com' }],
      ccRecipients: [],
      bccRecipients: [],
      folder: 'inbox',
    }));
    buildTestApp(seed);
    await sync();

    const page1 = await listConversations('?limit=2');
    const page1Body = page1.json() as { conversations: { subject: string }[]; nextCursor: string | null };
    expect(page1Body.conversations.map((c) => c.subject)).toEqual(['Message 2', 'Message 1']);
    expect(page1Body.nextCursor).not.toBeNull();

    const page2 = await listConversations(`?limit=2&cursor=${encodeURIComponent(page1Body.nextCursor!)}`);
    const page2Body = page2.json() as { conversations: { subject: string }[]; nextCursor: string | null };
    expect(page2Body.conversations.map((c) => c.subject)).toEqual(['Message 0']);
    expect(page2Body.nextCursor).toBeNull();
  });

  it('rejects a non-integer or out-of-range limit with 400', async () => {
    buildTestApp([]);

    const nonInteger = await listConversations('?limit=abc');
    expect(nonInteger.statusCode).toBe(400);
    expect(nonInteger.json()).toEqual({ error: { message: 'Invalid limit' } });

    const tooLow = await listConversations('?limit=0');
    expect(tooLow.statusCode).toBe(400);

    const tooHigh = await listConversations('?limit=101');
    expect(tooHigh.statusCode).toBe(400);
  });

  it('rejects a malformed cursor with 400', async () => {
    buildTestApp([]);

    const response = await listConversations('?cursor=not-a-valid-cursor');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Invalid cursor' } });
  });

  it('hasAttachments is true only when a non-inline attachment exists; inline-only shows false', async () => {
    buildTestApp([
      quoteAttached(),
      pricingQuestion({
        id: 'msg-inline-only',
        conversationId: 'conv-inline-only',
        subject: 'Inline only',
        attachments: [{ name: 'signature.png', contentType: 'image/png', sizeBytes: 1024, isInline: true }],
      }),
    ]);
    await sync();

    const { conversations } = (await listConversations()).json() as { conversations: { subject: string; hasAttachments: boolean }[] };
    expect(conversations.find((c) => c.subject === 'Quote attached')!.hasAttachments).toBe(true);
    expect(conversations.find((c) => c.subject === 'Inline only')!.hasAttachments).toBe(false);
  });

  it('hasUnread reflects any unread message in the conversation', async () => {
    buildTestApp([quoteAttached(), pricingQuestion()]);
    await sync();

    const { conversations } = (await listConversations()).json() as { conversations: { subject: string; hasUnread: boolean }[] };
    expect(conversations.find((c) => c.subject === 'Quote attached')!.hasUnread).toBe(true);
    expect(conversations.find((c) => c.subject === 'Pricing question')!.hasUnread).toBe(false);
  });

  it('participants carry a person link when the address is linked to a person', async () => {
    buildTestApp([quoteAttached()]);
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await sync();

    const { conversations } = (await listConversations()).json() as {
      conversations: { participants: { address: string; person: { id: number; name: string } | null }[] }[];
    };
    const participants = conversations[0]!.participants;
    expect(participants.find((p) => p.address === 'sam.rivera@example.com')?.person).toEqual({ id: sam, name: 'Sam Rivera' });
    expect(participants.find((p) => p.address === 'tyler@example.com')?.person).toBeNull();
  });
});

describe('GET /api/emails/conversations/:id', () => {
  it('returns messages complete and ordered oldest-first, with bodyOriginal/bodyContentType as stored', async () => {
    const reply: SeedMessage = {
      ...pricingQuestion(),
      id: 'msg-pricing-reply',
      subject: 'Re: Pricing question',
      receivedDateTime: '2026-08-05T15:00:00Z',
      sentDateTime: '2026-08-05T15:00:00Z',
    };
    buildTestApp([pricingQuestion(), reply]);
    await sync();

    const { conversations } = (await listConversations()).json() as { conversations: { id: number; subject: string }[] };
    const id = conversations.find((c) => c.subject === 'Pricing question')!.id;

    const response = await app.inject({ method: 'GET', url: `/api/emails/conversations/${id}` });
    expect(response.statusCode).toBe(200);
    const detail = response.json() as { messages: { subject: string; bodyOriginal: string; bodyContentType: string }[] };
    expect(detail.messages.map((m) => m.subject)).toEqual(['Pricing question', 'Re: Pricing question']);
    expect(detail.messages[0]!.bodyOriginal).toBe('Can you send the updated pricing sheet?');
    expect(detail.messages[0]!.bodyContentType).toBe('text');
  });

  it('attachments exclude inline rows; a message with only inline attachments yields an empty list, and isInline never crosses the wire', async () => {
    buildTestApp([
      quoteAttached({
        attachments: [
          { name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248, isInline: false },
          { name: 'signature.png', contentType: 'image/png', sizeBytes: 1024, isInline: true },
        ],
      }),
    ]);
    await sync();

    const { conversations } = (await listConversations()).json() as { conversations: { id: number }[] };
    const response = await app.inject({ method: 'GET', url: `/api/emails/conversations/${conversations[0]!.id}` });
    const detail = response.json() as { messages: { attachments: { name: string }[] }[] };
    expect(detail.messages[0]!.attachments).toEqual([{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 }]);
    expect(JSON.stringify(detail)).not.toContain('isInline');
  });

  it('participants carry role and nullable person', async () => {
    buildTestApp([quoteAttached()]);
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await sync();

    const { conversations } = (await listConversations()).json() as { conversations: { id: number }[] };
    const response = await app.inject({ method: 'GET', url: `/api/emails/conversations/${conversations[0]!.id}` });
    const detail = response.json() as {
      messages: { participants: { address: string; role: string; person: { id: number; name: string } | null }[] }[];
    };
    const participants = detail.messages[0]!.participants;
    expect(participants.find((p) => p.address === 'sam.rivera@example.com')).toMatchObject({ role: 'from', person: { id: sam, name: 'Sam Rivera' } });
    expect(participants.find((p) => p.address === 'tyler@example.com')).toMatchObject({ role: 'to', person: null });
  });

  it('404s with "Conversation not found" for an unknown or non-numeric id', async () => {
    buildTestApp([]);

    const unknown = await app.inject({ method: 'GET', url: '/api/emails/conversations/999999' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: { message: 'Conversation not found' } });

    const nonNumeric = await app.inject({ method: 'GET', url: '/api/emails/conversations/not-a-number' });
    expect(nonNumeric.statusCode).toBe(404);
  });
});

describe('GET /api/people/:personId/email-conversations', () => {
  it("lists a person's conversations newest-first with their distinct addresses and roles", async () => {
    buildTestApp([quoteAttached()]);
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await sync();

    const response = await app.inject({ method: 'GET', url: `/api/people/${sam}/email-conversations` });
    expect(response.statusCode).toBe(200);
    const { conversations } = response.json() as { conversations: { subject: string; addresses: { address: string; roles: string[] }[] }[] };
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.subject).toBe('Quote attached');
    expect(conversations[0]!.addresses).toEqual([{ address: 'sam.rivera@example.com', roles: ['from'] }]);
  });

  it("shows every distinct involved address with all of its distinct roles, and includes a cc-only conversation", async () => {
    buildTestApp([
      quoteAttached({
        toRecipients: [
          { address: 'tyler@example.com', name: 'Tyler Satre' },
          { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
        ],
        ccRecipients: [{ address: 'sam.personal@example.com', name: 'Sam Rivera' }],
      }),
      pricingQuestion({
        id: 'msg-cc-only',
        conversationId: 'conv-cc-only',
        subject: 'CC only',
        from: { address: 'other@example.com' },
        toRecipients: [{ address: 'tyler@example.com' }],
        ccRecipients: [{ address: 'sam.rivera@example.com' }],
        receivedDateTime: '2026-08-03T09:00:00Z',
        sentDateTime: '2026-08-03T09:00:00Z',
      }),
    ]);
    const sam = await createPerson({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    await app.inject({ method: 'POST', url: `/api/people/${sam}/emails`, payload: { value: 'sam.personal@example.com' } });
    await sync();

    const response = await app.inject({ method: 'GET', url: `/api/people/${sam}/email-conversations` });
    const { conversations } = response.json() as { conversations: { subject: string; addresses: { address: string; roles: string[] }[] }[] };

    const quote = conversations.find((c) => c.subject === 'Quote attached')!;
    expect(quote.addresses).toContainEqual({ address: 'sam.rivera@example.com', roles: ['from', 'to'] });
    expect(quote.addresses).toContainEqual({ address: 'sam.personal@example.com', roles: ['cc'] });

    const ccOnly = conversations.find((c) => c.subject === 'CC only')!;
    expect(ccOnly.addresses).toEqual([{ address: 'sam.rivera@example.com', roles: ['cc'] }]);
  });

  it('a person with no synced mail returns an empty list', async () => {
    buildTestApp([]);
    const cy = await createPerson({ firstName: 'Cy', lastName: 'Cole' });

    const response = await app.inject({ method: 'GET', url: `/api/people/${cy}/email-conversations` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ conversations: [] });
  });

  it('404s with "Person not found" for an unknown person', async () => {
    buildTestApp([]);

    const response = await app.inject({ method: 'GET', url: '/api/people/999999/email-conversations' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});
