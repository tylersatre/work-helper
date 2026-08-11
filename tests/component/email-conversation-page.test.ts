// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import EmailConversationPage from '../../src/client/pages/EmailConversationPage.vue';

async function waitForDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
}

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/emails/:id', component: EmailConversationPage },
      { path: '/people/:id', component: { template: '<div>person</div>' } },
    ],
  });
  router.push(initialPath);
  return router;
}

function baseMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 40,
    subject: 'Quote attached',
    sentAt: Date.parse('2026-08-06T09:00:00Z'),
    receivedAt: Date.parse('2026-08-06T09:01:00Z'),
    bodyOriginal: 'See attached.',
    bodyContentType: 'text',
    sourceFolder: 'Inbox',
    isRead: false,
    importance: 'high',
    flagStatus: 'flagged',
    categories: ['Orange category'],
    webLink: 'https://outlook.office365.com/owa/?ItemID=abc',
    attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 }],
    participants: [
      { address: 'sam.rivera@example.com', displayName: 'Sam Rivera', role: 'from', person: { id: 3, name: 'Sam Rivera' } },
      { address: 'tyler@example.com', displayName: 'Tyler Satre', role: 'to', person: null },
    ],
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return { id: 12, subject: 'Quote attached', messages: [baseMessage()], ...overrides };
}

async function renderPage(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
  const router = makeRouter('/emails/12');
  await router.isReady();
  render(EmailConversationPage, { global: { plugins: [router] } });
  await flushPromises();
}

describe('EmailConversationPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every message fully expanded, in the order returned (oldest-first)', async () => {
    await renderPage(
      detail({
        messages: [baseMessage({ id: 40, subject: 'First' }), baseMessage({ id: 41, subject: 'Second' })],
      }),
    );

    const messages = screen.getAllByTestId('email-message');
    expect(messages).toHaveLength(2);
    expect(messages[0]!.textContent).toContain('First');
    expect(messages[1]!.textContent).toContain('Second');
  });

  it('shows display names alongside addresses, and the bare address when none is stored', async () => {
    await renderPage(
      detail({
        messages: [
          baseMessage({
            participants: [
              { address: 'sam.rivera@example.com', displayName: 'Sam Rivera', role: 'from', person: null },
              { address: 'tyler@example.com', displayName: '', role: 'to', person: null },
            ],
          }),
        ],
      }),
    );

    const message = screen.getByTestId('email-message');
    expect(message.textContent).toContain('Sam Rivera');
    expect(message.textContent).toContain('sam.rivera@example.com');
    expect(message.textContent).toContain('tyler@example.com');
  });

  it('shows the unread marker, importance, flag status, categories, and folder', async () => {
    await renderPage(detail());

    const message = screen.getByTestId('email-message');
    expect(within(message).getByTestId('message-unread')).toBeTruthy();
    expect(message.textContent).toContain('high');
    expect(message.textContent).toContain('flagged');
    expect(message.textContent).toContain('Orange category');
    expect(message.textContent).toContain('Inbox');
  });

  it('shows attachment name, type, and formatted size, and an open-in-Outlook link', async () => {
    await renderPage(detail());

    const message = screen.getByTestId('email-message');
    const attachment = within(message).getByTestId('message-attachment');
    expect(attachment.textContent).toContain('quote.pdf');
    expect(attachment.textContent).toContain('52 KB');

    const link = within(message).getByRole('link', { name: /open in outlook/i });
    expect(link.getAttribute('href')).toBe('https://outlook.office365.com/owa/?ItemID=abc');
  });

  it('renders a linked participant as a link to their person record', async () => {
    await renderPage(detail());

    const message = screen.getByTestId('email-message');
    const link = within(message).getByRole('link', { name: 'Sam Rivera' });
    expect(link.getAttribute('href')).toBe('/people/3');
  });

  it('shows the "(no subject)" placeholder for an empty conversation subject', async () => {
    await renderPage(detail({ subject: '' }));

    expect(screen.getByText('(no subject)')).toBeTruthy();
  });

  it('offers no mailbox write actions anywhere on the page', async () => {
    await renderPage(detail());

    for (const name of [/mark read/i, /mark unread/i, /^flag$/i, /move/i, /^delete$/i, /reply/i, /forward/i, /compose/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});

describe('EmailConversationPage — link/create controls (US4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function unmatchedDetail() {
    return detail({
      messages: [
        baseMessage({
          participants: [
            { address: 'sam.rivera@example.com', displayName: 'Sam Rivera', role: 'from', person: { id: 3, name: 'Sam Rivera' } },
            { address: 'jordan.smith@example.com', displayName: 'Jordan Smith', role: 'to', person: null },
          ],
        }),
      ],
    });
  }

  it('renders link/create controls only for unmatched participants', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => unmatchedDetail() }));
    const router = makeRouter('/emails/12');
    await router.isReady();
    render(EmailConversationPage, { global: { plugins: [router] } });
    await flushPromises();

    const controls = screen.getAllByTestId('address-link-controls');
    expect(controls).toHaveLength(1);
  });

  it('searches GET /api/people?q= after a debounce and renders "First Last — email" result rows', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/people?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 5, firstName: 'Jordan', lastName: 'Smith', emails: [{ id: 1, value: 'jordan.other@example.com', isPrimary: true, createdAt: 1 }], phones: [], extraFields: {}, createdAt: 1, tags: [] },
          ],
        });
      }
      return Promise.resolve({ ok: true, json: async () => unmatchedDetail() });
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = makeRouter('/emails/12');
    await router.isReady();
    render(EmailConversationPage, { global: { plugins: [router] } });
    await flushPromises();

    const controls = screen.getByTestId('address-link-controls');
    await fireEvent.update(within(controls).getByRole('textbox', { name: /search people/i }), 'jordan');
    await waitForDebounce();

    const result = within(controls).getByTestId('search-result');
    expect(result.textContent).toContain('Jordan Smith');
    expect(result.textContent).toContain('jordan.other@example.com');
  });

  it('selecting a search result POSTs to /api/people/:personId/emails and the address then shows as linked', async () => {
    let linked = false;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/people?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 5, firstName: 'Jordan', lastName: 'Smith', emails: [], phones: [], extraFields: {}, createdAt: 1, tags: [] },
          ],
        });
      }
      if (url === '/api/people/5/emails' && options?.method === 'POST') {
        linked = true;
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ entries: [] }) });
      }
      if (linked) {
        const linkedDetail = detail({
          messages: [
            baseMessage({
              participants: [
                { address: 'sam.rivera@example.com', displayName: 'Sam Rivera', role: 'from', person: { id: 3, name: 'Sam Rivera' } },
                { address: 'jordan.smith@example.com', displayName: 'Jordan Smith', role: 'to', person: { id: 5, name: 'Jordan Smith' } },
              ],
            }),
          ],
        });
        return Promise.resolve({ ok: true, json: async () => linkedDetail });
      }
      return Promise.resolve({ ok: true, json: async () => unmatchedDetail() });
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = makeRouter('/emails/12');
    await router.isReady();
    render(EmailConversationPage, { global: { plugins: [router] } });
    await flushPromises();

    const controls = screen.getByTestId('address-link-controls');
    await fireEvent.update(within(controls).getByRole('textbox', { name: /search people/i }), 'jordan');
    await waitForDebounce();
    await fireEvent.click(within(controls).getByRole('button', { name: 'Link' }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/people/5/emails',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ value: 'jordan.smith@example.com' }) }),
    );
    expect(screen.queryByTestId('address-link-controls')).toBeNull();
    const message = screen.getByTestId('email-message');
    expect(within(message).getByRole('link', { name: 'Jordan Smith' })).toBeTruthy();
  });

  it('the create-person control expands PersonForm prefilled from the display-name split and address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => unmatchedDetail() }));
    const router = makeRouter('/emails/12');
    await router.isReady();
    render(EmailConversationPage, { global: { plugins: [router] } });
    await flushPromises();

    const controls = screen.getByTestId('address-link-controls');
    await fireEvent.click(within(controls).getByRole('button', { name: /create person/i }));
    await flushPromises();

    expect((within(controls).getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Jordan');
    expect((within(controls).getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Smith');
    expect((within(controls).getByLabelText(/^email/i) as HTMLInputElement).value).toBe('jordan.smith@example.com');
  });

  it('the create-person submit forwards the phone and an edited email, not just first/last name', async () => {
    let createBody: unknown;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/people' && options?.method === 'POST') {
        createBody = JSON.parse(options.body as string);
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 9 }) });
      }
      return Promise.resolve({ ok: true, json: async () => unmatchedDetail() });
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = makeRouter('/emails/12');
    await router.isReady();
    render(EmailConversationPage, { global: { plugins: [router] } });
    await flushPromises();

    const controls = screen.getByTestId('address-link-controls');
    await fireEvent.click(within(controls).getByRole('button', { name: /create person/i }));
    await flushPromises();

    await fireEvent.update(within(controls).getByLabelText(/^email/i), 'jordan.edited@example.com');
    await fireEvent.update(within(controls).getByLabelText(/phone/i), '555-0100');
    await fireEvent.click(within(controls).getByRole('button', { name: /create person/i }));
    await flushPromises();

    expect(createBody).toMatchObject({
      firstName: 'Jordan',
      lastName: 'Smith',
      email: 'jordan.edited@example.com',
      phone: '555-0100',
    });
  });

  it('a 409 response from the create-person submit surfaces as the control error text', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/people' && options?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: { message: 'That email is already in use' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => unmatchedDetail() });
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = makeRouter('/emails/12');
    await router.isReady();
    render(EmailConversationPage, { global: { plugins: [router] } });
    await flushPromises();

    const controls = screen.getByTestId('address-link-controls');
    await fireEvent.click(within(controls).getByRole('button', { name: /create person/i }));
    await flushPromises();
    await fireEvent.click(within(controls).getByRole('button', { name: /create person/i }));
    await flushPromises();

    expect(await within(controls).findByText(/that email is already in use/i)).toBeTruthy();
  });
});
