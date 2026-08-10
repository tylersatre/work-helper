// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TagInput from '../../src/client/components/TagInput.vue';

const VOCABULARY = [
  { id: 1, name: 'VIP', color: '#3B82F6' },
  { id: 2, name: 'Q3', color: '#22C55E' },
];

function stubVocabulary(vocabulary: unknown = VOCABULARY) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => vocabulary }));
}

describe('TagInput', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters suggestions from the vocabulary case-insensitively as the user types', async () => {
    stubVocabulary();
    render(TagInput, { props: { attachedTags: [] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox'), 'vi');
    await flushPromises();

    const suggestions = screen.getAllByTestId('tag-suggestion');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.textContent).toContain('VIP');
  });

  it('excludes tags already attached to the current record from suggestions', async () => {
    stubVocabulary();
    render(TagInput, { props: { attachedTags: [{ id: 1, name: 'VIP', color: '#3B82F6' }] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox'), 'v');
    await flushPromises();

    expect(screen.queryAllByTestId('tag-suggestion')).toHaveLength(0);
  });

  it('shows a Create option only when the typed name does not case-insensitively match an existing tag', async () => {
    stubVocabulary();
    render(TagInput, { props: { attachedTags: [] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox'), 'vip');
    await flushPromises();
    expect(screen.queryByTestId('tag-create-option')).toBeNull();

    await fireEvent.update(screen.getByRole('textbox'), 'Roadmap');
    await flushPromises();
    expect(screen.getByTestId('tag-create-option')).toBeTruthy();
  });

  it('selecting a suggestion emits attach with the tag id', async () => {
    stubVocabulary();
    const { emitted } = render(TagInput, { props: { attachedTags: [] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox'), 'vip');
    await flushPromises();
    await fireEvent.click(screen.getByTestId('tag-suggestion'));

    expect(emitted().attach).toEqual([[1]]);
  });

  it('choosing create emits create with the trimmed name', async () => {
    stubVocabulary();
    const { emitted } = render(TagInput, { props: { attachedTags: [] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox'), '  Roadmap  ');
    await flushPromises();
    await fireEvent.click(screen.getByTestId('tag-create-option'));

    expect(emitted().create).toEqual([['Roadmap']]);
  });

  it('submitting an empty or whitespace-only name shows "A name is required" and emits nothing', async () => {
    stubVocabulary();
    const { emitted } = render(TagInput, { props: { attachedTags: [] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox'), '   ');
    await flushPromises();
    const form = screen.getByRole('textbox').closest('form')!;
    await fireEvent.submit(form);
    await flushPromises();

    expect(await screen.findByText('A name is required')).toBeTruthy();
    expect(emitted().attach).toBeUndefined();
    expect(emitted().create).toBeUndefined();
  });
});
