import { describe, expect, it } from 'vitest';
import { matchesBoardFilter } from '../../src/shared/board-filter.js';

function task(overrides: { searchText?: string; tags?: { id: number }[] } = {}) {
  return {
    searchText: overrides.searchText ?? 'follow up with sam',
    tags: overrides.tags ?? [],
  };
}

describe('matchesBoardFilter', () => {
  it('treats an empty search text as no text filter', () => {
    expect(matchesBoardFilter(task(), { text: '', tagIds: [] })).toBe(true);
  });

  it('treats a whitespace-only search text as no text filter', () => {
    expect(matchesBoardFilter(task(), { text: '   ', tagIds: [] })).toBe(true);
  });

  it('matches a trimmed, lowercased substring against searchText', () => {
    expect(matchesBoardFilter(task({ searchText: 'follow up with sam' }), { text: '  SAM  ', tagIds: [] })).toBe(true);
    expect(matchesBoardFilter(task({ searchText: 'follow up with sam' }), { text: 'zebra', tagIds: [] })).toBe(false);
  });

  it('treats an empty tagIds array as no tag filter', () => {
    expect(matchesBoardFilter(task({ tags: [{ id: 1 }] }), { text: '', tagIds: [] })).toBe(true);
    expect(matchesBoardFilter(task({ tags: [] }), { text: '', tagIds: [] })).toBe(true);
  });

  it('matches a card carrying any of the selected tag ids', () => {
    expect(matchesBoardFilter(task({ tags: [{ id: 1 }] }), { text: '', tagIds: [2, 1] })).toBe(true);
    expect(matchesBoardFilter(task({ tags: [{ id: 3 }] }), { text: '', tagIds: [2, 1] })).toBe(false);
  });

  it('requires both text and tags to match when both are set', () => {
    const t = task({ searchText: 'write proposal\nwaiting on budget numbers', tags: [{ id: 5 }] });
    expect(matchesBoardFilter(t, { text: 'budget', tagIds: [5] })).toBe(true);
    expect(matchesBoardFilter(t, { text: 'budget', tagIds: [9] })).toBe(false);
    expect(matchesBoardFilter(t, { text: 'zebra', tagIds: [5] })).toBe(false);
  });

  it('matches a card whose searchText is only its lowercased title, with no notes/tags/links, and never errors', () => {
    const bare = task({ searchText: 'review budget', tags: [] });
    expect(matchesBoardFilter(bare, { text: 'budget', tagIds: [] })).toBe(true);
    expect(() => matchesBoardFilter(bare, { text: '', tagIds: [] })).not.toThrow();
  });
});
