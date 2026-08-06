// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskNotes from '../../src/client/components/TaskNotes.vue';
import { absoluteLocal } from '../../src/client/utils/time.js';
import type { Note } from '../../src/shared/types.js';

describe('TaskNotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders notes newest first (server order, never re-sorted)', () => {
    const notes: Note[] = [
      { id: 2, taskId: 1, text: 'Second note', source: 'ui', createdAt: 2 },
      { id: 1, taskId: 1, text: 'First note', source: 'ui', createdAt: 1 },
    ];

    render(TaskNotes, { props: { taskId: 1, notes } });

    const items = screen.getAllByTestId('note');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Second note');
    expect(items[1]?.textContent).toContain('First note');
  });

  it('shows the "You" label and a relative timestamp with a <time> datetime + absolute local hover title', () => {
    const thenMs = Date.parse('2026-08-04T18:00:00Z');
    const notes: Note[] = [{ id: 1, taskId: 1, text: 'Waiting on budget numbers', source: 'ui', createdAt: thenMs }];

    render(TaskNotes, { props: { taskId: 1, notes } });

    const note = screen.getByTestId('note');
    expect(note.textContent).toContain('You');

    const timeEl = note.querySelector('time');
    expect(timeEl).toBeTruthy();
    expect(timeEl?.getAttribute('datetime')).toBe(new Date(thenMs).toISOString());
    expect(timeEl?.getAttribute('title')).toBe(absoluteLocal(thenMs));
  });

  it('empty state has no notes but still shows the add-note input', () => {
    render(TaskNotes, { props: { taskId: 1, notes: [] } });

    expect(screen.queryAllByTestId('note')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: /note/i })).toBeTruthy();
  });

  it('submitting the add form POSTs to the notes endpoint and prepends the returned note', async () => {
    const created: Note = { id: 3, taskId: 1, text: 'New note text', source: 'ui', createdAt: 3 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => created });
    vi.stubGlobal('fetch', fetchMock);

    render(TaskNotes, { props: { taskId: 1, notes: [] } });

    const input = screen.getByRole('textbox', { name: /note/i }) as HTMLTextAreaElement;
    await fireEvent.update(input, 'New note text');
    await fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/1/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'New note text' }),
      }),
    );

    const items = await screen.findAllByTestId('note');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('New note text');
  });

  it('shows "Note text is required" and sends no request when submitting empty/whitespace text', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(TaskNotes, { props: { taskId: 1, notes: [] } });

    await fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    await flushPromises();

    expect(await screen.findByText('Note text is required')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    const input = screen.getByRole('textbox', { name: /note/i }) as HTMLTextAreaElement;
    await fireEvent.update(input, '   ');
    await fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    await flushPromises();

    expect(await screen.findByText('Note text is required')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
