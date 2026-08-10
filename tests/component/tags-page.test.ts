// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { NColorPicker } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAG_PALETTE } from '../../src/shared/tag-palette.js';
import TagsPage from '../../src/client/pages/TagsPage.vue';

function tag(id: number, name: string, color: string, peopleCount = 0, tasksCount = 0) {
  return { id, name, color, peopleCount, tasksCount };
}

describe('TagsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a styled "No tags yet" empty state when the vocabulary is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(TagsPage);
    await flushPromises();

    expect(await screen.findByTestId('tags-empty')).toBeTruthy();
    expect(screen.getByText(/no tags yet/i)).toBeTruthy();
  });

  it('lists tags as chips in the server-provided order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [tag(1, 'VIP', '#3B82F6', 2, 0), tag(2, 'Q3', '#22C55E', 0, 1), tag(3, 'Alpha', '#EAB308', 0, 0)],
      }),
    );

    render(TagsPage);
    await flushPromises();

    const chips = await screen.findAllByTestId('tag-chip');
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['VIP', 'Q3', 'Alpha']);
  });

  it('the create control adds a tag and surfaces "A name is required" / "That tag name is already in use"', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tags' && options?.method === 'POST') {
        const body = JSON.parse(options.body as string) as { name: string };
        if (!body.name.trim()) {
          return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: { message: 'A name is required' } }) });
        }
        if (body.name === 'VIP') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ error: { message: 'That tag name is already in use' } }),
          });
        }
        return Promise.resolve({ ok: true, status: 201, json: async () => tag(9, body.name, '#3B82F6') });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(TagsPage);
    await flushPromises();

    await fireEvent.click(screen.getByRole('button', { name: /create tag/i }));
    await flushPromises();
    expect(await screen.findByText('A name is required')).toBeTruthy();

    await fireEvent.update(screen.getByLabelText(/new tag/i), 'VIP');
    await fireEvent.click(screen.getByRole('button', { name: /create tag/i }));
    await flushPromises();
    expect(await screen.findByText('That tag name is already in use')).toBeTruthy();

    await fireEvent.update(screen.getByLabelText(/new tag/i), 'Roadmap');
    await fireEvent.click(screen.getByRole('button', { name: /create tag/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tags',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Roadmap' }) }),
    );
  });

  it('the rename flow edits a tag and surfaces the same validation messages', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => [tag(1, 'VIP', '#3B82F6'), tag(2, 'Q3', '#22C55E')] });
      }
      if (url === '/api/tags/1' && options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string) as { name: string };
        if (!body.name.trim()) {
          return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: { message: 'A name is required' } }) });
        }
        if (body.name.toLowerCase() === 'q3') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ error: { message: 'That tag name is already in use' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => tag(1, body.name, '#3B82F6') });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(TagsPage);
    await flushPromises();

    const rows = await screen.findAllByTestId('tag-row');
    const vipRow = rows[0]!;
    await fireEvent.click(within(vipRow).getByRole('button', { name: /rename/i }));
    await flushPromises();

    const input = within(vipRow).getByRole('textbox');
    await fireEvent.update(input, '');
    await fireEvent.click(within(vipRow).getByRole('button', { name: /save/i }));
    await flushPromises();
    expect(await screen.findByText('A name is required')).toBeTruthy();

    await fireEvent.update(input, 'q3');
    await fireEvent.click(within(vipRow).getByRole('button', { name: /save/i }));
    await flushPromises();
    expect(await screen.findByText('That tag name is already in use')).toBeTruthy();
  });

  it('recolor uses NColorPicker with :swatches bound to the shared palette and hex mode for custom colors', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => [tag(1, 'VIP', '#3B82F6')] });
      }
      if (url === '/api/tags/1' && options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string) as { color: string };
        return Promise.resolve({ ok: true, json: async () => tag(1, 'VIP', body.color) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(TagsPage);
    await flushPromises();

    const picker = wrapper.findComponent(NColorPicker);
    expect(picker.exists()).toBe(true);
    expect(picker.props('swatches')).toEqual([...TAG_PALETTE]);
    expect(picker.props('modes')).toEqual(['hex']);

    // NColorPicker is a controlled component: it only tracks a pick as the user makes it if the
    // bound `value` prop is updated via `update:value`, exactly like it emits internally while the
    // user drags/types or clicks a preset swatch. Skipping that leaves it pinned to the original
    // color and every pick is silently discarded.
    picker.vm.$emit('update:show', true);
    picker.vm.$emit('update:value', '#123456');
    await flushPromises();
    expect(wrapper.findComponent(NColorPicker).props('value')).toBe('#123456');

    // Persistence is triggered on close, not on naive-ui's `complete` event: naive-ui's own preset
    // swatch click only calls `update:value` and never fires `complete` (only a completed hue/alpha
    // drag or a HEX-field commit does), so relying on `complete` silently drops swatch-only picks.
    picker.vm.$emit('update:show', false);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tags/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ color: '#123456' }) }),
    );
  });

  it('does not PATCH when the picker is opened and closed without the color changing', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => [tag(1, 'VIP', '#3B82F6')] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(TagsPage);
    await flushPromises();

    const picker = wrapper.findComponent(NColorPicker);
    picker.vm.$emit('update:show', true);
    await flushPromises();
    picker.vm.$emit('update:show', false);
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalledWith('/api/tags/1', expect.objectContaining({ method: 'PATCH' }));
  });

  it('delete opens an in-app confirm dialog stating freshly fetched counts with correct pluralization; cancel changes nothing; confirm deletes and updates the list', async () => {
    let currentTags = [tag(1, 'Key client', '#3B82F6', 1, 1), tag(2, 'Q3', '#22C55E', 0, 0)];
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => currentTags });
      }
      if (url === '/api/tags/1' && options?.method === 'DELETE') {
        currentTags = currentTags.filter((t) => t.id !== 1);
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(TagsPage);
    await flushPromises();

    let rows = await screen.findAllByTestId('tag-row');
    await fireEvent.click(within(rows[0]!).getByRole('button', { name: /delete/i }));
    await flushPromises();

    const dialog = screen.getByTestId('delete-tag-dialog');
    expect(dialog.textContent).toContain('attached to 1 person and 1 task');

    await fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    await flushPromises();
    rows = await screen.findAllByTestId('tag-row');
    expect(rows).toHaveLength(2);

    await fireEvent.click(within(rows[0]!).getByRole('button', { name: /delete/i }));
    await flushPromises();
    await fireEvent.click(within(screen.getByTestId('delete-tag-dialog')).getByRole('button', { name: /^delete$/i }));
    await flushPromises();

    const remainingRows = await screen.findAllByTestId('tag-row');
    expect(remainingRows).toHaveLength(1);
    expect(remainingRows[0]!.textContent).toContain('Q3');
    expect(fetchMock).toHaveBeenCalledWith('/api/tags/1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('states 0-count pluralization correctly for a tag attached to nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [tag(1, 'Alpha', '#3B82F6', 0, 0)] }),
    );

    render(TagsPage);
    await flushPromises();

    const rows = await screen.findAllByTestId('tag-row');
    await fireEvent.click(within(rows[0]!).getByRole('button', { name: /delete/i }));
    await flushPromises();

    expect(screen.getByTestId('delete-tag-dialog').textContent).toContain('attached to 0 people and 0 tasks');
  });

  it('re-fetches GET /api/tags when the delete dialog opens, so the stated counts reflect the moment it opens (research.md R7)', async () => {
    let getCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tags' && !options) {
        getCallCount += 1;
        // The count changes between mount and the dialog opening (e.g. another
        // tab attached the tag meanwhile) — the dialog must show the fresh count.
        const peopleCount = getCallCount === 1 ? 0 : 3;
        return Promise.resolve({ ok: true, json: async () => [tag(1, 'VIP', '#3B82F6', peopleCount, 0)] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(TagsPage);
    await flushPromises();

    const rows = await screen.findAllByTestId('tag-row');
    await fireEvent.click(within(rows[0]!).getByRole('button', { name: /delete/i }));
    await flushPromises();

    expect(getCallCount).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('delete-tag-dialog').textContent).toContain('attached to 3 people and 0 tasks');
  });
});
