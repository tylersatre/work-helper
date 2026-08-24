// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readShowArchived, writeShowArchived } from '../../src/client/utils/board-archive-storage.js';

const KEY = 'wh.board.showArchived';

describe('board-archive-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips true through localStorage under the key wh.board.showArchived', () => {
    writeShowArchived(true);

    expect(window.localStorage.getItem(KEY)).toBe('true');
    expect(readShowArchived()).toBe(true);
  });

  it('round-trips false through localStorage', () => {
    writeShowArchived(true);
    writeShowArchived(false);

    expect(readShowArchived()).toBe(false);
  });

  it('reads malformed storage as false', () => {
    window.localStorage.setItem(KEY, 'not a boolean {{{');

    expect(readShowArchived()).toBe(false);
  });

  it('reads a missing key as false', () => {
    expect(readShowArchived()).toBe(false);
  });

  it('degrades to non-persistent behavior when localStorage is absent', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });

    expect(() => writeShowArchived(true)).not.toThrow();
    expect(readShowArchived()).toBe(false);

    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('degrades to non-persistent behavior when localStorage throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => writeShowArchived(true)).not.toThrow();
    expect(readShowArchived()).toBe(false);
  });
});
