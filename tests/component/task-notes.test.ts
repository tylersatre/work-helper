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

  it('each note shows a delete control', () => {
    const notes: Note[] = [{ id: 1, taskId: 1, text: 'First note', source: 'ui', createdAt: 1 }];

    render(TaskNotes, { props: { taskId: 1, notes } });

    expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  it('confirming the delete prompt removes only the targeted note', async () => {
    const notes: Note[] = [
      { id: 2, taskId: 1, text: 'Second note', source: 'ui', createdAt: 2 },
      { id: 1, taskId: 1, text: 'First note', source: 'ui', createdAt: 1 },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    render(TaskNotes, { props: { taskId: 1, notes } });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await fireEvent.click(deleteButtons[0]!);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/1/notes/2', expect.objectContaining({ method: 'DELETE' }));
    const remaining = screen.getAllByTestId('note');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.textContent).toContain('First note');
  });

  it('cancelling the delete prompt sends no request and leaves other notes untouched', async () => {
    const notes: Note[] = [
      { id: 1, taskId: 1, text: 'First note', source: 'ui', createdAt: 1 },
      { id: 2, taskId: 1, text: 'Second note', source: 'ui', createdAt: 2 },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(TaskNotes, { props: { taskId: 1, notes } });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await fireEvent.click(deleteButtons[0]!);
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('note')).toHaveLength(2);
  });

  it('deleting the only note returns the section to the empty state with the add-note input still present', async () => {
    const notes: Note[] = [{ id: 1, taskId: 1, text: 'Only note', source: 'ui', createdAt: 1 }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    render(TaskNotes, { props: { taskId: 1, notes } });

    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await flushPromises();

    expect(screen.queryAllByTestId('note')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: /note/i })).toBeTruthy();
  });

  it('renders markdown formatting with zero raw markdown characters visible', () => {
    const markdownText =
      '**Urgent:** call *Sam* about [pricing](https://example.com/pricing) — see `deck.pdf`\n\n- one\n- two';
    const notes: Note[] = [{ id: 1, taskId: 1, text: markdownText, source: 'ui', createdAt: 1 }];

    render(TaskNotes, { props: { taskId: 1, notes } });

    const note = screen.getByTestId('note');
    expect(note.querySelector('strong')?.textContent).toBe('Urgent:');
    expect(note.querySelector('em')?.textContent).toBe('Sam');
    const link = note.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/pricing');
    expect(link?.textContent).toBe('pricing');
    expect(note.querySelector('code')?.textContent).toBe('deck.pdf');
    expect(note.querySelectorAll('li')).toHaveLength(2);
    expect(note.textContent).not.toContain('**');
    expect(note.textContent).not.toContain('__');
  });

  it('renders a note containing script/HTML text as inert DOM text, executing nothing', () => {
    const notes: Note[] = [
      { id: 1, taskId: 1, text: 'Note <script>alert(1)</script> and <img onerror=alert(1) src=x>', source: 'ui', createdAt: 1 },
    ];

    render(TaskNotes, { props: { taskId: 1, notes } });

    const note = screen.getByTestId('note');
    expect(note.querySelector('script')).toBeNull();
    expect(note.querySelector('img')).toBeNull();
    expect(note.textContent).toContain('<script>alert(1)</script>');
  });

  it('labels a source "mcp" note "via MCP" and a source "ui" note "You", each with its timestamp', () => {
    const notes: Note[] = [
      { id: 2, taskId: 1, text: 'Synced from assistant', source: 'mcp', createdAt: 2 },
      { id: 1, taskId: 1, text: 'Manual note', source: 'ui', createdAt: 1 },
    ];

    render(TaskNotes, { props: { taskId: 1, notes } });

    const items = screen.getAllByTestId('note');
    expect(items[0]?.textContent).toContain('via MCP');
    expect(items[0]?.querySelector('time')).toBeTruthy();
    expect(items[1]?.textContent).toContain('You');
    expect(items[1]?.querySelector('time')).toBeTruthy();
  });

  it('the confirm-guarded delete flow works identically on a source "mcp" note', async () => {
    const notes: Note[] = [{ id: 1, taskId: 1, text: 'Synced from assistant', source: 'mcp', createdAt: 1 }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    render(TaskNotes, { props: { taskId: 1, notes } });

    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/1/notes/1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryAllByTestId('note')).toHaveLength(0);
  });
});
