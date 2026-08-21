// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFilter, readFilter, writeFilter } from '../../src/client/utils/board-filter-storage.js';

const KEY = 'wh.board.filter';

describe('board-filter-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a filter through localStorage under the key wh.board.filter', () => {
    writeFilter({ text: 'budget', tagIds: [1, 2] });

    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify({ text: 'budget', tagIds: [1, 2] }));
    expect(readFilter()).toEqual({ text: 'budget', tagIds: [1, 2] });
  });

  it('reads malformed JSON as an empty filter', () => {
    window.localStorage.setItem(KEY, 'not json {{{');

    expect(readFilter()).toEqual({ text: '', tagIds: [] });
  });

  it('reads a missing key as an empty filter', () => {
    expect(readFilter()).toEqual({ text: '', tagIds: [] });
  });

  it('clearFilter removes the storage key', () => {
    writeFilter({ text: 'budget', tagIds: [1] });
    clearFilter();

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(readFilter()).toEqual({ text: '', tagIds: [] });
  });

  it('degrades to a non-persistent filter when localStorage is absent', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });

    expect(() => writeFilter({ text: 'x', tagIds: [] })).not.toThrow();
    expect(readFilter()).toEqual({ text: '', tagIds: [] });
    expect(() => clearFilter()).not.toThrow();

    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('degrades to a non-persistent filter when localStorage throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => writeFilter({ text: 'x', tagIds: [] })).not.toThrow();
    expect(readFilter()).toEqual({ text: '', tagIds: [] });
  });
});
