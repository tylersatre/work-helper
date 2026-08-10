// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import TaskDetailPage from '../../src/client/pages/TaskDetailPage.vue';

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tasks/:id', component: TaskDetailPage }],
  });
  router.push(initialPath);
  return router;
}

async function waitForDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
}

describe('TaskDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the task title, an empty linked-people section with a search box, and offers no task-field editing or create-person affordance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [] }),
      }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Follow up with Sam')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /search people/i })).toBeTruthy();
    expect(screen.queryAllByTestId('linked-person')).toHaveLength(0);
    expect(screen.queryByLabelText(/^title$/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /add person/i })).toBeNull();
  });

  it('renders the task lane as read-only text and offers no control to change it (FR-009)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'Waiting', position: 0, createdAt: 1, people: [], notes: [], tags: [] }),
      }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText(/waiting/i)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /lane/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /lane/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^lane$/i })).toBeNull();
    expect(screen.queryByLabelText(/^lane$/i)).toBeNull();
  });

  it('search results show each person name and email; selecting a result links them', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [] }),
        });
      }
      if (typeof url === 'string' && url.startsWith('/api/people?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 1,
              firstName: 'Sam',
              lastName: 'Rivera',
              emails: [{ id: 1, value: 'sam.rivera@example.com', isPrimary: true, createdAt: 1 }],
              phones: [],
              extraFields: {},
              createdAt: 1,
            },
          ],
        });
      }
      if (url === '/api/tasks/1/people' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            title: 'Follow up with Sam',
            lane: 'To Do',
            createdAt: 1,
            people: [
              { id: 1, firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: null, extraFields: {}, createdAt: 1 },
            ],
            notes: [],
            tags: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox', { name: /search people/i }), 'sam');
    await waitForDebounce();

    const result = await screen.findByTestId('search-result');
    expect(result.textContent).toContain('Sam Rivera');
    expect(result.textContent).toContain('sam.rivera@example.com');

    await fireEvent.click(within(result).getByRole('button', { name: 'Link' }));
    await flushPromises();

    const linkedRows = await screen.findAllByTestId('linked-person');
    expect(linkedRows).toHaveLength(1);
    expect(linkedRows[0]?.textContent).toContain('Sam Rivera');
  });

  it('a remove control unlinks a linked person', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            title: 'Follow up with Sam',
            lane: 'To Do',
            createdAt: 1,
            people: [
              { id: 1, firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: null, extraFields: {}, createdAt: 1 },
            ],
            notes: [],
            tags: [],
          }),
        });
      }
      if (options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const removeButton = await screen.findByRole('button', { name: 'Remove' });
    await fireEvent.click(removeButton);
    await flushPromises();

    expect(screen.queryAllByTestId('linked-person')).toHaveLength(0);
  });

  it('renders a populated notes section for a task with notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          title: 'Follow up with Sam',
          lane: 'To Do',
          createdAt: 1,
          people: [],
          notes: [{ id: 1, taskId: 1, text: 'Waiting on budget numbers', source: 'ui', createdAt: Date.now() }],
          tags: [],
        }),
      }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Waiting on budget numbers')).toBeTruthy();
  });

  it('renders the empty notes state with the add-note input still present for a task with no notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [] }),
      }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(screen.queryAllByTestId('note')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: /note/i })).toBeTruthy();
  });

  it("renders chips for the task's tags", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          title: 'Follow up with Sam',
          lane: 'To Do',
          createdAt: 1,
          people: [],
          notes: [],
          tags: [
            { id: 1, name: 'Q3', color: '#22C55E' },
            { id: 2, name: 'VIP', color: '#3B82F6' },
          ],
        }),
      }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const chips = await screen.findAllByTestId('tag-chip');
    expect(chips.map((chip) => chip.textContent?.trim().replace(/\s*×$/, ''))).toEqual(['Q3', 'VIP']);
  });

  it('removing a chip calls DELETE /api/tasks/:id/tags/:tagId and updates the list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            title: 'Follow up with Sam',
            lane: 'To Do',
            createdAt: 1,
            people: [],
            notes: [],
            tags: [{ id: 1, name: 'VIP', color: '#3B82F6' }],
          }),
        });
      }
      if (url === '/api/tasks/1/tags/1' && options?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ tags: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.click(await screen.findByRole('button', { name: /remove vip/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/1/tags/1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryAllByTestId('tag-chip')).toHaveLength(0);
  });

  it('the TagInput attaches via POST /api/tasks/:id/tags', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [] }),
        });
      }
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/api/tasks/1/tags' && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ tags: [{ id: 5, name: 'Roadmap', color: '#EAB308' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox', { name: /add tag/i }), 'Roadmap');
    await flushPromises();
    await fireEvent.click(screen.getByTestId('tag-create-option'));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/1/tags',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Roadmap' }) }),
    );
    expect(await screen.findByText('Roadmap')).toBeTruthy();
  });
});
