import type { GlobalThemeOverrides } from 'naive-ui';
import { palette } from './palette.js';

// Single tweak-point for the dark, data-forward look (research.md R2).
// Surface colors come from palette.ts so Naive UI components and hand-written
// component styles share the same elevation scale.
export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3B82F6',
    primaryColorHover: '#60A5FA',
    primaryColorPressed: '#2563EB',
    primaryColorSuppl: '#3B82F6',
    bodyColor: palette.bg,
    cardColor: palette.surface,
    modalColor: palette.surfaceRaised,
    popoverColor: palette.surfaceRaised,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    fontSizeSmall: '12px',
    fontSizeMedium: '13px',
    fontSizeLarge: '14px',
    heightSmall: '26px',
    heightMedium: '32px',
    heightLarge: '38px',
    borderRadius: '4px',
  },
  Button: {
    heightSmall: '26px',
    heightMedium: '30px',
    paddingSmall: '0 10px',
    paddingMedium: '0 12px',
  },
  Input: {
    heightSmall: '26px',
    heightMedium: '30px',
    paddingSmall: '0 8px',
    paddingMedium: '0 10px',
  },
  Card: {
    paddingSmall: '10px',
    paddingMedium: '12px',
  },
};
