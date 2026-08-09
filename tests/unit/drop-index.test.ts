import { describe, expect, it } from 'vitest';
import { computeDropIndex } from '../../src/client/utils/drop-index.js';

describe('computeDropIndex', () => {
  it('returns 0 when the midpoint list is empty (empty lane, or dragged card is the lane\'s only card)', () => {
    expect(computeDropIndex(999, [])).toBe(0);
    expect(computeDropIndex(-999, [])).toBe(0);
  });

  it('returns 0 when the pointer is above the first midpoint', () => {
    expect(computeDropIndex(10, [100, 200, 300])).toBe(0);
  });

  it('returns i when the pointer is between midpoints i-1 and i', () => {
    expect(computeDropIndex(150, [100, 200, 300])).toBe(1);
    expect(computeDropIndex(250, [100, 200, 300])).toBe(2);
  });

  it('returns the list length when the pointer is below the last midpoint', () => {
    expect(computeDropIndex(999, [100, 200, 300])).toBe(3);
  });

  it('treats a pointer exactly at a midpoint as below it', () => {
    expect(computeDropIndex(100, [100, 200])).toBe(1);
  });

  it('single-midpoint list: above returns 0, below returns 1', () => {
    expect(computeDropIndex(10, [100])).toBe(0);
    expect(computeDropIndex(200, [100])).toBe(1);
  });
});
