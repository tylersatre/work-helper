# Tasks: UI Refresh

**Input**: Design documents from `/specs/009-ui-refresh/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: TDD is mandatory (constitution II): every behavioral change lands as a failing test first, then the implementation that turns it green. Pure visual styling (colors, spacing, density) has no unit-testable behavior — it is pinned by the structural assertions below plus browser evidence (Phase 8), per the spec's split.

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P5). Stories US2–US5 build on the shell from US1 (it wires the theme provider); within that constraint each story phase is independently completable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 from spec.md
- Every task names its exact file path(s)

## Phase 1: Setup

**Purpose**: The new dependency and the two files everything else builds on

- [X] T001 Install the component library: `npm install naive-ui` (updates `package.json` + `package-lock.json`); verify `npm run build` still succeeds untouched
- [X] T002 [P] Add the `window.matchMedia` stub Naive UI needs under jsdom to `tests/component/setup.ts` (guarded so real browsers are unaffected); run `npm test` to confirm the existing suite is still green
- [X] T003 Create `src/client/theme.ts` exporting a typed `GlobalThemeOverrides` object (research.md R2): accent color, dense heights/paddings, font stack — the single tweak-point for the dark, data-forward look (depends on T001 for types)

---

## Phase 2: Foundational (Blocking Prerequisites)

No foundational phase for this feature: it touches only the presentation layer, and the one cross-cutting piece (the theme provider in the app shell) is user-visible behavior that belongs to US1 under TDD — putting it here would mean writing it before its failing test exists. Setup (Phase 1) is the only blocking prerequisite.

---

## Phase 3: User Story 1 - One cohesive dark shell around every page (Priority: P1) 🎯 MVP

**Goal**: Every page renders inside a dark app shell with a top nav bar (app name, Board/People links, active section marked); no browser-default white surfaces.

**Independent Test**: Open all four pages — nav present with correct active marking, links navigate, dark background/light text everywhere.

### Tests for User Story 1 (write first, watch them fail)

- [X] T004 [US1] Write failing component test `tests/component/app-shell.test.ts`: `App.vue` (with real router) renders `[data-testid="app-nav"]` containing the app name and links "Board" and "People"; the active link carries `aria-current="page"` on `/` and on `/people`, and Board stays active on `/tasks/1` while People stays active on `/people/2`; clicking the inactive link navigates and moves the marking

### Implementation for User Story 1

- [X] T005 [US1] Wire the theme into `src/client/App.vue`: wrap the app in `<n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">` (from `naive-ui` + `src/client/theme.ts`) with `<n-global-style />`; restructure the template into a `100dvh` flex-column shell (header + content area with `flex: 1; min-height: 0`) per research.md R2/R4
- [X] T006 [US1] Build the top nav bar in `src/client/App.vue`: `data-testid="app-nav"`, app name, RouterLinks with active section computed from the route (`/` and `/tasks/*` → Board; `/people` and `/people/*` → People), `aria-current="page"` on the active link, sticky positioning, compact horizontal padding at small widths (research.md R9) — T004 goes green

**Checkpoint**: `npm test` green; dev server shows the dark shell on all four pages with zero white surfaces — US1 is demoable on its own.

---

## Phase 4: User Story 2 - A dense board that fits the screen (Priority: P2)

**Goal**: Full-viewport board, internally scrolling fixed-width lanes with always-visible headers, empty-lane placeholders, inline "+ Add task" in the first lane (title + optional note, inline validation), drag-and-drop untouched.

**Independent Test**: Seed 30 tasks in To Do; page doesn't scroll vertically while the lane does; placeholders in empty lanes; inline create works with validation; a drag persists across reload.

### Tests for User Story 2 (write first, watch them fail)

- [X] T007 [P] [US2] Extend `tests/component/board.test.ts` (failing): a lane with zero tasks renders `[data-testid="lane-empty"]` and a lane with tasks doesn't; each lane renders its header plus a dedicated scrolling card-list container; existing drag/drop-indicator/error-banner assertions stay intact
- [X] T008 [P] [US2] Rework `tests/component/create-task-form.test.ts` (failing): renders collapsed `[data-testid="add-task-toggle"]`; expanding shows `[data-testid="add-task-form"]` with a labeled Title input and Note textarea; valid submit POSTs `/api/tasks` (title, optional note) and emits `created`; whitespace-only title renders the `role="alert"` message adjacent to the title input and does not POST; cancel collapses the form without POSTing
- [X] T009 [P] [US2] Write failing test `tests/component/board-page.test.ts`: `BoardPage.vue` renders no top-level create form; the first lane's footer hosts `[data-testid="add-task-toggle"]` (and only the first lane's); a `created` event triggers a board refetch

### Implementation for User Story 2

- [X] T010 [US2] Rework `src/client/components/CreateTaskForm.vue` into the inline lane-footer control (research.md R6): collapsed full-width "+ Add task" button ↔ expanded compact form (`n-input` title, textarea-mode `n-input` note, Add/Cancel buttons), testids per T008, inline validation adjacent to the title input, keep `titleSchema` + `POST /api/tasks` + `created` emit, clear fields on success, collapse on cancel — T008 goes green
- [X] T011 [US2] Restyle `src/client/components/Lane.vue` (research.md R4/R7): fixed-width (~280px) full-height column — visible header, internally scrolling card list (`flex: 1; overflow-y: auto`), footer slot; `n-empty` placeholder with `data-testid="lane-empty"` inside the drop zone (still a valid drop target, disappears when a card arrives); preserve all DnD handlers and the `lane`/`task-card`/`drop-indicator` testids — T007 goes green
- [X] T012 [US2] Restyle `src/client/components/Board.vue`: `height: 100%`, flex row, `overflow-x: auto`, dense gap/padding; render the add-task control into the first lane's footer (slot wiring, `created` → `fetchBoard`); restyle the error banner with theme tokens keeping `[data-testid="error-banner"]` and its dismiss button; DnD logic (applyMove, save chain) byte-for-byte untouched
- [X] T013 [US2] Update `src/client/pages/BoardPage.vue`: remove the top-level `CreateTaskForm`, make the page fill the content area's height, wire creation refresh through Board — T009 goes green
- [X] T014 [P] [US2] Restyle `src/client/components/TaskCard.vue`: dense dark card, `draggable` handlers and `data-testid="task-card"`/`data-task-id` preserved, long titles wrap/truncate inside the card so they never break the lane layout (spec edge case)

**Checkpoint**: `npm test` green; dense board demoable — 30-card lane scrolls internally, inline add works, drag persists.

---

## Phase 5: User Story 3 - In-app confirmation for note deletion (Priority: P3)

**Goal**: Note deletion confirms via an in-app dialog (cancel/Escape/mask keeps the note, confirm deletes); zero browser-native popups. Task detail surfaces restyled to match the shell.

**Independent Test**: On a task with two notes, walk the cancel path and the confirm path; verify no `window.confirm` fires.

### Tests for User Story 3 (write first, watch them fail)

- [X] T015 [US3] Extend `tests/component/task-notes.test.ts` (failing): clicking a note's delete opens `[data-testid="confirm-dialog"]` (query `document.body` — the modal teleports); cancel closes it with the note intact and no DELETE request; confirm issues the DELETE and removes only that note; a `vi.spyOn(window, 'confirm')` is never called

### Implementation for User Story 3

- [X] T016 [US3] Update `src/client/components/NoteItem.vue`: remove `window.confirm`; the delete button emits a `delete-request` with the note id; restyle the note (source label, relative timestamp with hover-absolute, markdown body) dense and dark
- [X] T017 [US3] Update `src/client/components/TaskNotes.vue` (research.md R5): own `noteIdPendingDeletion` state and an `n-modal` preset-dialog with `data-testid="confirm-dialog"` and confirm/cancel actions (Escape and mask-click behave as cancel); confirm calls the existing delete path; restyle the notes list and add-note input — T015 goes green
- [X] T018 [P] [US3] Restyle `src/client/pages/TaskDetailPage.vue` and `src/client/components/LinkedPeople.vue` with the shared components (dense sections: title, read-only lane, linked-people search and list); behavior unchanged — adapt `tests/component/task-detail.test.ts` only where the new markup requires it

**Checkpoint**: `npm test` green; the app's last browser-native popup is gone.

---

## Phase 6: User Story 4 - Restyled People pages with an empty state (Priority: P4)

**Goal**: People list as a dense table with an empty state when no people exist; person record and forms restyled with inline validation; all existing People behavior intact.

**Independent Test**: Empty database → empty state; create a person → dense list; edit a phone → persists.

### Tests for User Story 4 (write first, watch them fail)

- [X] T019 [US4] Extend `tests/component/people-page.test.ts` (failing): with no people, `[data-testid="people-empty"]` renders in place of the list; after creating a person the empty state is gone and the list row shows name/email/phone; existing row and validation assertions stay intact

### Implementation for User Story 4

- [X] T020 [US4] Restyle `src/client/pages/PeoplePage.vue` (research.md R7/R8): `n-empty` state with `data-testid="people-empty"`, dense compact table styling on the existing list markup (no `n-data-table`), restyled create-person area — T019 goes green
- [X] T021 [P] [US4] Restyle `src/client/components/PersonForm.vue`: library inputs keeping label associations, `role="alert"` validation messages rendered adjacent to their field; validation logic unchanged — adapt `tests/component/person-form.test.ts` only where the new markup requires it
- [X] T022 [P] [US4] Restyle `src/client/pages/PersonDetailPage.vue` and `src/client/components/ContactEntryList.vue`: dense record layout, email/phone entry lists with primary markers and add/edit/remove controls restyled; behavior unchanged — adapt `tests/component/person-detail-page.test.ts` and `tests/component/contact-entry-list.test.ts` only where the new markup requires it

**Checkpoint**: `npm test` green; whole app is cohesive page to page.

---

## Phase 7: User Story 5 - Usable at phone width (Priority: P5)

**Goal**: At 375px: board lanes reachable by horizontal scroll, nav links reachable, People flows work, no page-level horizontal overflow.

**Independent Test**: 375px viewport walk of board + People (quickstart.md step 5). This story is CSS-only — no component-testable behavior, so verification is browser-driven (the TDD exception noted in plan.md's constitution check; evidence lands in Phase 8).

### Implementation for User Story 5

- [X] T023 [US5] Responsive pass across `src/client/App.vue` and page/component styles: compact nav padding at small widths, fluid max-widths on forms and pages, only the board container scrolls horizontally — body never does
- [X] T024 [US5] Verify at 375px against the dev server (resize + walk board scroll, nav taps, person creation) and fix any overflow or unreachable control found; leave the codebase ready for the Phase 8 evidence run

**Checkpoint**: All five stories functional.

---

## Phase 8: Polish & Verification

**Purpose**: Cross-cutting sweeps, the constitution's evidence gate, and acceptance readiness

- [X] T025 [P] Sweep `src/client/` for leftovers: no `window.confirm`/`window.alert` anywhere (SC-004), remaining scoped styles (drop indicator, error banner, links) use theme-consistent colors, no hardcoded light-theme values
- [X] T026 Run the full gate and record output: `npm run lint && npm run typecheck && npm test && npm run build` — everything green (FR-011, SC-002); fix anything that isn't
- [X] T027 Dispatch the `browser-tester` agent against the dev server (UI http://localhost:5109, API 3009): execute every acceptance scenario from spec.md US1–US5 plus edge cases (30-card lane at desktop, dialog cancel/confirm, empty states, 375px walk, drag persistence, long-title card) and save screenshots + results to `docs/evidence/009-ui-refresh/`
- [X] T028 Dispatch the `verifier` agent: independently confirm every acceptance criterion has a passing automated check and matching evidence in `docs/evidence/009-ui-refresh/`; address any finding and re-run until clean — then the feature is ready for the PR and Tyler's manual pass (SC-007)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 → T003 (types); T002 independent
- **Foundational (Phase 2)**: none (see note)
- **US1 (Phase 3)**: needs Setup; T004 (red) → T005 → T006 (green)
- **US2 (Phase 4)**: needs US1's shell (theme provider, content-area height). T007/T008/T009 (red, parallel) → T010 → T011 → T012 → T013; T014 parallel with T010–T013
- **US3 (Phase 5)**: needs US1; independent of US2/US4. T015 (red) → T016 → T017; T018 parallel with T016/T017
- **US4 (Phase 6)**: needs US1; independent of US2/US3. T019 (red) → T020; T021/T022 parallel with T020
- **US5 (Phase 7)**: needs US1–US4 styles in place to be meaningful. T023 → T024
- **Polish (Phase 8)**: needs all stories. T025 [P] → T026 → T027 → T028 (evidence before verification)

### Parallel Opportunities

- T002 alongside T001/T003
- All three US2 test tasks (T007, T008, T009) together; T014 alongside T010–T013
- US3 and US4 are independent of each other and of US2 — after US1, Phases 4/5/6 could proceed in parallel sessions if ever staffed that way; solo, run them in priority order
- T018 alongside T016/T017; T021/T022 alongside T020; T025 alongside T026 prep

## Implementation Strategy

**MVP first**: Phases 1 + 3 (US1) deliver the visible transformation — the dark shell — and are independently demoable. Then US2 (the board, the biggest win), US3, US4, US5 in priority order, each ending at a green-suite checkpoint. Phase 8 is the constitution's evidence gate; nothing is reported done to Tyler before T027/T028 complete. Commit after each task or coherent group (Conventional Commits); the Stop-hook gate (lint/typecheck/test/build) must pass at every stop.

## Notes

- FR-012 (password page) and FR-013 (card faces title-only, lane config unchanged) require no tasks — they are do-nothing guarantees enforced by the regression gate (T026) and verifier (T028).
- Existing tests are adapted only where a spec-named upgrade changes the surface they drive (research.md R10); adaptations ride inside the story task that changes that surface — never silent deletions.
- Naive UI imports are explicit/named per research.md R11 — no auto-import plugin.
