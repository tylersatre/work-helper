// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
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
                { id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 },
                { id: 2, title: 'Draft Q3 goals', lane: 'To Do', createdAt: 2 },
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
            { name: 'To Do', tasks: [{ id: 1, title: longTitle, lane: 'To Do', createdAt: 1 }] },
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
              { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 }] },
              { name: 'In Progress', tasks: [] },
              { name: 'Waiting', tasks: [] },
              { name: 'Done', tasks: [] },
            ],
          }),
        });
      }
      if (options?.method === 'PUT') {
        putCalls.push({ url, body: JSON.parse(options.body!) });
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, title: 'A', lane: 'In Progress', position: 0, createdAt: 1 }) });
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
        { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 }] },
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
        { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 }] },
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
            : { ok: true, json: async () => ({ id: 1, title: 'A', lane: 'Done', position: 0, createdAt: 1 }) },
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
            { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 },
            { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2 },
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
        { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 }] },
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
            { name: 'Done', tasks: [{ id: 1, title: 'A', lane: 'Done', position: 0, createdAt: 1 }] },
          ],
        };
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, title: 'A', lane: 'Done', position: 0, createdAt: 1 }) });
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
            { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 }] },
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
              { name: 'To Do', tasks: [{ id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 }] },
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
              { name: 'To Do', tasks: [{ id: 10, title: 'D', lane: 'To Do', position: 0, createdAt: 1 }] },
              {
                name: 'In Progress',
                tasks: [
                  { id: 1, title: 'X0', lane: 'In Progress', position: 0, createdAt: 2 },
                  { id: 2, title: 'X1', lane: 'In Progress', position: 1, createdAt: 3 },
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
                  { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 },
                  { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2 },
                  { id: 3, title: 'C', lane: 'To Do', position: 2, createdAt: 3 },
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
                  { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 },
                  { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2 },
                  { id: 3, title: 'C', lane: 'To Do', position: 2, createdAt: 3 },
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
                { id: 1, title: 'A', lane: 'To Do', position: 0, createdAt: 1 },
                { id: 2, title: 'B', lane: 'To Do', position: 1, createdAt: 2 },
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
});
