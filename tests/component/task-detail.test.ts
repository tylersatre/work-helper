// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import TaskDetailPage from '../../src/client/pages/TaskDetailPage.vue';

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>board</div>' } },
      { path: '/tasks/:id', component: TaskDetailPage },
      { path: '/emails/:id', component: { template: '<div>email</div>' } },
    ],
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
        json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [], conversations: [] }),
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

  const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

  function taskDetailPayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      title: 'Follow up with Sam',
      lane: 'Waiting',
      position: 0,
      createdAt: 1,
      people: [],
      notes: [],
      tags: [],
      companies: [],
      conversations: [],
      lanes: LANES,
      ...overrides,
    };
  }

  it('renders a pill for every configured lane, in order, directly under the title, with the current lane marked and non-interactive (FR-001, FR-002)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => taskDetailPayload() }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const pills = await screen.findAllByTestId('lane-pill');
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual(LANES);

    const currentPill = screen.getByRole('button', { name: 'Waiting' });
    expect((currentPill as HTMLButtonElement).disabled).toBe(true);
    expect(currentPill.getAttribute('aria-current')).toBe('true');

    const otherPill = screen.getByRole('button', { name: 'To Do' });
    expect((otherPill as HTMLButtonElement).disabled).toBe(false);
    expect(otherPill.getAttribute('aria-current')).toBeNull();

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await fireEvent.click(currentPill);
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clicking a non-current pill moves the task to the bottom of that lane and updates the pill row on success (FR-003, FR-005)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/1/placement' && options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'In Progress', position: 2, createdAt: 1 }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.click(await screen.findByRole('button', { name: 'In Progress' }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/1/placement',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ lane: 'In Progress', index: Number.MAX_SAFE_INTEGER }),
      }),
    );

    expect((screen.getByRole('button', { name: 'In Progress' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Waiting' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a repeat click on the same still-in-flight destination pill does not queue a duplicate placement request', async () => {
    let resolveFirst: (() => void) | undefined;
    const placementCalls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/1/placement' && options?.method === 'PUT') {
        const body = JSON.parse(options.body as string) as { lane: string };
        placementCalls.push(body.lane);
        return new Promise((resolve) => {
          resolveFirst = () =>
            resolve({ ok: true, json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'In Progress', position: 2, createdAt: 1 }) });
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const inProgressPill = screen.getByRole('button', { name: 'In Progress' });
    await fireEvent.click(inProgressPill);
    await fireEvent.click(inProgressPill);
    await flushPromises();

    resolveFirst?.();
    await flushPromises();
    await flushPromises();

    expect(placementCalls).toEqual(['In Progress']);
  });

  it('keeps the last-saved lane current and shows an inline error when a move fails to save (spec edge case 2)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/1/placement' && options?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: async () => ({ error: { message: 'Unknown lane' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.click(await screen.findByRole('button', { name: 'In Progress' }));
    await flushPromises();

    expect((screen.getByRole('button', { name: 'Waiting' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'In Progress' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('Unknown lane');
  });

  it('serializes concurrent pill clicks and settles on the last-clicked lane (spec edge case 3)', async () => {
    let resolveFirst: (() => void) | undefined;
    const placementCalls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/1/placement' && options?.method === 'PUT') {
        const body = JSON.parse(options.body as string) as { lane: string };
        placementCalls.push(body.lane);
        if (body.lane === 'In Progress') {
          return new Promise((resolve) => {
            resolveFirst = () =>
              resolve({ ok: true, json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'In Progress', position: 2, createdAt: 1 }) });
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'Done', position: 0, createdAt: 1 }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.click(await screen.findByRole('button', { name: 'In Progress' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await flushPromises();

    expect(placementCalls).toEqual(['In Progress']);
    expect((screen.getByRole('button', { name: 'Waiting' }) as HTMLButtonElement).disabled).toBe(true);

    resolveFirst?.();
    await flushPromises();
    await flushPromises();

    expect(placementCalls).toEqual(['In Progress', 'Done']);
    expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'In Progress' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the server-committed lane current when an earlier queued move succeeds and a later one fails (succeed-then-fail interleaving)', async () => {
    let resolveFirst: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/1/placement' && options?.method === 'PUT') {
        const body = JSON.parse(options.body as string) as { lane: string };
        if (body.lane === 'In Progress') {
          return new Promise((resolve) => {
            resolveFirst = () =>
              resolve({ ok: true, json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'In Progress', position: 2, createdAt: 1 }) });
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({ error: { message: 'Unknown lane' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    // Both clicks are queued while In Progress's placement request is deliberately held open. In
    // Progress then commits server-side and Done fails, so the row must end on the server-committed
    // lane (In Progress), not silently fall back to the pre-click lane.
    const inProgressPill = screen.getByRole('button', { name: 'In Progress' });
    const donePill = screen.getByRole('button', { name: 'Done' });
    await fireEvent.click(inProgressPill);
    await fireEvent.click(donePill);
    await flushPromises();

    resolveFirst?.();
    await flushPromises();
    await flushPromises();

    expect((screen.getByRole('button', { name: 'In Progress' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Waiting' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('Unknown lane');
  });

  it('shows an inline error and leaves the last-saved lane current when the move request itself fails (network error)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/1/placement' && options?.method === 'PUT') {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.click(await screen.findByRole('button', { name: 'In Progress' }));
    await flushPromises();

    expect((screen.getByRole('button', { name: 'Waiting' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'In Progress' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toBeTruthy();
  });

  it('search results show each person name and email; selecting a result links them', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [], conversations: [] }),
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
            companies: [], conversations: [],
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
            companies: [], conversations: [],
          }),
        });
      }
      if (options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [], conversations: [] }),
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
          companies: [], conversations: [],
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
        json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [], conversations: [] }),
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
          companies: [], conversations: [],
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
            companies: [], conversations: [],
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
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [], conversations: [] }),
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

  it('renders an Emails section listing the linked conversations', async () => {
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
          tags: [],
          companies: [],
          conversations: [
            {
              id: 12,
              subject: 'Pricing question',
              participants: [{ address: 'sam.rivera@example.com', displayName: 'Sam Rivera', person: null }],
              latestMessageAt: Date.parse('2026-07-11T15:00:00Z'),
            },
          ],
        }),
      }),
    );

    const router = makeRouter('/tasks/1');
    await router.isReady();
    render(TaskDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(screen.getByText('Emails')).toBeTruthy();
    const linked = await screen.findAllByTestId('linked-conversation');
    expect(linked).toHaveLength(1);
    expect(linked[0]?.textContent).toContain('Pricing question');
  });

  describe('delete card (024-delete-card)', () => {
    async function renderDetail() {
      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/tasks/1' && !options) {
          return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      const router = makeRouter('/tasks/1');
      await router.isReady();
      render(TaskDetailPage, { global: { plugins: [router] } });
      await flushPromises();
      await screen.findByText('Follow up with Sam');

      return { router, fetchMock };
    }

    it('shows a delete control near the title, alongside the lane pills (US1-AS1, FR-001)', async () => {
      await renderDetail();

      expect(screen.getByTestId('delete-card-button')).toBeTruthy();
    });

    it('clicking delete opens a confirmation dialog naming the card and warning it cannot be undone, without deleting yet (US1-AS2, FR-002, FR-003)', async () => {
      const { fetchMock } = await renderDetail();
      fetchMock.mockClear();

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();

      const dialog = screen.getByTestId('delete-card-dialog');
      expect(dialog.textContent).toContain('Follow up with Sam');
      expect(dialog.textContent?.toLowerCase()).toContain("can't be undone");
      expect(fetchMock).not.toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'DELETE' }));
    });

    it('cancelling the dialog sends no request and leaves the detail view unchanged (US2-AS1, FR-004)', async () => {
      const { fetchMock } = await renderDetail();

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();
      const dialog = screen.getByTestId('delete-card-dialog');
      fetchMock.mockClear();

      await fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId('delete-card-dialog')).toBeNull();
      expect(await screen.findByText('Follow up with Sam')).toBeTruthy();
    });

    it('dismissing the dialog with Escape sends no request and does not delete the card', async () => {
      const { fetchMock } = await renderDetail();

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();
      fetchMock.mockClear();

      await fireEvent.keyDown(document, { key: 'Escape' });
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(await screen.findByText('Follow up with Sam')).toBeTruthy();
    });

    it('confirming deletion calls DELETE /api/tasks/:id and navigates back to the board (US1-AS3, FR-005, FR-006)', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/tasks/1' && !options) {
          return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
        }
        if (url === '/api/tasks/1' && options?.method === 'DELETE') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      const router = makeRouter('/tasks/1');
      await router.isReady();
      render(TaskDetailPage, { global: { plugins: [router] } });
      await flushPromises();
      await screen.findByText('Follow up with Sam');

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();
      await fireEvent.click(within(screen.getByTestId('delete-card-dialog')).getByRole('button', { name: /^delete$/i }));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'DELETE' }));
      expect(router.currentRoute.value.fullPath).toBe('/');
    });

    it('a 404 on confirm (stale tab, already deleted) is treated the same as success and navigates back to the board (edge case)', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/tasks/1' && !options) {
          return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
        }
        if (url === '/api/tasks/1' && options?.method === 'DELETE') {
          return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: { message: 'Task not found' } }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      const router = makeRouter('/tasks/1');
      await router.isReady();
      render(TaskDetailPage, { global: { plugins: [router] } });
      await flushPromises();
      await screen.findByText('Follow up with Sam');

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();
      await fireEvent.click(within(screen.getByTestId('delete-card-dialog')).getByRole('button', { name: /^delete$/i }));
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/');
    });

    it('a 500 on confirm keeps the dialog open, shows an alert error, and does not navigate away', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/tasks/1' && !options) {
          return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
        }
        if (url === '/api/tasks/1' && options?.method === 'DELETE') {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: { message: 'Something went wrong' } }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      const router = makeRouter('/tasks/1');
      await router.isReady();
      render(TaskDetailPage, { global: { plugins: [router] } });
      await flushPromises();
      await screen.findByText('Follow up with Sam');

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();
      await fireEvent.click(within(screen.getByTestId('delete-card-dialog')).getByRole('button', { name: /^delete$/i }));
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/tasks/1');
      const dialog = screen.getByTestId('delete-card-dialog');
      expect(within(dialog).getByRole('alert').textContent).toContain('Something went wrong');
    });

    it('cancelling after a failed confirm clears the error so it does not persist on the page', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/tasks/1' && !options) {
          return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
        }
        if (url === '/api/tasks/1' && options?.method === 'DELETE') {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: { message: 'Something went wrong' } }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      const router = makeRouter('/tasks/1');
      await router.isReady();
      render(TaskDetailPage, { global: { plugins: [router] } });
      await flushPromises();
      await screen.findByText('Follow up with Sam');

      await fireEvent.click(screen.getByTestId('delete-card-button'));
      await flushPromises();
      await fireEvent.click(within(screen.getByTestId('delete-card-dialog')).getByRole('button', { name: /^delete$/i }));
      await flushPromises();
      expect(within(screen.getByTestId('delete-card-dialog')).getByRole('alert')).toBeTruthy();

      await fireEvent.click(within(screen.getByTestId('delete-card-dialog')).getByRole('button', { name: /^cancel$/i }));
      await flushPromises();

      expect(screen.queryByTestId('delete-card-dialog')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
