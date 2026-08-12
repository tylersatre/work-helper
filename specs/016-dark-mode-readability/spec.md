# Spec: 016-dark-mode-readability

PRD: [docs/product/features/dark-mode-readability.md](../../docs/product/features/dark-mode-readability.md) (back-filled from Tyler's chat directives; sign-off pending at PR #18 acceptance — see the provenance note there).

## Design

Research basis: dark-mode accessibility guidance (Material dark theme, WCAG 2.x AA, practitioner consensus) — dark gray over pure black, desaturated/lightened accents, AA contrast for all text, and light-context rendering for content authored against white.

- **Palette as single source of truth.** `src/client/palette.ts` defines the surfaces (`bg #1b1e24`, `surface #23272f`, `surfaceRaised #2a2f38` — an elevation scale that steps lighter), text tiers (`0.92 / 0.72 / 0.58` white alphas), links (`#60a5fa`, hover `#93c5fd`), error, row-overlay tokens, and the email light-card colors. The Naive UI theme overrides (`theme.ts`) and the `--wh-*` CSS custom properties (bound as an inline style on `.app-shell` in `App.vue`) both derive from it; component styles reference only the vars.
- **Global link rule.** `.app-shell a` colors every anchor with the link token; scoped component rules (nav, row links that inherit) win on specificity where they opt out.
- **Email light card.** `EmailBody.vue` wraps the DOMPurify-sanitized HTML in a `.email-light-card` div inside its shadow root with a `<style>` of palette constants: white background, dark text, `color-scheme: light`, AA-blue links, images constrained to the card. Plain-text bodies keep the native dark rendering.
- **Contained cards.** Conversation messages are outlined `surface` cards. Shared `.wh-table-card`/`.wh-table` (raised header band, zebra stripe, row hover) and `.wh-card-list` (bordered rows, hover) styles in `App.vue` are applied to the People table, Emails list, and person-detail email section. The People-table Tags cell holds its chips in a flex wrapper (`.people-table-tag-chips`) because `display: flex` on a `td` breaks table-cell layout — the cause of the misaligned hairlines Tyler reported.

## Enforcement (automated acceptance checks)

- `tests/unit/palette.test.ts` — computes WCAG relative-luminance contrast (with alpha compositing) for every text/link/error color against every surface it sits on: AA ≥ 4.5:1, ≥ 7:1 for primary and email-card text; pins the theme overrides and CSS-var map to the palette; asserts the background is lighter than the old near-black and that elevation steps lighter.
- `tests/unit/surface-styles.test.ts` — style gate over every client SFC: rejects the legacy near-black hexes, any hex background with relative luminance < 0.05 (accent colors pass), and any white-alpha text `color:` below the 0.58 muted tier; pins the `.email-message` card rule, the `.app-shell a` link rule, and the `.wh-table`/`.wh-card-list` declarations.
- Component tests — email light card structure (`email-body.test.ts`), `--wh-*` binding on the shell (`app-shell.test.ts`), Tags-cell wrapper and card classes (`people-page.test.ts`, `emails-page.test.ts`, `person-email-section.test.ts`).
- Browser evidence — `docs/evidence/016-dark-mode-readability/results.md`: three browser-tester rounds with measured computed styles, independently confirmed by the verifier agent (which failed the first pass on six missed `#1f1f24` surfaces, closed in round 3).
