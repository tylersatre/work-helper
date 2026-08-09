# Research: UI Refresh (009)

All unknowns from the plan's Technical Context resolved. The single genuine unknown was the component library (deferred by the PRD to planning); the rest are design approaches settled here so tasks can be generated deterministically.

## R1. Component library: Naive UI

**Decision**: Naive UI (`naive-ui` npm package) as the component library for the whole app.

**Rationale**:

- **Vue 3-only, TypeScript-first**: written in TS for Vue 3 specifically (no Vue 2 legacy layer); props, slots, and its entire theme system are typed, which fits a strict-TS codebase checked by `vue-tsc`.
- **Dark-only is a first-class one-liner**: wrapping the app in `<n-config-provider :theme="darkTheme">` renders every component dark — no CSS file swaps, no `.dark` class plumbing, no toggle machinery we'd deliberately not use. This is the cleanest match for the PRD's dark-only decision.
- **Tweakable via typed design tokens**: customization happens through a plain TypeScript `themeOverrides` object (colors, heights, paddings, fonts) — exactly the "prebuilt components we can tweak as needed" the PRD asks for, with no SCSS/preprocessor layer.
- **No imposed global stylesheet**: Naive UI styles its own components (CSS-in-JS, no required global CSS import) and doesn't reset the page, so the hand-rolled board DnD DOM keeps its structure and gets styled by our own scoped CSS without fighting a framework reset.
- **Dense look is achievable**: most inputs/buttons accept `size="small"`, and spacing/height tokens in `themeOverrides` bring Trello/Jira-level density.
- **Tree-shakable**: explicit component imports keep the bundle to what we use.
- Established and actively maintained: ~80+ components, widely used in the Vue 3 ecosystem per 2026 library roundups ([UI Bakery](https://uibakery.io/blog/top-vue-component-libraries), [LogRocket](https://blog.logrocket.com/best-ui-frameworks-vue-3/), [Prismic](https://prismic.io/blog/vue-component-libraries)).

**Alternatives considered**:

- **PrimeVue** — the strongest runner-up (huge component set, ~480k weekly downloads as of Jan 2026, first-class data tables). Rejected because theming runs through its styled-mode CSS layer and a `.dark` selector configuration — more moving parts than Naive UI's theme object for a dark-only app, and its visual presets lean less dense out of the box.
- **Element Plus** — mature and dense (admin-panel heritage, ~350k weekly downloads), but dark mode requires importing a separate CSS-vars file plus an `html.dark` class, and deeper tweaks push into SCSS; the look is also distinctively "Element".
- **Vuetify** — Material Design contradicts the dense/data-forward direction; heaviest option.
- **Quasar** — a full app framework (CLI, build integration, its own conventions); far more than a component layer needs.
- **Ant Design Vue** — visually the closest to Jira, but the community port's release cadence and Vue 3.5 alignment are less dependable than Naive UI/PrimeVue.
- **shadcn-vue + Tailwind** — maximally tweakable but components are copied in and assembled, and it drags in a Tailwind adoption; contradicts "keep it simple".

## R2. Dark-only theme wiring

**Decision**: `App.vue` wraps everything in `<n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">` with `<n-global-style />` so the page background/text colors follow the theme (kills the browser-default white body). `themeOverrides` lives in a new `src/client/theme.ts` as a typed `GlobalThemeOverrides` object — the single place to tweak accent color, density tokens, and per-component overrides later.

**Rationale**: One provider, one tokens file; no toggle state anywhere (dark-only is a product decision). `n-global-style` handles the body styling declaratively instead of a stray global CSS file.

**Alternatives considered**: a hand-written global CSS dark palette (rejected: duplicates what the library theme already provides and drifts from component colors); CSS `prefers-color-scheme` handling (rejected: there is no light theme to prefer).

## R3. Preserving the hand-rolled drag-and-drop

**Decision**: `Board.vue`/`Lane.vue`/`TaskCard.vue` keep their exact DOM event wiring (`dragstart`/`dragover`/`drop`), `computeDropIndex` math, optimistic `applyMove`, and the pending-saves reconciliation chain. The restyle changes only their CSS and visual wrappers; cards may use a Naive UI card-styled element only if it introduces no wrapper that breaks the `[data-testid="task-card"]` midpoint math — otherwise cards stay plain elements styled with theme tokens.

**Rationale**: The DnD implementation carries two shipped features' worth of subtle correctness (drop indicator placement, mid-refetch guard). FR-010/FR-011 make preserving it non-negotiable; a library drag component would be a rewrite with new failure modes for zero spec value.

**Alternatives considered**: Naive UI has no drag-board component; third-party `vuedraggable`/SortableJS (rejected: replaces working, specced code and its tests).

## R4. Full-height board layout

**Decision**: Pure CSS on the existing structure: the shell makes the page a `100dvh` column (nav auto, content `flex: 1; min-height: 0`); `.board` becomes `display: flex; overflow-x: auto; height: 100%`; each `.lane` a fixed-width (~280px) column with header, internally scrolling card list (`flex: 1; overflow-y: auto`), and a footer slot (To Do's add control). Lane headers stay visible because only the card list scrolls.

**Rationale**: Meets US2 scenario 1 and both phone scenarios (horizontal scroll comes free from `overflow-x: auto` + fixed lane widths) with no library layout component, keeping the DnD DOM intact. Also satisfies the edge case of a config with more/different lanes — nothing is hardcoded to four.

**Alternatives considered**: `n-layout` components (rejected: adds wrappers around the DnD tree for no benefit); CSS grid (no advantage over flex here).

## R5. Confirm dialog for note deletion

**Decision**: Replace `window.confirm` in `NoteItem.vue` with a Naive UI modal dialog (`n-modal` preset `dialog`, negative/positive actions) owned by `TaskNotes.vue`: NoteItem emits a delete request, TaskNotes opens the dialog for the pending note; confirm calls the existing delete path, cancel/Escape/mask-click closes with no change. The dialog carries `data-testid="confirm-dialog"`.

**Rationale**: A modal rendered in the page DOM is exactly what the spec's "in-app styled dialog (not a browser confirm popup)" criterion needs, and it is assertable by both Testing Library and the browser-tester. Centralizing it in TaskNotes keeps NoteItem dumb.

**Alternatives considered**: `useDialog()` composable (rejected: imperative API is harder to assert in component tests than declarative modal state); `n-popconfirm` (rejected: anchored popover reads less clearly as a confirmation for a destructive act, and Escape/mask-cancel semantics are the modal's).

## R6. Inline "+ Add task" control

**Decision**: `CreateTaskForm.vue` is reworked into the inline lane-footer control: collapsed, it renders a full-width "+ Add task" button; expanded, a compact form with the title input, the optional note textarea, submit ("Add") and cancel. It is rendered only in the first configured lane's footer via a Lane slot/prop wired from Board/BoardPage; `BoardPage.vue` drops the top-level form. Existing behavior carries over: same `POST /api/tasks` body, same `titleSchema` check with the inline message adjacent to the title input, successful submit clears and keeps the form open focus-ready, cancel/click-away collapses without creating.

**Rationale**: Matches the PRD decision (inline control fully replaces the top form, keeps the optional note field) with the smallest structural change — the component and its API call survive, only its placement and chrome change. "First configured lane" (not a hardcoded "To Do") preserves the config-driven lane edge case.

**Alternatives considered**: a new component beside the old form (rejected: the old placement must disappear, so reworking in place keeps history and tests); putting the control in every lane (rejected: create-task's decided behavior is first-lane only).

## R7. Empty states

**Decision**: `n-empty` with concise copy — in a lane whose task list is empty (`data-testid="lane-empty"`, e.g. "No tasks"), and on the People page when the people list is empty (`data-testid="people-empty"`, e.g. "No people yet"). The lane placeholder must remain a valid drop target (it sits inside the lane's drop zone and disappears when a card arrives).

**Rationale**: Direct mapping of FR-008 with a stock component; copy is illustrative per the spec's assumption.

## R8. People list presentation

**Decision**: Restyle the existing People list markup as a dense table using Naive UI's table styling (`n-table`-style compact rows) rather than adopting `n-data-table`.

**Rationale**: The list is plain rows (name, email, phone) with fixed alphabetical order, no sorting/filtering/pagination (explicitly out of scope per track-people); `n-data-table` would replace the markup existing component tests and the linked-people flows rely on, for features we deliberately don't use. Compact table styling delivers the dense look with zero behavioral risk.

**Alternatives considered**: `n-data-table` (rejected for this slice: heavier DOM rewrite, test churn, and its value — sorting/filtering — is out of scope; the future kanban-sort-filter/people filtering work can revisit it).

## R9. Phone-width navigation

**Decision**: No hamburger/collapsed menu. The top bar is "work-helper" + two short links (Board, People); at 375px this fits comfortably with compact spacing, satisfying the spec's "directly reachable" branch. The bar is `position: sticky` top with reduced horizontal padding at small widths.

**Rationale**: The spec allows "directly or via a collapsed menu"; direct is simpler and testable. A menu component for two links is complexity with no user value (the future stubs that add pages can introduce one).

## R10. Component-test compatibility

**Decision**: Component tests keep driving behavior through roles/labels/testids. Concretely: (a) `tests/component/setup.ts` gains the `window.matchMedia` stub Naive UI expects under jsdom; (b) modal assertions query the whole document (Testing Library `baseElement`/`screen`) because `n-modal` teleports to `document.body`; (c) the stable testids in [contracts/ui-contract.md](./contracts/ui-contract.md) are preserved (`task-card`, `lane`, `drop-indicator`, `error-banner`) or added (`app-nav`, `add-task-toggle`, `confirm-dialog`, `lane-empty`, `people-empty`); (d) tests asserting the old top-of-page form placement are adapted to the inline control as part of that story's TDD, not silently deleted.

**Rationale**: Keeps FR-011's regression gate honest — existing suites keep passing with adaptations limited to surfaces the spec explicitly changes.

## R11. Dependency and build impact

**Decision**: Add `naive-ui` as a regular dependency with explicit named imports (no auto-import/resolver plugin). No Vite config change; no Docker change (client build output is static files either way).

**Rationale**: Explicit imports are tree-shaken by Vite, keep the dependency surface obvious, and avoid a build-plugin moving part. The deploy suite and Dockerfile are untouched.

## Sources

- [Top Vue Component Libraries in 2026 — UI Bakery](https://uibakery.io/blog/top-vue-component-libraries)
- [The best UI frameworks for Vue 3 — LogRocket](https://blog.logrocket.com/best-ui-frameworks-vue-3/)
- [Top 10 Vue Component Libraries in 2026 — Prismic](https://prismic.io/blog/vue-component-libraries)
