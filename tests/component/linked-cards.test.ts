// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import LinkedCards from '../../src/client/components/LinkedCards.vue';
import type { LinkedCardSummary } from '../../src/shared/types.js';

const StubPage = { template: '<div />' };

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: StubPage },
      { path: '/tasks/:id', component: StubPage },
    ],
  });
  router.push('/');
  return router;
}

describe('LinkedCards', () => {
  it('renders each card title and lane with a link to /tasks/:id', async () => {
    const cards: LinkedCardSummary[] = [
      { id: 1, title: 'Follow up with Sam', lane: 'To Do' },
      { id: 2, title: 'Ship the report', lane: 'In Progress' },
    ];

    const router = makeRouter();
    await router.isReady();
    render(LinkedCards, { props: { cards }, global: { plugins: [router] } });

    expect(screen.getByText('Follow up with Sam')).toBeTruthy();
    expect(screen.getByText('To Do')).toBeTruthy();
    expect(screen.getByText('Ship the report')).toBeTruthy();
    expect(screen.getByText('In Progress')).toBeTruthy();

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/tasks/1');
    expect(hrefs).toContain('/tasks/2');
  });

  it('renders one linked-card entry per card', async () => {
    const cards: LinkedCardSummary[] = [
      { id: 1, title: 'Follow up with Sam', lane: 'To Do' },
      { id: 2, title: 'Ship the report', lane: 'In Progress' },
    ];

    const router = makeRouter();
    await router.isReady();
    render(LinkedCards, { props: { cards }, global: { plugins: [router] } });

    const entries = screen.getAllByTestId('linked-card');
    expect(entries).toHaveLength(2);
  });

  it('shows a styled "No linked cards" empty state for an empty cards list, not a blank gap', async () => {
    const router = makeRouter();
    await router.isReady();
    render(LinkedCards, { props: { cards: [] }, global: { plugins: [router] } });

    expect(screen.queryAllByTestId('linked-card')).toHaveLength(0);
    expect(screen.getByText(/no linked cards/i)).toBeTruthy();
  });

  it('renders no button or write control', async () => {
    const cards: LinkedCardSummary[] = [
      { id: 1, title: 'Follow up with Sam', lane: 'To Do' },
      { id: 2, title: 'Ship the report', lane: 'In Progress' },
    ];
    const router = makeRouter();
    await router.isReady();
    render(LinkedCards, { props: { cards }, global: { plugins: [router] } });

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('clicking an entry actually navigates the router to /tasks/<id>', async () => {
    const cards: LinkedCardSummary[] = [{ id: 9, title: 'Follow up with Sam', lane: 'To Do' }];
    const router = makeRouter();
    await router.isReady();
    render(LinkedCards, { props: { cards }, global: { plugins: [router] } });

    await fireEvent.click(screen.getByRole('link'));
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/tasks/9');
  });
});
