import { matchesBoardFilter } from '../../shared/board-filter.js';
import type { DashboardCard, DashboardSavedView } from '../../shared/types.js';

export interface DashboardLaneConfig {
  lanes: string[];
  defaultLanes: string[];
}

const BUILT_IN_SHOW = { tags: true, latestNote: true, links: true, lane: false };
const BUILT_IN_LIMIT = 5;

// existingTagIds must be every tag id that still exists (e.g. from GET /api/tags), not merely
// tags attached to a currently-visible card — a tag with zero attached cards right now still
// exists, and FR-021 only drops a saved tag filter when the tag itself has been deleted.
export function effectiveView(saved: DashboardSavedView | null, config: DashboardLaneConfig, existingTagIds: number[]): DashboardSavedView {
  if (!saved) {
    return { lanes: config.defaultLanes, tagIds: [], text: '', limit: BUILT_IN_LIMIT, show: { ...BUILT_IN_SHOW } };
  }

  const configuredLanes = new Set(config.lanes);
  let lanes = saved.lanes.filter((lane) => configuredLanes.has(lane));
  if (lanes.length === 0) {
    lanes = config.defaultLanes;
  }

  const stillExisting = new Set(existingTagIds);
  const tagIds = saved.tagIds.filter((id) => stillExisting.has(id));

  return { lanes, tagIds, text: saved.text, limit: saved.limit, show: saved.show };
}

export function selectCards(cards: DashboardCard[], view: DashboardSavedView): DashboardCard[] {
  const lanes = new Set(view.lanes);
  const filtered = cards.filter((card) => lanes.has(card.lane) && matchesBoardFilter(card, { text: view.text, tagIds: view.tagIds }));
  return filtered.slice(0, view.limit);
}

export function tagOptions(cards: DashboardCard[]): { id: number; name: string }[] {
  const byId = new Map<number, string>();
  for (const card of cards) {
    for (const tag of card.tags) {
      byId.set(tag.id, tag.name);
    }
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
