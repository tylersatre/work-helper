import type { BoardFilter } from '../../shared/types.js';

const STORAGE_KEY = 'wh.board.filter';
const EMPTY_FILTER: BoardFilter = { text: '', tagIds: [] };

function isBoardFilter(value: unknown): value is BoardFilter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { text: unknown }).text === 'string' &&
    Array.isArray((value as { tagIds: unknown }).tagIds) &&
    (value as { tagIds: unknown[] }).tagIds.every((id) => typeof id === 'number')
  );
}

export function readFilter(): BoardFilter {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...EMPTY_FILTER };
    }
    const parsed: unknown = JSON.parse(raw);
    return isBoardFilter(parsed) ? parsed : { ...EMPTY_FILTER };
  } catch {
    return { ...EMPTY_FILTER };
  }
}

export function writeFilter(filter: BoardFilter): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // localStorage unavailable or throwing: the filter simply doesn't persist.
  }
}

export function clearFilter(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable or throwing: nothing to clean up.
  }
}
