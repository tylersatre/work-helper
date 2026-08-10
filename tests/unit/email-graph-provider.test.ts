import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphMailProvider } from '../../src/server/services/email/graph-provider.js';

function fixtureMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'AAMk-immutable-1',
    conversationId: 'conv-1',
    subject: 'Hello',
    body: { content: '<p>Hi</p>', contentType: 'html' },
    receivedDateTime: '2026-07-10T12:00:00Z',
    sentDateTime: '2026-07-10T12:00:00Z',
    from: { emailAddress: { address: 'sam@example.com', name: 'Sam' } },
    toRecipients: [{ emailAddress: { address: 'tyler@example.com', name: 'Tyler' } }],
    ccRecipients: [],
    bccRecipients: [],
    isRead: true,
    importance: 'normal',
    flag: { flagStatus: 'notFlagged' },
    categories: [],
    hasAttachments: false,
    webLink: 'https://outlook.office.com/mail/AAMk-immutable-1',
    internetMessageId: '<AAMk-immutable-1@example.com>',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function drain(provider: GraphMailProvider, folder: 'inbox' | 'sent', window: { startUtc: string; endUtc: string }) {
  const pages: unknown[][] = [];
  for await (const page of provider.fetchMessages(folder, window)) {
    pages.push(page);
  }
  return pages;
}

describe('GraphMailProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const WINDOW = { startUtc: '2026-07-01T06:00:00.000Z', endUtc: '2026-08-01T06:00:00.000Z' };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the inbox URL filtering/ordering on receivedDateTime, with $select/$top and the ImmutableId header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [fixtureMessage()] }));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    const pages = await drain(provider, 'inbox', WINDOW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.origin + parsed.pathname).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
    expect(parsed.searchParams.get('$select')).toBe(
      'id,conversationId,subject,body,sentDateTime,receivedDateTime,from,toRecipients,ccRecipients,bccRecipients,isRead,importance,flag,categories,hasAttachments,webLink,internetMessageId',
    );
    expect(parsed.searchParams.get('$filter')).toBe(
      `receivedDateTime ge ${WINDOW.startUtc} and receivedDateTime lt ${WINDOW.endUtc}`,
    );
    expect(parsed.searchParams.get('$orderby')).toBe('receivedDateTime');
    expect(parsed.searchParams.get('$top')).toBe('100');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Prefer')).toBe('IdType="ImmutableId"');
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
    expect(pages).toHaveLength(1);
  });

  it('builds the sent-items URL filtering/ordering on sentDateTime', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [] }));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    await drain(provider, 'sent', WINDOW);

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1.0/me/mailFolders/sentitems/messages');
    expect(parsed.searchParams.get('$filter')).toBe(`sentDateTime ge ${WINDOW.startUtc} and sentDateTime lt ${WINDOW.endUtc}`);
    expect(parsed.searchParams.get('$orderby')).toBe('sentDateTime');
  });

  it('follows @odata.nextLink until exhausted, yielding one page per response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [fixtureMessage({ id: 'm1' })],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=abc',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: [fixtureMessage({ id: 'm2' })] }));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    const pages = await drain(provider, 'inbox', WINDOW);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=abc');
    expect(pages).toHaveLength(2);
    expect((pages[0]![0] as { id: string }).id).toBe('m1');
    expect((pages[1]![0] as { id: string }).id).toBe('m2');
  });

  it('maps fields to the normalized MailMessage shape, defaulting a null "from" and missing recipient lists to []', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [fixtureMessage({ from: null, toRecipients: undefined, ccRecipients: undefined, bccRecipients: undefined })],
      }),
    );
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, 'inbox', WINDOW);

    expect(page![0]).toEqual({
      id: 'AAMk-immutable-1',
      conversationId: 'conv-1',
      subject: 'Hello',
      body: { content: '<p>Hi</p>', contentType: 'html' },
      receivedDateTime: '2026-07-10T12:00:00Z',
      sentDateTime: '2026-07-10T12:00:00Z',
      from: null,
      toRecipients: [],
      ccRecipients: [],
      bccRecipients: [],
      isRead: true,
      importance: 'normal',
      flagStatus: 'notFlagged',
      categories: [],
      hasAttachments: false,
      webLink: 'https://outlook.office.com/mail/AAMk-immutable-1',
      internetMessageId: '<AAMk-immutable-1@example.com>',
    });
  });

  it('maps populated recipients to {address, name} entries, defaulting a missing name to \'\'', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [fixtureMessage({ toRecipients: [{ emailAddress: { address: 'tyler@example.com' } }] })],
      }),
    );
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, 'inbox', WINDOW);

    expect(page![0]).toMatchObject({
      from: { address: 'sam@example.com', name: 'Sam' },
      toRecipients: [{ address: 'tyler@example.com', name: '' }],
    });
  });

  it('maps isRead, importance, flag.flagStatus, categories, hasAttachments, webLink, and internetMessageId as-is', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [
          fixtureMessage({
            isRead: false,
            importance: 'high',
            flag: { flagStatus: 'flagged' },
            categories: ['Orange category'],
            hasAttachments: true,
            webLink: 'https://outlook.office.com/mail/msg-1',
            internetMessageId: '<msg-1@example.com>',
          }),
        ],
      }),
    );
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, 'inbox', WINDOW);

    expect(page![0]).toMatchObject({
      isRead: false,
      importance: 'high',
      flagStatus: 'flagged',
      categories: ['Orange category'],
      hasAttachments: true,
      webLink: 'https://outlook.office.com/mail/msg-1',
      internetMessageId: '<msg-1@example.com>',
    });
  });

  it('defaults a missing flag object to notFlagged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [fixtureMessage({ flag: undefined })] }));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    const [page] = await drain(provider, 'inbox', WINDOW);

    expect(page![0]).toMatchObject({ flagStatus: 'notFlagged' });
  });

  it('never sends a non-GET request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [] }));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    await drain(provider, 'inbox', WINDOW);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('maps a 401 response to a clear connection/sign-in error before yielding anything', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    await expect(drain(provider, 'inbox', WINDOW)).rejects.toThrow(/sign-in|connection/i);
  });

  it('maps a thrown network error to a clear connection error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

    await expect(drain(provider, 'inbox', WINDOW)).rejects.toThrow(/connection|unreachable/i);
  });

  describe('fetchAttachmentMetadata', () => {
    it('requests name, contentType, size only — never contentBytes — and maps the response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          value: [
            { name: 'quote.pdf', contentType: 'application/pdf', size: 53248 },
            { name: 'image.dat', contentType: null, size: 10 },
          ],
        }),
      );
      const provider = new GraphMailProvider({ getAccessToken: async () => 'token-123' });

      const attachments = await provider.fetchAttachmentMetadata('AAMk-immutable-1');

      const [url, init] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.origin + parsed.pathname).toBe('https://graph.microsoft.com/v1.0/me/messages/AAMk-immutable-1/attachments');
      expect(parsed.searchParams.get('$select')).toBe('name,contentType,size');
      expect((init as RequestInit).method ?? 'GET').toBe('GET');

      expect(attachments).toEqual([
        { name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 },
        { name: 'image.dat', contentType: null, sizeBytes: 10 },
      ]);
    });
  });
});
