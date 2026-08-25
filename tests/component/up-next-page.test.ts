// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpNextPage from '../../src/client/pages/UpNextPage.vue';
import type { DashboardResponse } from '../../src/shared/types.js';
import { createMemoryHistory, createRouter } from 'vue-router';

const VIP_TAG = { id: 101, name: 'VIP', color: '#f59e0b' };
const Q3_TAG = { id: 102, name: 'Q3', color: '#3b82f6' };

function seededDashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    lanes: ['Up Next', 'In Progress', 'Waiting', 'Done'],
    defaultLanes: ['Up Next', 'In Progress'],
    quickDoneLane: 'Done',
    savedView: null,
    cards: [
      {
        id: 1,
        title: 'Follow up with Sam',
        lane: 'Up Next',
        position: 0,
        createdAt: 1,
        tags: [VIP_TAG],
        searchText: 'follow up with sam\nkickoff call went well\nsam rivera\nacme inc',
        latestNote: { text: 'Kickoff call went well', createdAt: Date.now() - 60_000 },
        people: [{ id: 7, name: 'Sam Rivera' }],
        companies: [{ id: 2, name: 'Acme Inc' }],
      },
      {
        id: 2,
        title: 'Write proposal',
        lane: 'Up Next',
        position: 1,
        createdAt: 2,
        tags: [Q3_TAG],
        searchText: 'write proposal',
        latestNote: null,
        people: [],
        companies: [],
      },
      {
        id: 3,
        title: 'Review budget',
        lane: 'Up Next',
        position: 2,
        createdAt: 3,
        tags: [],
        searchText: 'review budget\nwaiting on budget numbers',
        latestNote: { text: 'Waiting on budget numbers', createdAt: Date.now() - 120_000 },
        people: [],
        companies: [],
      },
      { id: 4, title: 'Book venue', lane: 'In Progress', position: 0, createdAt: 4, tags: [], searchText: 'book venue', latestNote: null, people: [], companies: [] },
      { id: 5, title: 'Order catering', lane: 'In Progress', position: 1, createdAt: 5, tags: [], searchText: 'order catering', latestNote: null, people: [], companies: [] },
      { id: 6, title: 'Send invites', lane: 'In Progress', position: 2, createdAt: 6, tags: [], searchText: 'send invites', latestNote: null, people: [], companies: [] },
      { id: 7, title: 'Chase invoice', lane: 'Waiting', position: 0, createdAt: 7, tags: [VIP_TAG], searchText: 'chase invoice', latestNote: null, people: [], companies: [] },
      { id: 8, title: 'Prep board deck', lane: 'Done', position: 0, createdAt: 8, tags: [Q3_TAG], searchText: 'prep board deck', latestNote: null, people: [], companies: [] },
    ],
    ...overrides,
  };
}

function stubDashboardFetch(payload: DashboardResponse = seededDashboard()) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function cardTitles(): string[] {
  return screen.getAllByTestId('up-next-card').map((card) => within(card).getByTestId('up-next-card-title').textContent ?? '');
}

async function renderDashboard(fetchMock = stubDashboardFetch()) {
  render(UpNextPage);
  await screen.findAllByTestId('up-next-card');
  await flushPromises();
  return fetchMock;
}

describe('UpNextPage — Story 1: glanceable default list', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders exactly the 5 default cards in lane-then-position order, cutting non-default lanes and the limit', async () => {
    await renderDashboard();

    expect(cardTitles()).toEqual(['Follow up with Sam', 'Write proposal', 'Review budget', 'Book venue', 'Order catering']);
  });

  it('shows an enriched card face with title, tag chip, note snippet + relative time, and linked people/companies, but no lane name', async () => {
    await renderDashboard();

    const cards = screen.getAllByTestId('up-next-card');
    const samCard = cards.find((c) => within(c).getByTestId('up-next-card-title').textContent === 'Follow up with Sam')!;

    expect(within(samCard).getByTestId('tag-chip').textContent).toContain('VIP');
    expect(within(samCard).getByTestId('up-next-note-snippet').textContent).toContain('Kickoff call went well');
    expect(within(samCard).getByTestId('up-next-card-links').textContent).toContain('Sam Rivera');
    expect(within(samCard).getByTestId('up-next-card-links').textContent).toContain('Acme Inc');
    expect(within(samCard).queryByTestId('up-next-card-lane')).toBeNull();
  });

  it('shows just the title for a bare card with no tags, note, or links', async () => {
    await renderDashboard();

    const cards = screen.getAllByTestId('up-next-card');
    const cateringCard = cards.find((c) => within(c).getByTestId('up-next-card-title').textContent === 'Order catering')!;

    expect(within(cateringCard).queryByTestId('tag-chip')).toBeNull();
    expect(within(cateringCard).queryByTestId('up-next-note-snippet')).toBeNull();
    expect(within(cateringCard).queryByTestId('up-next-card-links')).toBeNull();
  });
});

function findCard(title: string): HTMLElement {
  const cards = screen.getAllByTestId('up-next-card');
  return cards.find((c) => within(c).getByTestId('up-next-card-title').textContent === title)!;
}

describe('UpNextPage — Story 2: quick actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubActionsFetch(overrides: { placementOk?: boolean } = {}) {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/dashboard' && !options) {
        return Promise.resolve({ ok: true, json: async () => seededDashboard() });
      }
      if (/\/api\/tasks\/\d+\/placement/.test(url) && options?.method === 'PUT') {
        return Promise.resolve(
          overrides.placementOk === false
            ? { ok: false, json: async () => ({ error: { message: 'Task not found' } }) }
            : { ok: true, json: async () => ({}) },
        );
      }
      if (/\/api\/tasks\/\d+\/notes/.test(url) && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 99, taskId: 1, text: 'x', source: 'ui', createdAt: Date.now() }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("clicking quick done fires the placement PUT with the payload's quickDoneLane and a bottom-of-lane index, then refetches", async () => {
    const fetchMock = stubActionsFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();
    fetchMock.mockClear();

    await fireEvent.click(within(findCard('Write proposal')).getByTestId('up-next-quick-done'));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/2/placement',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ lane: 'Done', index: Number.MAX_SAFE_INTEGER }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard');
  });

  it('a non-ok placement response shows a dismissible inline error and still refetches (concurrent-change edge case, FR-014)', async () => {
    const fetchMock = stubActionsFetch({ placementOk: false });
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();
    fetchMock.mockClear();

    await fireEvent.click(within(findCard('Write proposal')).getByTestId('up-next-quick-done'));
    await flushPromises();

    const banner = await screen.findByTestId('up-next-error-banner');
    expect(banner.textContent).toContain('Task not found');
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard');

    await fireEvent.click(within(banner).getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('up-next-error-banner')).toBeNull();
  });

  it('submitting the inline add-note posts to POST /api/tasks/:id/notes and refetches (FR-015)', async () => {
    const fetchMock = stubActionsFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();
    fetchMock.mockClear();

    const samCard = findCard('Follow up with Sam');
    await fireEvent.update(within(samCard).getByTestId('up-next-note-input'), 'Sam replied — pricing approved');
    await fireEvent.click(within(samCard).getByTestId('up-next-note-submit'));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/1/notes',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Sam replied — pricing approved' }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard');
  });

  it('a whitespace-only note submission shows the shared validation message and fires no network request (FR-015)', async () => {
    const fetchMock = stubActionsFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();
    fetchMock.mockClear();

    const samCard = findCard('Follow up with Sam');
    await fireEvent.update(within(samCard).getByTestId('up-next-note-input'), '   ');
    await fireEvent.click(within(samCard).getByTestId('up-next-note-submit'));
    await flushPromises();

    expect(within(samCard).getByText('Note text is required')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/notes'), expect.anything());
  });
});

describe('UpNextPage — Story 3: configure the view', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubViewFetch() {
    let savedView: DashboardResponse['savedView'] = null;
    const putCalls: unknown[] = [];
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/dashboard' && !options) {
        return Promise.resolve({ ok: true, json: async () => seededDashboard({ savedView }) });
      }
      if (url === '/api/dashboard/view' && options?.method === 'PUT') {
        savedView = JSON.parse(options.body as string);
        putCalls.push(savedView);
        return Promise.resolve({ ok: true, json: async () => savedView });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, putCalls };
  }

  it('the display popup opens with exactly four toggles reflecting the current view (FR-008)', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-display'));
    await flushPromises();

    const popup = screen.getByTestId('up-next-display-popup');
    expect((within(popup).getByTestId('up-next-toggle-tags') as HTMLInputElement).checked).toBe(true);
    expect((within(popup).getByTestId('up-next-toggle-latestNote') as HTMLInputElement).checked).toBe(true);
    expect((within(popup).getByTestId('up-next-toggle-links') as HTMLInputElement).checked).toBe(true);
    expect((within(popup).getByTestId('up-next-toggle-lane') as HTMLInputElement).checked).toBe(false);
  });

  it('toggling lane on and latest note off previews live on the list behind the popup (FR-011)', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-display'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-display-popup');
    await fireEvent.click(within(popup).getByTestId('up-next-toggle-lane'));
    await fireEvent.click(within(popup).getByTestId('up-next-toggle-latestNote'));
    await flushPromises();

    const samCard = findCard('Follow up with Sam');
    expect(within(samCard).getByTestId('up-next-card-lane').textContent).toBe('Up Next');
    expect(within(samCard).queryByTestId('up-next-note-snippet')).toBeNull();
  });

  it('dismissing the display popup with a dirty pending state raises a discard confirmation; discarding reverts the list to the saved view', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-display'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-display-popup');
    await fireEvent.click(within(popup).getByTestId('up-next-toggle-lane'));
    await flushPromises();
    expect(within(findCard('Follow up with Sam')).getByTestId('up-next-card-lane')).toBeTruthy();

    await fireEvent.click(within(popup).getByRole('button', { name: 'Cancel' }));
    await flushPromises();

    const confirm = screen.getByTestId('up-next-discard-confirm');
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await flushPromises();

    expect(screen.queryByTestId('up-next-display-popup')).toBeNull();
    expect(within(findCard('Follow up with Sam')).queryByTestId('up-next-card-lane')).toBeNull();
  });

  it('OK saves the display popup state via PUT /api/dashboard/view and refetches', async () => {
    const { fetchMock, putCalls } = stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-display'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-display-popup');
    await fireEvent.click(within(popup).getByTestId('up-next-toggle-lane'));
    fetchMock.mockClear();
    await fireEvent.click(within(popup).getByRole('button', { name: 'OK' }));
    await flushPromises();

    expect(putCalls).toEqual([expect.objectContaining({ show: expect.objectContaining({ lane: true }) })]);
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard');
    expect(screen.queryByTestId('up-next-display-popup')).toBeNull();
    expect(within(findCard('Follow up with Sam')).getByTestId('up-next-card-lane')).toBeTruthy();
  });

  it('the filter popup offers lane, tag, text, and limit controls reflecting the current view (FR-009)', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-filter'));
    await flushPromises();

    const popup = screen.getByTestId('up-next-filter-popup');
    expect((within(popup).getByTestId('up-next-filter-lane-Up Next') as HTMLInputElement).checked).toBe(true);
    expect((within(popup).getByTestId('up-next-filter-lane-Waiting') as HTMLInputElement).checked).toBe(false);
    expect((within(popup).getByTestId('up-next-filter-text') as HTMLInputElement).value).toBe('');
    expect((within(popup).getByTestId('up-next-filter-limit') as HTMLInputElement).value).toBe('5');
  });

  it('adding a lane and raising the limit grows the previewed list live (FR-011)', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-filter'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-filter-popup');
    await fireEvent.click(within(popup).getByTestId('up-next-filter-lane-Waiting'));
    await fireEvent.update(within(popup).getByTestId('up-next-filter-limit'), '7');
    await flushPromises();

    expect(screen.getAllByTestId('up-next-card')).toHaveLength(7);
    expect(cardTitles()).toEqual(
      expect.arrayContaining(['Send invites', 'Chase invoice']),
    );
  });

  it('OK is disabled with zero lanes selected or an out-of-range/non-integer limit (invalid-view edge case)', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-filter'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-filter-popup');
    const okButton = within(popup).getByRole('button', { name: 'OK' }) as HTMLButtonElement;
    expect(okButton.disabled).toBe(false);

    await fireEvent.click(within(popup).getByTestId('up-next-filter-lane-Up Next'));
    await fireEvent.click(within(popup).getByTestId('up-next-filter-lane-In Progress'));
    await flushPromises();
    expect(okButton.disabled).toBe(true);

    await fireEvent.click(within(popup).getByTestId('up-next-filter-lane-Up Next'));
    await fireEvent.update(within(popup).getByTestId('up-next-filter-limit'), '0');
    await flushPromises();
    expect(okButton.disabled).toBe(true);
  });

  it('a filter combination matching nothing renders the styled no-match message, not a blank page (FR-013, SC-005)', async () => {
    stubViewFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-filter'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-filter-popup');
    await fireEvent.update(within(popup).getByTestId('up-next-filter-text'), 'zzz-no-match-zzz');
    await flushPromises();

    expect(screen.queryAllByTestId('up-next-card')).toHaveLength(0);
    expect(screen.getByTestId('up-next-no-match')).toBeTruthy();
  });
});

function taskDetailPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    title: 'Order catering',
    lane: 'In Progress',
    position: 1,
    createdAt: 5,
    people: [],
    notes: [],
    tags: [],
    companies: [],
    conversations: [],
    lanes: ['Up Next', 'In Progress', 'Waiting', 'Done'],
    ...overrides,
  };
}

describe('UpNextPage — Story 4: full card detail overlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubOverlayFetch(overrides: { dashboardOnClose?: DashboardResponse } = {}) {
    let dashboardCalls = 0;
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/dashboard' && !options) {
        dashboardCalls += 1;
        const payload = dashboardCalls > 1 && overrides.dashboardOnClose ? overrides.dashboardOnClose : seededDashboard();
        return Promise.resolve({ ok: true, json: async () => payload });
      }
      if (url === '/api/tasks/5' && !options) {
        return Promise.resolve({ ok: true, json: async () => taskDetailPayload() });
      }
      if (url === '/api/tasks/5/placement' && options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 5, title: 'Order catering', lane: 'Waiting', position: 0, createdAt: 5 }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('clicking a card outside its quick actions opens a modal rendering the full task detail', async () => {
    stubOverlayFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(within(findCard('Order catering')).getByTestId('up-next-card-title'));
    await flushPromises();

    expect(await screen.findAllByTestId('lane-pill')).toHaveLength(4);
  });

  it('clicking a quick action does not open the overlay', async () => {
    stubOverlayFetch();
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(within(findCard('Order catering')).getByTestId('up-next-quick-done'));
    await flushPromises();

    expect(screen.queryAllByTestId('lane-pill')).toHaveLength(0);
  });

  it('closing the overlay refetches and the list reflects a lane move made inside it', async () => {
    const dashboardAfterMove = seededDashboard();
    dashboardAfterMove.cards = dashboardAfterMove.cards.map((c) => (c.id === 5 ? { ...c, lane: 'Waiting' } : c));
    const fetchMock = stubOverlayFetch({ dashboardOnClose: dashboardAfterMove });
    render(UpNextPage);
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(within(findCard('Order catering')).getByTestId('up-next-card-title'));
    await flushPromises();
    await fireEvent.click(screen.getByRole('button', { name: 'Waiting' }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/5/placement',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ lane: 'Waiting', index: Number.MAX_SAFE_INTEGER }) }),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await flushPromises();

    expect(screen.queryAllByTestId('lane-pill')).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard');
    expect(cardTitles()).not.toContain('Order catering');
    expect(cardTitles()).toContain('Send invites');
  });

  it('the route never changes while the overlay opens and closes (FR-017)', async () => {
    stubOverlayFetch();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/up-next', component: UpNextPage }],
    });
    await router.push('/up-next');
    await router.isReady();
    render(UpNextPage, { global: { plugins: [router] } });
    await screen.findAllByTestId('up-next-card');
    await flushPromises();

    await fireEvent.click(within(findCard('Order catering')).getByTestId('up-next-card-title'));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/up-next');

    await fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/up-next');
  });
});

function stubSequentialDashboardFetch(payloads: DashboardResponse[]) {
  let dashboardCall = 0;
  let dashboardShouldFail = false;
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/dashboard' && !options) {
      if (dashboardShouldFail) {
        return Promise.reject(new Error('network error'));
      }
      const payload = payloads[Math.min(dashboardCall, payloads.length - 1)]!;
      dashboardCall += 1;
      return Promise.resolve({ ok: true, json: async () => payload });
    }
    if (url === '/api/dashboard/view' && options?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => JSON.parse(options.body as string) });
    }
    if (url === '/api/tasks/1' && !options) {
      return Promise.resolve({ ok: true, json: async () => taskDetailPayload({ id: 1, title: 'Follow up with Sam', lane: 'Up Next', lanes: ['Up Next', 'In Progress', 'Waiting', 'Done'] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    failNextDashboardCall: () => {
      dashboardShouldFail = true;
    },
    resumeDashboardCalls: () => {
      dashboardShouldFail = false;
    },
  };
}

describe('UpNextPage — Story 5: the page keeps itself current', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls GET /api/dashboard every 45s and applies list changes on an untouched page (FR-018)', async () => {
    vi.useFakeTimers();
    const initial = seededDashboard();
    const updated = seededDashboard();
    updated.cards = updated.cards.map((c) => (c.id === 4 ? { ...c, title: 'Book venue (confirmed)' } : c));
    const { fetchMock } = stubSequentialDashboardFetch([initial, updated]);

    render(UpNextPage);
    await flushPromises();
    expect(cardTitles()).toContain('Book venue');

    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/dashboard')).toHaveLength(2);
    expect(cardTitles()).toContain('Book venue (confirmed)');
  });

  it('a poll tick does not clobber an open display popup\'s pending preview (FR-019)', async () => {
    vi.useFakeTimers();
    const initial = seededDashboard();
    const updated = seededDashboard();
    updated.cards = updated.cards.map((c) => (c.id === 4 ? { ...c, title: 'Book venue (confirmed)' } : c));
    stubSequentialDashboardFetch([initial, updated]);

    render(UpNextPage);
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-display'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-display-popup');
    await fireEvent.click(within(popup).getByTestId('up-next-toggle-lane'));
    await flushPromises();

    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    // Pending preview (lane shown) survives the tick, and the tick's data change is visible too.
    expect(within(findCard('Follow up with Sam')).getByTestId('up-next-card-lane')).toBeTruthy();
    expect(cardTitles()).toContain('Book venue (confirmed)');
    expect(screen.getByTestId('up-next-display-popup')).toBeTruthy();
  });

  it('a poll tick does not clobber a typed-but-unsent note draft (FR-019)', async () => {
    vi.useFakeTimers();
    stubSequentialDashboardFetch([seededDashboard(), seededDashboard()]);

    render(UpNextPage);
    await flushPromises();

    const samCard = findCard('Follow up with Sam');
    await fireEvent.update(within(samCard).getByTestId('up-next-note-input'), 'Draft not yet sent');

    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    expect((within(findCard('Follow up with Sam')).getByTestId('up-next-note-input') as HTMLInputElement).value).toBe('Draft not yet sent');
  });

  it('a poll tick does not close an open overlay (FR-019)', async () => {
    vi.useFakeTimers();
    stubSequentialDashboardFetch([seededDashboard(), seededDashboard()]);

    render(UpNextPage);
    await flushPromises();
    await fireEvent.click(within(findCard('Follow up with Sam')).getByTestId('up-next-card-title'));
    await flushPromises();
    expect(screen.getAllByTestId('lane-pill')).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    expect(screen.getAllByTestId('lane-pill')).toHaveLength(4);
  });

  it('a remotely changed saved view is adopted by an untouched page via the next poll tick (FR-018)', async () => {
    vi.useFakeTimers();
    const initial = seededDashboard();
    const remoteChange = seededDashboard({
      savedView: { lanes: ['Up Next', 'In Progress'], tagIds: [], text: '', limit: 5, show: { tags: true, latestNote: true, links: true, lane: true } },
    });
    stubSequentialDashboardFetch([initial, remoteChange]);

    render(UpNextPage);
    await flushPromises();
    expect(within(findCard('Follow up with Sam')).queryByTestId('up-next-card-lane')).toBeNull();

    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    expect(within(findCard('Follow up with Sam')).getByTestId('up-next-card-lane')).toBeTruthy();
  });

  it('a remote saved-view change arriving while a popup is open changes nothing visible, and OK still saves the popup\'s own pending state (FR-019)', async () => {
    vi.useFakeTimers();
    const initial = seededDashboard();
    const remoteChange = seededDashboard({
      savedView: { lanes: ['Waiting'], tagIds: [], text: '', limit: 5, show: { tags: false, latestNote: false, links: false, lane: true } },
    });
    const putCalls: unknown[] = [];
    let dashboardCall = 0;
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/dashboard' && !options) {
        const payload = dashboardCall === 0 ? initial : remoteChange;
        dashboardCall += 1;
        return Promise.resolve({ ok: true, json: async () => payload });
      }
      if (url === '/api/dashboard/view' && options?.method === 'PUT') {
        putCalls.push(JSON.parse(options.body as string));
        return Promise.resolve({ ok: true, json: async () => JSON.parse(options.body as string) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(UpNextPage);
    await flushPromises();

    await fireEvent.click(screen.getByTestId('up-next-open-display'));
    await flushPromises();
    const popup = screen.getByTestId('up-next-display-popup');
    await fireEvent.click(within(popup).getByTestId('up-next-toggle-lane'));
    await flushPromises();

    // The remote saved-view change (lanes: [Waiting], all toggles off except lane) arrives via this tick.
    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    // Preview still reflects the popup's own pending edit (default lanes, lane toggle on) — untouched
    // by the remote view's toggles/lanes — and the untouched cards (Up Next/In Progress) are still shown.
    expect(within(findCard('Follow up with Sam')).getByTestId('up-next-card-lane')).toBeTruthy();
    expect(cardTitles()).toContain('Book venue');

    await fireEvent.click(within(popup).getByRole('button', { name: 'OK' }));
    await flushPromises();

    // OK saves the popup's own pending state (default lanes), not the remote view (Waiting only).
    expect(putCalls).toEqual([expect.objectContaining({ lanes: ['Up Next', 'In Progress'] })]);
  });

  it('a failed poll tick leaves the last-good list with no error UI; the next successful tick brings it current (FR-022)', async () => {
    vi.useFakeTimers();
    const initial = seededDashboard();
    const updated = seededDashboard();
    updated.cards = updated.cards.map((c) => (c.id === 4 ? { ...c, title: 'Book venue (confirmed)' } : c));
    const { failNextDashboardCall, resumeDashboardCalls } = stubSequentialDashboardFetch([initial, updated]);

    render(UpNextPage);
    await flushPromises();

    failNextDashboardCall();
    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    expect(cardTitles()).toContain('Book venue');
    expect(screen.queryByTestId('up-next-error-banner')).toBeNull();

    resumeDashboardCalls();
    await vi.advanceTimersByTimeAsync(45_000);
    await flushPromises();

    expect(cardTitles()).toContain('Book venue (confirmed)');
  });
});
