// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import PersonEmailSection from '../../src/client/components/PersonEmailSection.vue';

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/people/:id', component: { template: '<div>person</div>' } },
      { path: '/emails/:id', component: { template: '<div>email</div>' } },
    ],
  });
  router.push('/people/3');
  return router;
}

function conv(id: number, subject: string, latestMessageAt: number) {
  return { conversationId: id, subject, latestMessageAt, addresses: [{ address: 'sam.rivera@example.com', roles: ['to', 'cc'] }] };
}

async function renderSection(conversations: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ conversations }) }));
  const router = makeRouter();
  await router.isReady();
  render(PersonEmailSection, { props: { personId: 3 }, global: { plugins: [router] } });
  await flushPromises();
}

describe('PersonEmailSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the 5 newest conversations with subject, date, and address+role chips', async () => {
    const conversations = Array.from({ length: 7 }, (_, i) => conv(i + 1, `Conversation ${i + 1}`, Date.parse('2026-08-01T00:00:00Z') + i * 86400000));
    await renderSection(conversations.reverse());

    const rows = screen.getAllByTestId('person-email-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]!.textContent).toContain('sam.rivera@example.com — to, cc');
    expect(rows[0]!.closest('ul')?.classList.contains('wh-card-list')).toBe(true);
  });

  it('shows the "(no subject)" placeholder for an empty subject', async () => {
    await renderSection([{ ...conv(1, '', Date.parse('2026-08-01T00:00:00Z')) }]);

    const row = screen.getByTestId('person-email-row');
    expect(row.textContent).toContain('(no subject)');
  });

  it('a show-all control reveals the remaining rows in place, and is absent at 5 or fewer', async () => {
    const conversations = Array.from({ length: 7 }, (_, i) => conv(i + 1, `Conversation ${i + 1}`, Date.parse('2026-08-01T00:00:00Z') + i * 86400000));
    await renderSection(conversations);

    expect(screen.queryAllByTestId('person-email-row')).toHaveLength(5);
    const showAll = screen.getByRole('button', { name: /show all/i });
    await fireEvent.click(showAll);
    await flushPromises();

    expect(screen.queryAllByTestId('person-email-row')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
  });

  it('has no show-all control when there are 5 or fewer conversations', async () => {
    await renderSection([conv(1, 'A', 1), conv(2, 'B', 2)]);

    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
  });

  it('entries link to the conversation detail route', async () => {
    await renderSection([conv(42, 'Quote attached', 1)]);

    const row = screen.getByTestId('person-email-row');
    const link = within(row).getByRole('link');
    expect(link.getAttribute('href')).toBe('/emails/42');
  });

  it('shows a styled empty state when the list is empty', async () => {
    await renderSection([]);

    expect(screen.getByTestId('person-emails-empty')).toBeTruthy();
    expect(screen.queryByTestId('person-email-row')).toBeNull();
  });

  it('shows error text, not the empty state, when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: 'Server error' } }) }));
    const router = makeRouter();
    await router.isReady();
    render(PersonEmailSection, { props: { personId: 3 }, global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Server error')).toBeTruthy();
    expect(screen.queryByTestId('person-emails-empty')).toBeNull();
  });
});
