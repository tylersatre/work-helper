// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import LinkedConversations from '../../src/client/components/LinkedConversations.vue';
import type { LinkedConversationSummary } from '../../src/shared/types.js';

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/emails/:id', component: { template: '<div>email</div>' } },
      { path: '/people/:id', component: { template: '<div>person</div>' } },
    ],
  });
  router.push('/');
  return router;
}

function conversation(overrides: Partial<LinkedConversationSummary> = {}): LinkedConversationSummary {
  return {
    id: 12,
    subject: 'Quote attached',
    participants: [
      { address: 'sam.rivera@example.com', displayName: 'Sam Rivera', person: { id: 3, name: 'Sam Rivera' } },
      { address: 'jordan.smith@example.com', displayName: 'Jordan Smith', person: null },
      { address: 'ana@example.com', displayName: '', person: null },
    ],
    latestMessageAt: Date.parse('2026-08-06T09:00:00Z'),
    ...overrides,
  };
}

describe('LinkedConversations', () => {
  it('renders subject, participant names (person name / displayName / address fallback chain), and the formatted latest-message date', async () => {
    const router = makeRouter();
    await router.isReady();
    const entry = conversation();
    render(LinkedConversations, { props: { conversations: [entry] }, global: { plugins: [router] } });

    const item = screen.getByTestId('linked-conversation');
    expect(item.textContent).toContain('Quote attached');
    // Person-linked participant shows the linked person's name, not the raw address.
    expect(item.textContent).toContain('Sam Rivera');
    expect(item.textContent).not.toContain('sam.rivera@example.com');
    // Display-name-only participant shows the display name.
    expect(item.textContent).toContain('Jordan Smith');
    // Neither person nor display name: falls back to the raw address.
    expect(item.textContent).toContain('ana@example.com');

    const expectedDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(entry.latestMessageAt),
    );
    expect(item.textContent).toContain(expectedDate);

    const link = within(item).getByRole('link');
    expect(link.getAttribute('href')).toBe('/emails/12');
  });

  it('shows the "(no subject)" placeholder for a blank or whitespace-only subject', async () => {
    const router = makeRouter();
    await router.isReady();
    render(LinkedConversations, {
      props: { conversations: [conversation({ subject: '   ' })] },
      global: { plugins: [router] },
    });

    const item = screen.getByTestId('linked-conversation');
    expect(item.textContent).toContain('(no subject)');
    expect(item.textContent).not.toMatch(/^\s*$/);
  });

  it('renders one entry per conversation', async () => {
    const router = makeRouter();
    await router.isReady();
    render(LinkedConversations, {
      props: {
        conversations: [
          conversation({ id: 1, subject: 'First' }),
          conversation({ id: 2, subject: 'Second' }),
        ],
      },
      global: { plugins: [router] },
    });

    const items = screen.getAllByTestId('linked-conversation');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('First');
    expect(items[1]!.textContent).toContain('Second');
  });

  it('shows a styled "No linked emails" empty state for an empty conversations list, not a blank gap', async () => {
    const router = makeRouter();
    await router.isReady();
    render(LinkedConversations, { props: { conversations: [] }, global: { plugins: [router] } });

    expect(screen.queryAllByTestId('linked-conversation')).toHaveLength(0);
    expect(screen.getByText(/no linked emails/i)).toBeTruthy();
  });

  it('each entry links to /emails/<id> and renders no button or write control', async () => {
    const router = makeRouter();
    await router.isReady();
    render(LinkedConversations, {
      props: { conversations: [conversation({ id: 7 }), conversation({ id: 8 })] },
      global: { plugins: [router] },
    });

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/emails/7', '/emails/8']);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('clicking an entry actually navigates the router to /emails/<id>', async () => {
    const router = makeRouter();
    await router.isReady();
    render(LinkedConversations, {
      props: { conversations: [conversation({ id: 42 })] },
      global: { plugins: [router] },
    });

    await fireEvent.click(screen.getByRole('link'));
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/emails/42');
  });
});
