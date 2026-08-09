// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import BoardPage from '../../src/client/pages/BoardPage.vue';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: BoardPage },
      { path: '/tasks/:id', component: { template: '<div />' } },
    ],
  });
}

describe('BoardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders no top-level create-task form — only the one hosted by the first lane', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [] },
            { name: 'In Progress', tasks: [] },
          ],
        }),
      }),
    );

    const router = makeRouter();
    await router.push('/');
    await router.isReady();
    render(BoardPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(screen.getAllByTestId('add-task-toggle')).toHaveLength(1);
  });

  it('hosts the add-task control only in the first lane footer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [] },
            { name: 'In Progress', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    const router = makeRouter();
    await router.push('/');
    await router.isReady();
    render(BoardPage, { global: { plugins: [router] } });
    await flushPromises();

    const toDoHeading = await screen.findByRole('heading', { level: 2, name: 'To Do' });
    const toDoLane = toDoHeading.closest('[data-testid="lane"]') as HTMLElement;
    expect(within(toDoLane).getByTestId('add-task-toggle')).toBeTruthy();

    const otherHeading = screen.getByRole('heading', { level: 2, name: 'In Progress' });
    const otherLane = otherHeading.closest('[data-testid="lane"]') as HTMLElement;
    expect(within(otherLane).queryByTestId('add-task-toggle')).toBeNull();
  });

  it('a created event from the inline form triggers a board refetch', async () => {
    let getBoardCalls = 0;
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/board' && !options) {
        getBoardCalls += 1;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            lanes: [
              { name: 'To Do', tasks: [] },
              { name: 'In Progress', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: 1, title: 'New task', lane: 'To Do', createdAt: 1 }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter();
    await router.push('/');
    await router.isReady();
    render(BoardPage, { global: { plugins: [router] } });
    await flushPromises();
    expect(getBoardCalls).toBe(1);

    await fireEvent.click(screen.getByTestId('add-task-toggle'));
    await flushPromises();
    await fireEvent.update(screen.getByLabelText(/title/i), 'New task');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(getBoardCalls).toBe(2);
  });
});
