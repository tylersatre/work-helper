import { describe, expect, it } from 'vitest';
import { effectiveView, selectCards, tagOptions } from '../../src/client/utils/up-next-view.js';
import type { DashboardCard, DashboardSavedView } from '../../src/shared/types.js';

const CONFIG = { lanes: ['Up Next', 'In Progress', 'Waiting', 'Done'], defaultLanes: ['Up Next', 'In Progress'] };

function card(overrides: Partial<DashboardCard> & { id: number; lane: string; position: number }): DashboardCard {
  return {
    title: `Card ${overrides.id}`,
    createdAt: overrides.id,
    tags: [],
    searchText: `card ${overrides.id}`,
    latestNote: null,
    people: [],
    companies: [],
    ...overrides,
  };
}

describe('effectiveView', () => {
  it('returns the built-in default when there is no saved view (FR-005)', () => {
    const view = effectiveView(null, CONFIG, []);

    expect(view).toEqual({
      lanes: ['Up Next', 'In Progress'],
      tagIds: [],
      text: '',
      limit: 5,
      show: { tags: true, latestNote: true, links: true, lane: false },
    });
  });

  it('silently drops stale saved lane names via intersection with the configured lanes', () => {
    const saved: DashboardSavedView = {
      lanes: ['Up Next', 'A Deleted Lane'],
      tagIds: [],
      text: '',
      limit: 5,
      show: { tags: true, latestNote: true, links: true, lane: false },
    };

    const view = effectiveView(saved, CONFIG, []);

    expect(view.lanes).toEqual(['Up Next']);
  });

  it('falls back to defaultLanes when every saved lane is stale (FR-021)', () => {
    const saved: DashboardSavedView = {
      lanes: ['Deleted A', 'Deleted B'],
      tagIds: [],
      text: '',
      limit: 5,
      show: { tags: true, latestNote: true, links: true, lane: false },
    };

    const view = effectiveView(saved, CONFIG, []);

    expect(view.lanes).toEqual(CONFIG.defaultLanes);
  });

  it('silently drops stale saved tag ids not present in the payload', () => {
    const saved: DashboardSavedView = {
      lanes: ['Up Next'],
      tagIds: [3, 999],
      text: '',
      limit: 5,
      show: { tags: true, latestNote: true, links: true, lane: false },
    };

    const view = effectiveView(saved, CONFIG, [3]);

    expect(view.tagIds).toEqual([3]);
  });

  it('carries through text, limit, and show verbatim from a valid saved view', () => {
    const saved: DashboardSavedView = {
      lanes: ['Up Next'],
      tagIds: [],
      text: 'budget',
      limit: 10,
      show: { tags: false, latestNote: false, links: false, lane: true },
    };

    const view = effectiveView(saved, CONFIG, []);

    expect(view.text).toBe('budget');
    expect(view.limit).toBe(10);
    expect(view.show).toEqual({ tags: false, latestNote: false, links: false, lane: true });
  });
});

describe('selectCards', () => {
  const BASE_VIEW: DashboardSavedView = {
    lanes: ['Up Next', 'In Progress'],
    tagIds: [],
    text: '',
    limit: 5,
    show: { tags: true, latestNote: true, links: true, lane: false },
  };

  it('preserves the server-given lane-order-then-position order (FR-002)', () => {
    const cards = [
      card({ id: 1, lane: 'Up Next', position: 0 }),
      card({ id: 2, lane: 'Up Next', position: 1 }),
      card({ id: 3, lane: 'In Progress', position: 0 }),
    ];

    expect(selectCards(cards, BASE_VIEW).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('filters out cards whose lane is not in view.lanes', () => {
    const cards = [card({ id: 1, lane: 'Up Next', position: 0 }), card({ id: 2, lane: 'Waiting', position: 0 })];

    expect(selectCards(cards, BASE_VIEW).map((c) => c.id)).toEqual([1]);
  });

  it('applies text and tag filters as an AND, with any-of matching within tagIds (FR-010)', () => {
    const cards = [
      card({ id: 1, lane: 'Up Next', position: 0, searchText: 'budget review', tags: [{ id: 1, name: 'VIP', color: '#fff' }] }),
      card({ id: 2, lane: 'Up Next', position: 1, searchText: 'budget review', tags: [{ id: 2, name: 'Q3', color: '#000' }] }),
      card({ id: 3, lane: 'Up Next', position: 2, searchText: 'unrelated', tags: [{ id: 1, name: 'VIP', color: '#fff' }] }),
    ];
    const view: DashboardSavedView = { ...BASE_VIEW, text: 'budget', tagIds: [1, 2] };

    expect(selectCards(cards, view).map((c) => c.id)).toEqual([1, 2]);
  });

  it('truncates to the limit only after lane/text/tag filtering (FR-003)', () => {
    const cards = [
      card({ id: 1, lane: 'Up Next', position: 0 }),
      card({ id: 2, lane: 'Up Next', position: 1 }),
      card({ id: 3, lane: 'Waiting', position: 0 }),
      card({ id: 4, lane: 'Up Next', position: 2 }),
      card({ id: 5, lane: 'Up Next', position: 3 }),
    ];
    const view: DashboardSavedView = { ...BASE_VIEW, limit: 2 };

    expect(selectCards(cards, view).map((c) => c.id)).toEqual([1, 2]);
  });

  it('returns every match with no padding when the limit exceeds the match count', () => {
    const cards = [card({ id: 1, lane: 'Up Next', position: 0 }), card({ id: 2, lane: 'Up Next', position: 1 })];
    const view: DashboardSavedView = { ...BASE_VIEW, limit: 50 };

    expect(selectCards(cards, view)).toHaveLength(2);
  });
});

describe('tagOptions', () => {
  it('lists only tags attached to at least one card, deduped by id, alphabetical with base sensitivity (FR-009)', () => {
    const cards = [
      card({ id: 1, lane: 'Up Next', position: 0, tags: [{ id: 2, name: 'zebra', color: '#000' }] }),
      card({ id: 2, lane: 'Up Next', position: 1, tags: [{ id: 1, name: 'Alpha', color: '#fff' }] }),
      card({ id: 3, lane: 'Up Next', position: 2, tags: [{ id: 1, name: 'Alpha', color: '#fff' }] }),
    ];

    expect(tagOptions(cards)).toEqual([
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'zebra' },
    ]);
  });

  it('returns an empty list when no card carries any tag', () => {
    const cards = [card({ id: 1, lane: 'Up Next', position: 0 })];

    expect(tagOptions(cards)).toEqual([]);
  });
});
