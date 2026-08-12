import { describe, expect, it } from 'vitest';
import { palette, paletteCssVars } from '../../src/client/palette.js';
import { themeOverrides } from '../../src/client/theme.js';

// WCAG 2.x relative luminance + contrast ratio, with alpha compositing for
// rgba() foregrounds — the checks below are the automated acceptance gate for
// the dark-mode readability palette.
type Rgb = { r: number; g: number; b: number };
type Rgba = Rgb & { a: number };

function parseColor(color: string): Rgba {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
  }
  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  throw new Error(`Unsupported color format: ${color}`);
}

function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fgColor: string, bgColor: string): number {
  const bg = parseColor(bgColor);
  const fg = compositeOver(parseColor(fgColor), bg);
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('palette surfaces', () => {
  it('avoids pure black — the page background is a dark gray lighter than the old #101014', () => {
    expect(palette.bg.toLowerCase()).not.toBe('#000000');
    expect(luminance(parseColor(palette.bg))).toBeGreaterThan(luminance(parseColor('#101014')));
  });

  it('elevates surfaces above the background (surface lighter than bg, raised lighter than surface)', () => {
    expect(luminance(parseColor(palette.surface))).toBeGreaterThan(luminance(parseColor(palette.bg)));
    expect(luminance(parseColor(palette.surfaceRaised))).toBeGreaterThan(luminance(parseColor(palette.surface)));
  });
});

describe('palette text contrast (WCAG AA, 4.5:1 for normal text)', () => {
  // surfaceRaised is the lightest surface text can sit on, so it is the worst case.
  const surfaces = ['bg', 'surface', 'surfaceRaised'] as const;

  it.each(surfaces)('primary text reaches 7:1 on %s', (surface) => {
    expect(contrast(palette.textPrimary, palette[surface])).toBeGreaterThanOrEqual(7);
  });

  it.each(surfaces)('secondary text reaches 4.5:1 on %s', (surface) => {
    expect(contrast(palette.textSecondary, palette[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)('muted text still reaches 4.5:1 on %s', (surface) => {
    expect(contrast(palette.textMuted, palette[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)('links reach 4.5:1 on %s', (surface) => {
    expect(contrast(palette.link, palette[surface])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.linkHover, palette[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)('error text reaches 4.5:1 on %s', (surface) => {
    expect(contrast(palette.error, palette[surface])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('email light card', () => {
  it('renders email text well above AA on the light card background', () => {
    expect(contrast(palette.emailCardText, palette.emailCardBg)).toBeGreaterThanOrEqual(7);
  });

  it('renders email links at AA on the light card background', () => {
    expect(contrast(palette.emailCardLink, palette.emailCardBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme integration', () => {
  it('drives the Naive UI surface colors from the palette', () => {
    expect(themeOverrides.common?.bodyColor).toBe(palette.bg);
    expect(themeOverrides.common?.cardColor).toBe(palette.surface);
    expect(themeOverrides.common?.modalColor).toBe(palette.surfaceRaised);
    expect(themeOverrides.common?.popoverColor).toBe(palette.surfaceRaised);
  });

  it('exposes every palette color as a --wh-* CSS variable', () => {
    const vars = paletteCssVars();
    expect(vars['--wh-bg']).toBe(palette.bg);
    expect(vars['--wh-surface']).toBe(palette.surface);
    expect(vars['--wh-surface-raised']).toBe(palette.surfaceRaised);
    expect(vars['--wh-border']).toBe(palette.border);
    expect(vars['--wh-border-subtle']).toBe(palette.borderSubtle);
    expect(vars['--wh-text-primary']).toBe(palette.textPrimary);
    expect(vars['--wh-text-secondary']).toBe(palette.textSecondary);
    expect(vars['--wh-text-muted']).toBe(palette.textMuted);
    expect(vars['--wh-link']).toBe(palette.link);
    expect(vars['--wh-link-hover']).toBe(palette.linkHover);
    expect(vars['--wh-error']).toBe(palette.error);
    expect(palette.rowStripe).toMatch(/^rgba\(255, 255, 255, 0\.0\d+\)$/);
    expect(palette.rowHover).toMatch(/^rgba\(255, 255, 255, 0\.0\d+\)$/);
    expect(vars['--wh-row-stripe']).toBe(palette.rowStripe);
    expect(vars['--wh-row-hover']).toBe(palette.rowHover);
  });
});
