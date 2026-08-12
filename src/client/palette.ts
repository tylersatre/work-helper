/**
 * Single source of truth for the dark-mode readability palette.
 *
 * Grounded in dark-mode accessibility guidance (Material dark theme, WCAG AA):
 * - surfaces are dark gray, never pure black, and step lighter with elevation;
 * - text tiers and links keep >= 4.5:1 contrast on every surface they sit on
 *   (enforced by tests/unit/palette.test.ts);
 * - links use a lightened, slightly desaturated blue — saturated brand blues
 *   fail AA on dark backgrounds;
 * - HTML emails render on a light card because they are authored against
 *   white, so those colors are a light-mode context of their own.
 */
export const palette = {
  bg: '#1b1e24',
  surface: '#23272f',
  surfaceRaised: '#2a2f38',
  border: 'rgba(255, 255, 255, 0.12)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  textPrimary: 'rgba(255, 255, 255, 0.92)',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textMuted: 'rgba(255, 255, 255, 0.58)',
  link: '#60a5fa',
  linkHover: '#93c5fd',
  error: '#fca5a5',
  rowStripe: 'rgba(255, 255, 255, 0.03)',
  rowHover: 'rgba(255, 255, 255, 0.06)',
  emailCardBg: '#ffffff',
  emailCardText: '#1f2328',
  emailCardLink: '#1d4ed8',
} as const;

/** The palette as `--wh-*` custom properties, bound on the app shell so every page and component style can reference the same tokens. */
export function paletteCssVars(): Record<string, string> {
  return {
    '--wh-bg': palette.bg,
    '--wh-surface': palette.surface,
    '--wh-surface-raised': palette.surfaceRaised,
    '--wh-border': palette.border,
    '--wh-border-subtle': palette.borderSubtle,
    '--wh-text-primary': palette.textPrimary,
    '--wh-text-secondary': palette.textSecondary,
    '--wh-text-muted': palette.textMuted,
    '--wh-link': palette.link,
    '--wh-link-hover': palette.linkHover,
    '--wh-error': palette.error,
    '--wh-row-stripe': palette.rowStripe,
    '--wh-row-hover': palette.rowHover,
  };
}
