// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import EmailConversationPage from '../../src/client/pages/EmailConversationPage.vue';

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
