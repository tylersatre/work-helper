import { describe, expect, it } from 'vitest';
import { nextTagColor, TAG_PALETTE } from '../../src/shared/tag-palette.js';

describe('TAG_PALETTE', () => {
  it('exports the exact 10 colors in order', () => {
    expect(TAG_PALETTE).toEqual([
      '#3B82F6',
      '#22C55E',
      '#EAB308',
      '#EF4444',
      '#A855F7',
      '#EC4899',
      '#14B8A6',
      '#F97316',
      '#06B6D4',
      '#84CC16',
    ]);
  });
});

describe('nextTagColor', () => {
  it('returns palette[0] when lastColor is null', () => {
    expect(nextTagColor(null)).toBe(TAG_PALETTE[0]);
  });

  it('returns palette[0] when lastColor is undefined', () => {
    expect(nextTagColor(undefined)).toBe(TAG_PALETTE[0]);
  });

  it('returns the next palette color when lastColor sits at a palette index', () => {
    expect(nextTagColor(TAG_PALETTE[0]!)).toBe(TAG_PALETTE[1]);
    expect(nextTagColor(TAG_PALETTE[3]!)).toBe(TAG_PALETTE[4]);
  });

  it('wraps from the last palette index back to the first', () => {
    expect(nextTagColor(TAG_PALETTE[9]!)).toBe(TAG_PALETTE[0]);
  });

  it('returns the first palette color that differs from a custom lastColor', () => {
    expect(nextTagColor('#123456')).toBe(TAG_PALETTE[0]);
  });
});
