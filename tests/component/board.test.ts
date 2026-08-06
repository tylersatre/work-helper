// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/vue';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Board from '../../src/client/components/Board.vue';

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
});
