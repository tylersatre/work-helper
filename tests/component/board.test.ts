// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Board from '../../src/client/components/Board.vue';

function makeDataTransfer(taskId: number) {
  let payload = String(taskId);
  return {
    setData: vi.fn((_type: string, value: string) => {
      payload = value;
    }),
    getData: vi.fn(() => payload),
    effectAllowed: '',
    dropEffect: '',
  };
}

function laneByName(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name });
  return heading.closest('[data-testid="lane"]') as HTMLElement;
}

function cardTitles(lane: HTMLElement): string[] {
  return within(lane)
    .queryAllByTestId('task-card')
    .map((card) => card.textContent);
}

async function fireDragOver(el: HTMLElement, clientY: number): Promise<void> {
  const event = new Event('dragover', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
  el.dispatchEvent(event);
  await flushPromises();
}

async function fireDrop(el: HTMLElement, dataTransfer: unknown, clientY: number): Promise<void> {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true });
  el.dispatchEvent(event);
  await flushPromises();
}

function stubRect(el: HTMLElement, top: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
}

function laneChildOrder(lane: HTMLElement): string[] {
  const list = lane.querySelector('.lane-tasks')!;
  return Array.from(list.children).map((el) =>
    el.getAttribute('data-testid') === 'drop-indicator' ? 'INDICATOR' : (el.textContent ?? ''),
  );
}

const VIP_TAG = { id: 101, name: 'VIP', color: '#f59e0b' };
const Q3_TAG = { id: 102, name: 'Q3', color: '#3b82f6' };

function seededBoard() {
  return {
    lanes: [
      {
        name: 'To Do',
        tasks: [
          {
            id: 1,
            title: 'Follow up with Sam',
            lane: 'To Do',
            position: 0,
            createdAt: 1,
            tags: [VIP_TAG],
            searchText: 'follow up with sam\nkickoff call went well\nsam rivera',
          },
        ],
      },
      {
        name: 'In Progress',
        tasks: [
          {
            id: 2,
            title: 'Write proposal',
            lane: 'In Progress',
            position: 0,
            createdAt: 2,
            tags: [Q3_TAG],
            searchText: 'write proposal\nwaiting on budget numbers',
          },
          {
            id: 3,
            title: 'Review budget',
            lane: 'In Progress',
            position: 1,
            createdAt: 3,
            tags: [],
            searchText: 'review budget',
          },
        ],
      },
      {
        name: 'Waiting',
        tasks: [
          {
            id: 4,
            title: 'Book venue',
            lane: 'Waiting',
            position: 0,
            createdAt: 4,
            tags: [],
            searchText: 'book venue\nacme inc',
          },
        ],
      },
      {
        name: 'Done',
        tasks: [
          {
            id: 5,
            title: 'Prep board deck',
            lane: 'Done',
            position: 0,
            createdAt: 5,
            tags: [Q3_TAG],
            searchText: 'prep board deck',
          },
          {
            id: 6,
            title: 'Send recap',
            lane: 'Done',
            position: 1,
            createdAt: 6,
            tags: [Q3_TAG],
            searchText: 'send recap',
          },
        ],
      },
    ],
  };
}

function stubBoardFetch(board: ReturnType<typeof seededBoard> = seededBoard()) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => board });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderSeededBoard(fetchMock = stubBoardFetch()) {
  render(Board);
  await screen.findByRole('heading', { level: 2, name: 'To Do' });
  await flushPromises();
  return fetchMock;
}

async function typeSearch(value: string): Promise<void> {
  await fireEvent.update(screen.getByTestId('board-search-input'), value);
  await flushPromises();
}

function tagOptionElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.n-base-select-option'));
}

async function openTagFilter(): Promise<void> {
  const container = screen.getByTestId('board-tag-filter');
  const trigger = container.querySelector('.n-base-selection') as HTMLElement;
  await fireEvent.click(trigger);
  await flushPromises();
}

function tagOptionLabels(): string[] {
  return tagOptionElements().map((el) => el.textContent ?? '');
}

async function selectTag(name: string): Promise<void> {
  await openTagFilter();
  const option = tagOptionElements().find((el) => el.textContent === name);
  if (!option) {
    throw new Error(`No tag option "${name}" found among [${tagOptionLabels().join(', ')}]`);
  }
  await fireEvent.click(option);
  await flushPromises();
}

describe('Board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders all configured lanes left-to-right in config order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['To Do', 'In Progress', 'Waiting', 'Done']);
  });

  it('renders task cards inside the correct lane in given order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            {
              name: 'To Do',
              tasks: [
                { id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, tags: [], searchText: '' },
                { id: 2, title: 'Draft Q3 goals', lane: 'To Do', createdAt: 2, tags: [], searchText: '' },
              ],
            },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);

    const toDoHeading = await screen.findByRole('heading', { level: 2, name: 'To Do' });
    const lane = toDoHeading.closest('[data-testid="lane"]') as HTMLElement;
    const cardTitles = within(lane).getAllByTestId('task-card').map((card) => card.textContent);

    expect(cardTitles).toEqual(['Follow up with Sam', 'Draft Q3 goals']);
  });

  it('renders a very long title in full with CSS wrapping instead of breaking the layout', async () => {
    const longTitle = 'A'.repeat(300);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [{ id: 1, title: longTitle, lane: 'To Do', createdAt: 1, tags: [], searchText: '' }] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);

    const card = await screen.findByTestId('task-card');
    expect(card.textContent).toBe(longTitle);

    const style = getComputedStyle(card);
    expect(['break-word', 'anywhere']).toContain(style.overflowWrap);
  });

  it('dropping a card on another lane optimistically moves it and issues PUT /api/tasks/:id/placement with the destination lane', async () => {
    const putCalls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            lanes: [
              { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
              { name: 'In Progress', tasks: [] },
              { name: 'Waiting', tasks: [] },
              { name: 'Done', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'PUT') {
        putCalls.push({ url, body: JSON.parse(options.body!) });
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, title: 'A', lane: 'In Progress', position: 0, createdAt: 1, tags: [], searchText: '' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: makeDataTransfer(1) });
    await flushPromises();

    expect(cardTitles(laneByName('To Do'))).toEqual([]);
    expect(cardTitles(laneByName('In Progress'))).toEqual(['A']);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.url).toBe('/api/tasks/1/placement');
    expect(putCalls[0]!.body).toEqual({ lane: 'In Progress', index: 0 });
  });

  it('a failed save reverts the board via refetch and shows a dismissible error banner', async () => {
    const served = {
      lanes: [
        { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({ ok: true, json: async () => served });
      }
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: async () => ({ error: { message: 'boom' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: makeDataTransfer(1) });
    await flushPromises();

    const banner = await screen.findByTestId('error-banner');
    expect(banner.textContent).toContain("Couldn't save that move — the board has been restored.");
    expect(cardTitles(laneByName('To Do'))).toEqual(['A']);
    expect(cardTitles(laneByName('In Progress'))).toEqual([]);

    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('error-banner')).toBeNull();
  });

  it('the error banner clears on the next successful move', async () => {
    const served = {
      lanes: [
        { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
    let putShouldFail = true;
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({ ok: true, json: async () => served });
      }
      if (options?.method === 'PUT') {
        const failed = putShouldFail;
        putShouldFail = false;
        return Promise.resolve(
          failed
            ? { ok: false, json: async () => ({ error: { message: 'boom' } }) }
            : { ok: true, json: async () => ({ id: 1, title: 'A', lane: 'Done', position: 0, createdAt: 1, tags: [], searchText: '' }) },
        );
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: makeDataTransfer(1) });
    await flushPromises();
    expect(await screen.findByTestId('error-banner')).toBeTruthy();

    await fireEvent.drop(laneByName('Done'), { dataTransfer: makeDataTransfer(1) });
    await flushPromises();

    expect(screen.queryByTestId('error-banner')).toBeNull();
  });

  it('two rapid successive drops issue placement PUTs sequentially in drop order, and the final board reflects both moves', async () => {
    const served = {
      lanes: [
        {
          name: 'To Do',
          tasks: [
            { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' },
            { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2, tags: [], searchText: '' },
          ],
        },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
    const pending: { resolve: () => void; url: string }[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({ ok: true, json: async () => served });
      }
      if (options?.method === 'PUT') {
        return new Promise((resolve) => {
          pending.push({
            url,
            resolve: () => resolve({ ok: true, json: async () => ({}) }),
          });
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: makeDataTransfer(1) });
    await fireEvent.drop(laneByName('Done'), { dataTransfer: makeDataTransfer(2) });
    await flushPromises();

    expect(pending).toHaveLength(1);
    expect(pending[0]!.url).toBe('/api/tasks/1/placement');

    pending[0]!.resolve();
    await flushPromises();
    await flushPromises();

    expect(pending).toHaveLength(2);
    expect(pending[1]!.url).toBe('/api/tasks/2/placement');

    pending[1]!.resolve();
    await flushPromises();

    expect(cardTitles(laneByName('In Progress'))).toEqual(['A']);
    expect(cardTitles(laneByName('Done'))).toEqual(['B']);
  });

  it('a failed save does not discard a later queued move — the board reconciles to true server state, not a stale mid-chain revert', async () => {
    let served = {
      lanes: [
        { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
    let putCallCount = 0;
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({ ok: true, json: async () => served });
      }
      if (options?.method === 'PUT') {
        putCallCount++;
        if (putCallCount === 1) {
          // First move (to In Progress) fails server-side; server state is unchanged.
          return Promise.resolve({ ok: false, json: async () => ({ error: { message: 'boom' } }) });
        }
        // Second move (to Done) succeeds server-side — the server actually moves A to Done,
        // regardless of the first move's failure, since placement targets are absolute, not deltas.
        served = {
          lanes: [
            { name: 'To Do', tasks: [] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [{ id: 1, title: 'A', lane: 'Done', position: 0, createdAt: 1, tags: [], searchText: '' }] },
          ],
        };
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, title: 'A', lane: 'Done', position: 0, createdAt: 1, tags: [], searchText: '' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: makeDataTransfer(1) });
    await fireEvent.drop(laneByName('Done'), { dataTransfer: makeDataTransfer(1) });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    // Server truth is Done:[A] (the second, successful move). The UI must match it —
    // never silently show a state (e.g. reverted to To Do) that diverges from what's saved.
    expect(cardTitles(laneByName('Done'))).toEqual(['A']);
    expect(cardTitles(laneByName('To Do'))).toEqual([]);
    expect(cardTitles(laneByName('In Progress'))).toEqual([]);
  });

  it('dragend without a drop leaves the rendered board unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const card = screen.getByTestId('task-card');
    await fireEvent.dragStart(card, { dataTransfer: makeDataTransfer(1) });
    await fireEvent.dragEnd(card);
    await flushPromises();

    expect(cardTitles(laneByName('To Do'))).toEqual(['A']);
    expect(cardTitles(laneByName('In Progress'))).toEqual([]);
  });

  it('dropping non-card content (empty dataTransfer, e.g. a file or text selection from outside the app) does not move anything or call the placement endpoint', async () => {
    const putCalls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            lanes: [
              { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
              { name: 'In Progress', tasks: [] },
              { name: 'Waiting', tasks: [] },
              { name: 'Done', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'PUT') {
        putCalls.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: { getData: () => '' } });
    await flushPromises();

    expect(cardTitles(laneByName('To Do'))).toEqual(['A']);
    expect(cardTitles(laneByName('In Progress'))).toEqual([]);
    expect(putCalls).toEqual([]);
    expect(screen.queryByTestId('error-banner')).toBeNull();
  });

  it('dropping a card between two cards of another lane renders it exactly between them and sends that exact index (US2-S1)', async () => {
    const putCalls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            lanes: [
              { name: 'To Do', tasks: [{ id: 10, title: 'D', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
              {
                name: 'In Progress',
                tasks: [
                  { id: 1, title: 'X0', lane: 'In Progress', position: 0, createdAt: 2, tags: [], searchText: '' },
                  { id: 2, title: 'X1', lane: 'In Progress', position: 1, createdAt: 3, tags: [], searchText: '' },
                ],
              },
              { name: 'Waiting', tasks: [] },
              { name: 'Done', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'PUT') {
        putCalls.push({ url, body: JSON.parse(options.body!) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const inProgress = laneByName('In Progress');
    const [x0, x1] = within(inProgress).getAllByTestId('task-card');
    stubRect(x0!, 0, 40);
    stubRect(x1!, 40, 40);

    await fireDragOver(inProgress, 45);
    expect(laneChildOrder(inProgress)).toEqual(['X0', 'INDICATOR', 'X1']);

    await fireDrop(inProgress, makeDataTransfer(10), 45);

    expect(cardTitles(laneByName('To Do'))).toEqual([]);
    expect(cardTitles(inProgress)).toEqual(['X0', 'D', 'X1']);
    expect(putCalls).toEqual([{ url: '/api/tasks/10/placement', body: { lane: 'In Progress', index: 1 } }]);
    expect(within(inProgress).queryByTestId('drop-indicator')).toBeNull();
  });

  it('dragging the bottom card of a lane above its top card reorders the lane and sends index 0 (US2-S2)', async () => {
    const putCalls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            lanes: [
              {
                name: 'To Do',
                tasks: [
                  { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' },
                  { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2, tags: [], searchText: '' },
                  { id: 3, title: 'C', lane: 'To Do', position: 2, createdAt: 3, tags: [], searchText: '' },
                ],
              },
              { name: 'In Progress', tasks: [] },
              { name: 'Waiting', tasks: [] },
              { name: 'Done', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'PUT') {
        putCalls.push({ url, body: JSON.parse(options.body!) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const toDo = laneByName('To Do');
    const [a, b, c] = within(toDo).getAllByTestId('task-card');
    stubRect(a!, 0, 40);
    stubRect(b!, 40, 40);
    stubRect(c!, 80, 40);

    await fireEvent.dragStart(c!, { dataTransfer: makeDataTransfer(3) });
    await fireDragOver(toDo, 10);
    await fireDrop(toDo, makeDataTransfer(3), 10);

    expect(cardTitles(toDo)).toEqual(['C', 'A', 'B']);
    expect(putCalls).toEqual([{ url: '/api/tasks/3/placement', body: { lane: 'To Do', index: 0 } }]);
  });

  it('dragging the top card of a 3-card lane down between the other two reorders [A,B,C] -> [B,A,C] and sends index 1 (quickstart scenario 7)', async () => {
    const putCalls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url === '/api/board' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            lanes: [
              {
                name: 'To Do',
                tasks: [
                  { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' },
                  { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2, tags: [], searchText: '' },
                  { id: 3, title: 'C', lane: 'To Do', position: 2, createdAt: 3, tags: [], searchText: '' },
                ],
              },
              { name: 'In Progress', tasks: [] },
              { name: 'Waiting', tasks: [] },
              { name: 'Done', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'PUT') {
        putCalls.push({ url, body: JSON.parse(options.body!) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const toDo = laneByName('To Do');
    const [a, b, c] = within(toDo).getAllByTestId('task-card');
    stubRect(a!, 0, 40);
    stubRect(b!, 40, 40);
    stubRect(c!, 80, 40);

    await fireEvent.dragStart(a!, { dataTransfer: makeDataTransfer(1) });
    await fireDragOver(toDo, 80);
    await fireDrop(toDo, makeDataTransfer(1), 80);

    expect(cardTitles(toDo)).toEqual(['B', 'A', 'C']);
    expect(putCalls).toEqual([{ url: '/api/tasks/1/placement', body: { lane: 'To Do', index: 1 } }]);
  });

  it('removes the drop indicator on dragend without a drop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            {
              name: 'To Do',
              tasks: [
                { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' },
                { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2, tags: [], searchText: '' },
              ],
            },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const toDo = laneByName('To Do');
    const [a, b] = within(toDo).getAllByTestId('task-card');
    stubRect(a!, 0, 40);
    stubRect(b!, 40, 40);

    await fireEvent.dragStart(a!, { dataTransfer: makeDataTransfer(1) });
    await fireDragOver(toDo, 60);
    expect(within(toDo).queryByTestId('drop-indicator')).not.toBeNull();

    await fireEvent.dragEnd(a!);
    await flushPromises();

    expect(within(toDo).queryByTestId('drop-indicator')).toBeNull();
  });

  it('a drop that lands while the failure-recovery refetch is in flight is not silently discarded from the UI', async () => {
    let served = {
      lanes: [
        {
          name: 'To Do',
          tasks: [
            { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' },
            { id: 2, title: 'C', lane: 'To Do', position: 1, createdAt: 2, tags: [], searchText: '' },
          ],
        },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
    let getBoardCalls = 0;
    let resolveRecoveryGet: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url === '/api/board' && !options) {
        getBoardCalls += 1;
        if (getBoardCalls === 1) {
          return Promise.resolve({ ok: true, json: async () => served });
        }
        // The failure-recovery refetch is held open until the test releases it.
        return new Promise((resolve) => {
          resolveRecoveryGet = resolve;
        });
      }
      if (options?.method === 'PUT' && url === '/api/tasks/1/placement') {
        return Promise.resolve({ ok: false, json: async () => ({ error: { message: 'boom' } }) });
      }
      if (options?.method === 'PUT' && url === '/api/tasks/2/placement') {
        served = {
          lanes: [
            { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [{ id: 2, title: 'C', lane: 'Done', position: 0, createdAt: 2, tags: [], searchText: '' }] },
          ],
        };
        return Promise.resolve({ ok: true, json: async () => ({ id: 2, title: 'C', lane: 'Done', position: 0, createdAt: 2, tags: [], searchText: '' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    // Drop A into In Progress; the PUT fails, triggering the failure-recovery refetch (held open).
    await fireEvent.drop(laneByName('In Progress'), { dataTransfer: makeDataTransfer(1) });
    await flushPromises();
    await flushPromises();
    expect(resolveRecoveryGet).not.toBeNull();

    // While that refetch is still in flight, drop a DIFFERENT card (C) into Done.
    await fireEvent.drop(laneByName('Done'), { dataTransfer: makeDataTransfer(2) });
    await flushPromises();
    expect(cardTitles(laneByName('Done'))).toEqual(['C']);

    // Now the stale refetch resolves, reflecting server state from BEFORE C's move.
    resolveRecoveryGet!({
      ok: true,
      json: async () => ({
        lanes: [
          {
            name: 'To Do',
            tasks: [
              { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' },
              { id: 2, title: 'C', lane: 'To Do', position: 1, createdAt: 2, tags: [], searchText: '' },
            ],
          },
          { name: 'In Progress', tasks: [] },
          { name: 'Waiting', tasks: [] },
          { name: 'Done', tasks: [] },
        ],
      }),
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    // C's successful move must not have been silently erased by the stale refetch response.
    expect(cardTitles(laneByName('Done'))).toEqual(['C']);
  });

  it('a lane with zero tasks renders the empty placeholder; a lane with tasks does not', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    expect(within(laneByName('To Do')).queryByTestId('lane-empty')).toBeNull();
    expect(within(laneByName('In Progress')).queryByTestId('lane-empty')).not.toBeNull();
  });

  it('each lane renders its header plus a dedicated scrolling card-list container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const lane = laneByName('To Do');
    expect(lane.querySelector('h2')?.textContent).toBe('To Do');
    const list = lane.querySelector('.lane-tasks');
    expect(list).toBeTruthy();
    expect(getComputedStyle(list as HTMLElement).overflowY).toBe('auto');
  });

  it('dragging a card over an empty lane still shows a drop indicator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanes: [
            { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1, tags: [], searchText: '' }] },
            { name: 'In Progress', tasks: [] },
            { name: 'Waiting', tasks: [] },
            { name: 'Done', tasks: [] },
          ],
        }),
      }),
    );

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    const card = screen.getByTestId('task-card');
    await fireEvent.dragStart(card, { dataTransfer: makeDataTransfer(1) });

    const inProgress = laneByName('In Progress');
    await fireDragOver(inProgress, 50);

    expect(within(inProgress).queryByTestId('drop-indicator')).not.toBeNull();
  });

  it('fetchBoard rejects instead of assigning board.value to a non-2xx error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
      }),
    );

    const wrapper = mount(Board);
    await flushPromises();

    await expect(wrapper.vm.fetchBoard()).rejects.toThrow();
  });
});

describe('Board filtering - US1: find a card by typing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('with no filter applied, shows all six cards, the filter bar, an empty search input, and neither indicator nor clear control (scenario 1)', async () => {
    await renderSeededBoard();

    expect(screen.getByTestId('board-filter-bar')).toBeTruthy();
    expect((screen.getByTestId('board-search-input') as HTMLInputElement).value).toBe('');
    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal', 'Review budget']);
    expect(cardTitles(laneByName('Waiting'))).toEqual(['Book venue']);
    expect(cardTitles(laneByName('Done'))).toEqual(['Prep board deck', 'Send recap']);
    expect(screen.queryByTestId('board-filter-indicator')).toBeNull();
    expect(screen.queryByTestId('board-clear-filters')).toBeNull();
  });

  it('typing "SAM" narrows live on the input event with no fetch and no button press, showing the indicator and clear control (scenario 2)', async () => {
    const fetchMock = await renderSeededBoard();
    const callsBeforeTyping = fetchMock.mock.calls.length;

    await typeSearch('SAM');

    expect(fetchMock.mock.calls.length).toBe(callsBeforeTyping);
    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
    expect(within(laneByName('In Progress')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('Waiting')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('Done')).queryByTestId('lane-empty')).not.toBeNull();
    expect(screen.getByTestId('board-filter-indicator').textContent).toContain('1 of 6 cards');
    expect(screen.getByTestId('board-clear-filters')).toBeTruthy();
  });

  it('searching "budget" matches note text and title, leaving the other three lanes empty (scenario 3)', async () => {
    await renderSeededBoard();

    await typeSearch('budget');

    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal', 'Review budget']);
    expect(within(laneByName('To Do')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('Waiting')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('Done')).queryByTestId('lane-empty')).not.toBeNull();
  });

  it('"rivera" matches only on a linked person\'s name; "acme" matches only on a linked company\'s name (scenario 4)', async () => {
    await renderSeededBoard();

    await typeSearch('rivera');
    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
    expect(cardTitles(laneByName('Waiting'))).toEqual([]);

    await typeSearch('acme');
    expect(cardTitles(laneByName('To Do'))).toEqual([]);
    expect(cardTitles(laneByName('Waiting'))).toEqual(['Book venue']);
  });

  it('"zebra" shows four empty lanes, the "No cards match" message, and "0 of 6 cards" (scenario 5)', async () => {
    await renderSeededBoard();

    await typeSearch('zebra');

    expect(within(laneByName('To Do')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('In Progress')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('Waiting')).queryByTestId('lane-empty')).not.toBeNull();
    expect(within(laneByName('Done')).queryByTestId('lane-empty')).not.toBeNull();
    expect(screen.getByTestId('board-no-matches')).toBeTruthy();
    expect(screen.getByTestId('board-filter-indicator').textContent).toContain('0 of 6 cards');
  });

  it('a whitespace-only search counts as no filter, and " budget " matches the same cards as "budget" (FR-004)', async () => {
    await renderSeededBoard();

    await typeSearch('   ');
    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
    expect(screen.queryByTestId('board-filter-indicator')).toBeNull();
    expect(screen.queryByTestId('board-clear-filters')).toBeNull();

    await typeSearch(' budget ');
    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal', 'Review budget']);
  });
});

describe('Board filtering - US2: narrow the board by tag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the tag selector offers exactly Q3 and VIP, alphabetically, with nothing selected (scenario 1)', async () => {
    await renderSeededBoard();

    await openTagFilter();

    expect(tagOptionLabels()).toEqual(['Q3', 'VIP']);
  });

  it('selecting Q3 shows exactly its three cards; adding VIP unions to four with the indicator reading "4 of 6 cards" (scenario 2)', async () => {
    await renderSeededBoard();

    await selectTag('Q3');

    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal']);
    expect(cardTitles(laneByName('Done'))).toEqual(['Prep board deck', 'Send recap']);
    expect(cardTitles(laneByName('To Do'))).toEqual([]);
    expect(cardTitles(laneByName('Waiting'))).toEqual([]);

    await selectTag('VIP');

    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
    expect(screen.getByTestId('board-filter-indicator').textContent).toContain('4 of 6 cards');
  });

  it('with Q3 selected, typing "budget" leaves only "Write proposal" visible (intersection, scenario 3)', async () => {
    await renderSeededBoard();

    await selectTag('Q3');
    await typeSearch('budget');

    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal']);
    expect(cardTitles(laneByName('Done'))).toEqual([]);
  });

  it('a tag that stops being used on any card stays selected and listed rather than vanishing (FR-007)', async () => {
    const fetchMock = stubBoardFetch();
    const wrapper = mount(Board, { attachTo: document.body });
    await flushPromises();

    await selectTag('Q3');
    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal']);

    const boardWithoutQ3 = seededBoard();
    boardWithoutQ3.lanes[1]!.tasks = boardWithoutQ3.lanes[1]!.tasks.map((task) => ({ ...task, tags: [] }));
    boardWithoutQ3.lanes[3]!.tasks = boardWithoutQ3.lanes[3]!.tasks.map((task) => ({ ...task, tags: [] }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => boardWithoutQ3 });

    await wrapper.vm.fetchBoard();
    await flushPromises();

    expect(tagOptionLabels()).toContain('Q3');
    expect(cardTitles(laneByName('In Progress'))).toEqual([]);
    expect(cardTitles(laneByName('Done'))).toEqual([]);

    wrapper.unmount();
  });

  it('a persisted tag filter shows the tag\'s real name on a cold mount, even when no card on the fetched board carries it (FR-007 cold start)', async () => {
    window.localStorage.setItem('wh.board.filter', JSON.stringify({ text: '', tagIds: [Q3_TAG.id] }));

    const boardWithoutQ3 = seededBoard();
    for (const lane of boardWithoutQ3.lanes) {
      lane.tasks = lane.tasks.map((task) => ({ ...task, tags: task.tags.filter((tag) => tag.id !== Q3_TAG.id) }));
    }
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/tags') {
        return Promise.resolve({ ok: true, json: async () => [VIP_TAG, Q3_TAG] });
      }
      return Promise.resolve({ ok: true, json: async () => boardWithoutQ3 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });
    await flushPromises();
    await openTagFilter();

    expect(tagOptionLabels()).toEqual(['Q3', 'VIP']);
    expect(tagOptionLabels()).not.toContain(String(Q3_TAG.id));
  });
});

describe('Board filtering - US3: the filter sticks until cleared', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a stored filter restores the search input, tag selection, and narrowed board on mount (scenario 1)', async () => {
    window.localStorage.setItem('wh.board.filter', JSON.stringify({ text: 'budget', tagIds: [Q3_TAG.id] }));

    await renderSeededBoard();

    expect((screen.getByTestId('board-search-input') as HTMLInputElement).value).toBe('budget');
    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal']);
    expect(cardTitles(laneByName('Done'))).toEqual([]);
    expect(screen.getByTestId('board-filter-indicator')).toBeTruthy();
  });

  it('the clear control empties the text, deselects every tag, removes the storage key, and restores all six cards (scenario 2)', async () => {
    window.localStorage.setItem('wh.board.filter', JSON.stringify({ text: 'budget', tagIds: [Q3_TAG.id] }));

    await renderSeededBoard();
    await fireEvent.click(screen.getByTestId('board-clear-filters'));
    await flushPromises();

    expect((screen.getByTestId('board-search-input') as HTMLInputElement).value).toBe('');
    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
    expect(cardTitles(laneByName('In Progress'))).toEqual(['Write proposal', 'Review budget']);
    expect(cardTitles(laneByName('Waiting'))).toEqual(['Book venue']);
    expect(cardTitles(laneByName('Done'))).toEqual(['Prep board deck', 'Send recap']);
    expect(screen.queryByTestId('board-filter-indicator')).toBeNull();
    expect(window.localStorage.getItem('wh.board.filter')).toBeNull();
  });
});

describe('Board filtering - US4: dragging while filtered', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function putCallsFrom(fetchMock: ReturnType<typeof stubBoardFetch>): { url: string; body: unknown }[] {
    return fetchMock.mock.calls
      .map((call) => call as [string, { method?: string; body?: string } | undefined])
      .filter(([, options]) => options?.method === 'PUT')
      .map(([url, options]) => ({ url, body: JSON.parse(options!.body!) }));
  }

  it('a filtered cross-lane drop appends at the destination lane\'s unfiltered task count, not the filtered/rendered count (scenario 1)', async () => {
    const fetchMock = stubBoardFetch();
    // Override the generic fetch stub so PUT requests resolve distinctly from the initial GET.
    fetchMock.mockImplementation((url: string, options?: { method?: string }) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => seededBoard() });
    });
    await renderSeededBoard(fetchMock);

    await selectTag('Q3');

    await fireEvent.drop(laneByName('Waiting'), { dataTransfer: makeDataTransfer(2) });
    await flushPromises();

    const puts = putCallsFrom(fetchMock);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual({ url: '/api/tasks/2/placement', body: { lane: 'Waiting', index: 1 } });
  });

  it('a within-lane drop while filtered issues no placement request at all and leaves board state untouched (scenario 2)', async () => {
    const fetchMock = stubBoardFetch();
    fetchMock.mockImplementation((url: string, options?: { method?: string }) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => seededBoard() });
    });
    await renderSeededBoard(fetchMock);

    await selectTag('Q3');

    const done = laneByName('Done');
    const [prepDeck, sendRecap] = within(done).getAllByTestId('task-card');
    stubRect(prepDeck!, 0, 40);
    stubRect(sendRecap!, 40, 40);

    await fireEvent.dragStart(sendRecap!, { dataTransfer: makeDataTransfer(6) });
    await fireDragOver(done, 10);
    await fireDrop(done, makeDataTransfer(6), 10);

    expect(putCallsFrom(fetchMock)).toEqual([]);
    expect(cardTitles(done)).toEqual(['Prep board deck', 'Send recap']);
  });

  it('while filtered, no drop indicator is rendered in any lane; unfiltered drag still shows one (U12, non-regression)', async () => {
    await renderSeededBoard();

    const inProgress = laneByName('In Progress');
    const [writeProposal] = within(inProgress).getAllByTestId('task-card');
    stubRect(writeProposal!, 0, 40);

    await fireEvent.dragStart(writeProposal!, { dataTransfer: makeDataTransfer(2) });
    await fireDragOver(inProgress, 5);
    expect(within(inProgress).queryByTestId('drop-indicator')).not.toBeNull();
    await fireEvent.dragEnd(writeProposal!);
    await flushPromises();

    await selectTag('Q3');

    const doneAfterFilter = laneByName('Done');
    const [prepDeck] = within(doneAfterFilter).getAllByTestId('task-card');
    stubRect(prepDeck!, 0, 40);
    await fireEvent.dragStart(prepDeck!, { dataTransfer: makeDataTransfer(5) });
    await fireDragOver(doneAfterFilter, 5);

    expect(within(doneAfterFilter).queryByTestId('drop-indicator')).toBeNull();
  });
});

function boardWithArchivedCard() {
  return {
    lanes: [
      {
        name: 'To Do',
        tasks: [
          { id: 1, title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1, archived: false, tags: [], searchText: 'follow up with sam' },
          { id: 2, title: 'Draft goals', lane: 'To Do', position: 1, createdAt: 2, archived: true, tags: [], searchText: 'draft goals' },
        ],
      },
      { name: 'In Progress', tasks: [] },
      { name: 'Waiting', tasks: [] },
      { name: 'Done', tasks: [] },
    ],
  };
}

describe('Board archiving - US2: default-hide and reveal (027-card-archive)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('with the toggle absent/off, an archived card is never rendered in any lane even though GET /api/board includes it (FR-004)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithArchivedCard() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    expect(screen.queryByTestId('show-archived-toggle')).toBeTruthy();
    expect((screen.getByTestId('show-archived-toggle') as HTMLInputElement).checked).toBe(false);
    expect(cardTitles(laneByName('To Do'))).toEqual(['Follow up with Sam']);
  });

  it('toggling "Show archived" on reveals the archived card dimmed with an archived-badge, in its normal manual-order position (FR-006, scenario 1)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithArchivedCard() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await fireEvent.click(screen.getByTestId('show-archived-toggle'));
    await flushPromises();

    const cards = within(laneByName('To Do')).getAllByTestId('task-card');
    expect(cards.map((card) => card.textContent)).toEqual(['Follow up with Sam', 'Draft goalsArchived']);
    const badges = within(laneByName('To Do')).getAllByTestId('archived-badge');
    expect(badges).toHaveLength(1);
  });
});

describe('Board archiving - US3: search/tag filter parity for archived cards (027-card-archive)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function boardWithTwoArchivedCards() {
    return {
      lanes: [
        {
          name: 'To Do',
          tasks: [
            { id: 1, title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1, archived: true, tags: [], searchText: 'follow up with sam' },
            { id: 2, title: 'Draft goals', lane: 'To Do', position: 1, createdAt: 2, archived: true, tags: [], searchText: 'draft goals' },
          ],
        },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
  }

  it('with the toggle on, searching narrows two archived cards down to the one matching, still dimmed and badged (FR-011, scenario 1)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithTwoArchivedCards() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });
    await fireEvent.click(screen.getByTestId('show-archived-toggle'));
    await flushPromises();

    await typeSearch('sam');

    const cards = within(laneByName('To Do')).getAllByTestId('task-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.textContent).toContain('Follow up with Sam');
    expect(within(laneByName('To Do')).getByTestId('archived-badge')).toBeTruthy();
  });

  it('with the toggle off, an archived card that would otherwise match the active search stays hidden regardless (FR-012, edge case)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithTwoArchivedCards() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await typeSearch('sam');

    expect(within(laneByName('To Do')).queryAllByTestId('task-card')).toHaveLength(0);
  });

  function boardWithTaggedArchivedCards() {
    return {
      lanes: [
        {
          name: 'To Do',
          tasks: [
            { id: 1, title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1, archived: true, tags: [Q3_TAG], searchText: 'follow up with sam' },
            { id: 2, title: 'Draft goals', lane: 'To Do', position: 1, createdAt: 2, archived: true, tags: [VIP_TAG], searchText: 'draft goals' },
          ],
        },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    };
  }

  it('with the toggle on, the tag filter applies to archived cards using the same matching rules as active cards (FR-011 tag parity)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithTaggedArchivedCards() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });
    await fireEvent.click(screen.getByTestId('show-archived-toggle'));
    await flushPromises();

    await selectTag('Q3');

    const cards = within(laneByName('To Do')).getAllByTestId('task-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.textContent).toContain('Follow up with Sam');
    expect(within(laneByName('To Do')).getByTestId('archived-badge')).toBeTruthy();
  });

  it('with the toggle off, an archived card matching the selected tag stays hidden regardless (FR-012 tag parity)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithTaggedArchivedCards() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });

    await selectTag('Q3');

    expect(within(laneByName('To Do')).queryAllByTestId('task-card')).toHaveLength(0);
  });
});

describe('Board archiving - US5: toggle persistence (027-card-archive)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('with wh.board.showArchived already stored as true, a freshly mounted Board renders the toggle checked and archived cards visible with no interaction (FR-015, scenario 1)', async () => {
    window.localStorage.setItem('wh.board.showArchived', 'true');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => boardWithArchivedCard() }));

    render(Board);
    await screen.findByRole('heading', { level: 2, name: 'To Do' });
    await flushPromises();

    expect((screen.getByTestId('show-archived-toggle') as HTMLInputElement).checked).toBe(true);
    expect(cardTitles(laneByName('To Do'))).toContain('Follow up with Sam');
    expect(within(laneByName('To Do')).getByTestId('archived-badge')).toBeTruthy();
  });
});
