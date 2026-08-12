// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import EmailsPage from '../../src/client/pages/EmailsPage.vue';

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/emails', component: EmailsPage },
      { path: '/emails/:id', component: { template: '<div>detail</div>' } },
    ],
  });
  router.push('/emails');
  return router;
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subject: 'Quote attached',
    messageCount: 1,
    latestMessageAt: Date.parse('2026-08-06T09:01:00Z'),
    hasUnread: true,
    hasAttachments: true,
    participants: [
      { address: 'sam.rivera@example.com', displayName: 'Sam Rivera', person: null },
      { address: 'tyler@example.com', displayName: 'Tyler Satre', person: null },
    ],
    ...overrides,
  };
}

async function renderPage() {
  const router = makeRouter();
  await router.isReady();
  render(EmailsPage, { global: { plugins: [router] } });
}

describe('EmailsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders rows in the order returned, with subject, participants, count, date, and indicators', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          conversations: [
            conversation(),
            conversation({
              id: 2,
              subject: 'Pricing question',
              messageCount: 2,
              hasUnread: false,
              hasAttachments: false,
              latestMessageAt: Date.parse('2026-08-05T15:00:00Z'),
            }),
          ],
          nextCursor: null,
        }),
      }),
    );

    await renderPage();

    const rows = await screen.findAllByTestId('email-conversation-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Quote attached');
    expect(rows[0]!.textContent).toContain('Sam Rivera');
    expect(within(rows[0]!).getByTestId('unread-indicator')).toBeTruthy();
    expect(within(rows[0]!).getByTestId('attachment-indicator')).toBeTruthy();
    expect(rows[1]!.textContent).toContain('Pricing question');
    expect(within(rows[1]!).queryByTestId('unread-indicator')).toBeNull();
    expect(within(rows[1]!).queryByTestId('attachment-indicator')).toBeNull();
  });

  it('shows the bare address when a participant has no display name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          conversations: [conversation({ participants: [{ address: 'sam.rivera@example.com', displayName: '', person: null }] })],
          nextCursor: null,
        }),
      }),
    );

    await renderPage();

    const row = await screen.findByTestId('email-conversation-row');
    expect(row.textContent).toContain('sam.rivera@example.com');
  });

  it('renders the conversation list as a contained card (wh-card-list)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ conversations: [conversation()], nextCursor: null }),
      }),
    );

    await renderPage();

    const row = await screen.findByTestId('email-conversation-row');
    expect(row.closest('ul')?.classList.contains('wh-card-list')).toBe(true);
  });

  it('shows the styled "(no subject)" placeholder for an empty subject', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ conversations: [conversation({ subject: '' })], nextCursor: null }) }),
    );

    await renderPage();

    const row = await screen.findByTestId('email-conversation-row');
    expect(row.textContent).toContain('(no subject)');
  });

  it('shows the styled empty state when no conversations exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ conversations: [], nextCursor: null }) }));

    await renderPage();
    await flushPromises();

    expect(await screen.findByTestId('emails-empty')).toBeTruthy();
    expect(screen.queryByTestId('email-conversation-row')).toBeNull();
  });

  it('shows error text, not the "no conversations" empty state, when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: 'Server error' } }) }));

    await renderPage();
    await flushPromises();

    expect(await screen.findByText('Server error')).toBeTruthy();
    expect(screen.queryByTestId('emails-empty')).toBeNull();
  });

  it('shows a load-more control only when nextCursor is non-null, and activating it appends the next page', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/emails/conversations') {
        return Promise.resolve({ ok: true, json: async () => ({ conversations: [conversation({ id: 1 })], nextCursor: 'cursor-abc' }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ conversations: [conversation({ id: 2, subject: 'Second page' })], nextCursor: null }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderPage();
    await flushPromises();

    expect(screen.queryAllByTestId('email-conversation-row')).toHaveLength(1);
    const loadMore = screen.getByRole('button', { name: /load more/i });
    await fireEvent.click(loadMore);
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith('/api/emails/conversations?cursor=cursor-abc');
    expect(screen.queryAllByTestId('email-conversation-row')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('navigates to the conversation detail route when a row is activated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ conversations: [conversation({ id: 42 })], nextCursor: null }) }),
    );

    await renderPage();

    const row = await screen.findByTestId('email-conversation-row');
    const link = within(row).getByRole('link');
    expect(link.getAttribute('href')).toBe('/emails/42');
  });
});
