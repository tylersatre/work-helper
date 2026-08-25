# Tasks: Up Next Dashboard

**Input**: Design documents from `/specs/029-up-next-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D14), data-model.md, contracts/dashboard-api.md, contracts/lanes-config.md, quickstart.md

**Tests**: TDD is NON-NEGOTIABLE (constitution Principle II) — every test task is written first and MUST FAIL before its implementation task starts. Code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story is an independently testable increment. No schema migration exists in this feature — the saved view lives in the existing `app_state` table (research D1).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 — only on user-story-phase tasks
- Every task names its exact file path(s)

## Path Conventions

Single-repo web app per plan.md: server in `src/server/`, client in `src/client/`, isomorphic code in `src/shared/`, tests in `tests/unit/`, `tests/integration/`, `tests/component/`.

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline — no project init, dependencies, or migrations are needed (the worktree SessionStart hook already installed dependencies; research D1 eliminates schema changes).

- [X] T001 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` from the worktree root and confirm it passes before any feature work, so every later red test is attributable to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types + saved-view schema, the extended lane-config loader, app wiring, and the enriched `GET /api/dashboard` endpoint — every user story consumes this payload.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Extend `tests/unit/lanes-config.test.ts` with failing tests for the union config format (contracts/lanes-config.md): legacy bare-array file still loads and normalizes to `{ lanes, dashboard: { defaultLanes: [lanes[0]], quickDoneLane: lanes[lanes.length-1] } }`; object form loads with both designations honored and each independently optional; designation referencing an unknown lane, empty or duplicate `dashboardDefaultLanes`, non-member `quickDoneLane`, and malformed JSON each throw with the config path embedded in the message (preserve existing message style — the deploy test asserts the filename appears in startup logs)
- [X] T003 [P] Create `tests/integration/dashboard.test.ts` (buildApp + `app.inject`, in-memory migrated DB) with failing tests for `GET /api/dashboard` (contracts/dashboard-api.md): response carries configured lane order, fallback-applied `defaultLanes`/`quickDoneLane` both with and without the `dashboardLanes` build option, and `savedView: null` before any save; cards cover all configured lanes ordered lane (config order) then `position ASC, id ASC` with archived cards absent (FR-004); enrichment per data-model.md §3 — tags with colors in `name COLLATE NOCASE` order, `searchText` identical to the board's corpus for the same task, `latestNote` picked by `createdAt` desc with `id` desc tiebreak (two notes in the same ms), `null` latestNote when no notes, structured people (`firstName lastName`) and companies; a corrupt/unparsable `app_state` value under key `dashboard.view` yields `savedView: null`, not an error
- [X] T004 [P] Add `DashboardSavedView`, `DashboardCard`, and `DashboardResponse` types to `src/shared/types.ts` per data-model.md §1/§3 and contracts/dashboard-api.md
- [X] T005 [P] Add `dashboardSavedViewSchema` to `src/shared/validation.ts` (data-model.md §1): `lanes` ≥1 unique non-empty strings, `tagIds` unique integers, `text` any string, `limit` integer 1–100, `show` object with all four required booleans (`tags`, `latestNote`, `links`, `lane`) — shared by server PUT validation and client pre-validation (noteTextSchema precedent)
- [X] T006 Extend `src/server/lanes-config.ts` with the zod union (legacy bare array | object form with optional `dashboardDefaultLanes`/`quickDoneLane`), validation rules and fallbacks from contracts/lanes-config.md, returning normalized `{ lanes, dashboard: { defaultLanes, quickDoneLane } }` — makes T002 pass
- [X] T007 Extend `src/server/app.ts` with an optional `dashboardLanes?: { defaultLanes: string[]; quickDoneLane: string }` build option that derives the first-lane/last-lane fallback internally when absent (so ~20 existing test callers passing only `lanes` stay untouched and exercise the fallback), decorate it for routes, and register `dashboardRoutes`; extend `src/server/index.ts` to pass the loader's `dashboard` result into `buildApp` (research D2)
- [X] T008 Create `src/server/services/dashboard.ts` building the enriched card projection (research D12): reuse the tasks-service `groupByTaskId` pattern and `searchText` builder (`src/server/services/tasks.ts:112-120`), add a latest-note-per-task projection ordered `desc(createdAt), desc(id)` (the `getTaskDetail` tiebreak), select `archived = false` rows across all configured lanes, order lane (config order) then `position ASC, id ASC`
- [X] T009 Create `src/server/routes/dashboard.ts` with `GET /api/dashboard` returning `{ lanes, defaultLanes, quickDoneLane, savedView, cards }`: `savedView` read via `getAppState('dashboard.view')`, parsed and validated against `dashboardSavedViewSchema`, returned verbatim when valid and `null` when absent/unparsable/invalid (never an error); cards from the dashboard service — makes T003 pass

**Checkpoint**: `GET /api/dashboard` fully contractual; all foundational tests green; user stories can begin.

---

## Phase 3: User Story 1 - Glanceable Up Next list (Priority: P1) 🎯 MVP

**Goal**: `/up-next` page reachable from the top nav renders the built-in default view with zero setup: one flat list of the top 5 cards from the config-designated default lanes, ordered lane-then-board-order, each face showing title, tag chips, latest-note snippet + relative time, and linked people/companies.

**Independent Test**: Seed the board per the spec's seeded-board table, never save any dashboard settings, open `/up-next` via the nav link, and compare the rendered list and card faces against Story 1's two acceptance scenarios.

### Tests for User Story 1 (write first — must fail) ⚠️

- [X] T010 [P] [US1] Extend `tests/component/app-shell.test.ts` with failing tests: an "Up Next" link is present in the top nav, `/up-next` marks Up Next as the active section, and Board is NOT active there (guards the `activeSection` board fallback, FR-001)
- [X] T011 [P] [US1] Create `tests/unit/up-next-view.test.ts` with failing tests for the pure view functions (data-model.md §4): `effectiveView` — never-saved/null ⇒ built-in default (config default lanes, no tag/text filter, limit 5, `show` tags/latestNote/links on + lane off, FR-005); stale saved lane names and tag ids silently dropped via intersection; all saved lanes stale ⇒ fall back to `defaultLanes` (FR-021); `selectCards` — lane membership then `matchesBoardFilter` (text+tag AND, any-of tag match, FR-010) then limit truncation only after all filters (FR-003); input order preserved (lane-order-then-position, FR-002); limit larger than matches ⇒ all matches, no padding
- [X] T012 [P] [US1] Create `tests/component/up-next-page.test.ts` (jsdom pragma, @testing-library/vue, mocked fetch) with failing tests: from a seeded-board-shaped payload with `savedView: null`, exactly the 5 expected cards render in order ("Follow up with Sam", "Write proposal", "Review budget", "Book venue", "Order catering") with "Send invites"/"Chase invoice"/"Prep board deck"/archived card absent; the enriched face shows title, VIP tag chip, "Kickoff call went well" snippet with a relative timestamp, "Sam Rivera" and "Acme Inc", and no lane name; a bare card ("Order catering") shows just its title (Story 1 scenarios 1–2)

### Implementation for User Story 1

- [X] T013 [US1] Create `src/client/utils/up-next-view.ts` with dependency-free `effectiveView(saved, config, availableTags)` and `selectCards(cards, view)` (reusing `matchesBoardFilter` from `src/shared/board-filter.ts` verbatim) — makes T011 pass
- [X] T014 [P] [US1] Add the `/up-next` route → `UpNextPage` to `src/client/router.ts` (research D13)
- [X] T015 [US1] Extend `src/client/App.vue`: "Up Next" `RouterLink` in the top nav and an explicit `up-next` branch in the `activeSection` computed BEFORE the `'board'` fallback — makes T010 pass
- [X] T016 [US1] Create `src/client/components/UpNextCard.vue` (display only — actions arrive in US2): title, `TagChip` reuse for identical tag colors, single-line CSS-ellipsis latest-note snippet with `relativeTime` from `src/client/utils/time.ts`, linked people/company names, optional lane name per the `show.lane` toggle (research D11, FR-007)
- [X] T017 [US1] Create `src/client/components/UpNextDashboard.vue` (fetch `GET /api/dashboard` on mount, compute `effectiveView` + `selectCards`, render `UpNextCard` rows keyed by task id in a `.wh-card-list` container inside a centered ~720px section per the UI conventions) and `src/client/pages/UpNextPage.vue` as a thin page shell (BoardPage precedent) — makes T012 pass

**Checkpoint**: Story 1 fully functional — default view renders correctly with zero configuration. MVP.

---

## Phase 4: User Story 2 - One-click actions from the list (Priority: P2)

**Goal**: Quick done moves a card to the bottom of the designated quick-done lane with no confirmation; an inline add-note control captures a note without leaving the page; failures (concurrent move/archive/delete) surface a graceful inline error and a refetch shows true state.

**Independent Test**: From the seeded default view, quick-done "Write proposal" and add a note to "Follow up with Sam"; verify the board, the task's notes ("You" attribution), and the dashboard list all reflect the actions without navigating away (Story 2 scenarios 1–2).

### Tests for User Story 2 (write first — must fail) ⚠️

- [X] T018 [US2] Extend `tests/component/up-next-page.test.ts` with failing tests: clicking quick done fires `PUT /api/tasks/:id/placement` with `{ lane: <quickDoneLane from payload>, index: Number.MAX_SAFE_INTEGER }` and then refetches the dashboard; a non-ok placement response shows a dismissible inline error AND still refetches (concurrent-change edge case, FR-014); submitting the inline add-note posts to `POST /api/tasks/:id/notes` and refetches; a whitespace-only submission shows the shared validation message and fires NO network request (FR-015)
- [X] T019 [US2] Inspect `tests/integration/tasks.test.ts` placement coverage; only if the `index: Number.MAX_SAFE_INTEGER` bottom-of-lane clamp into a lane that already has cards is not already asserted, add that failing case to `tests/integration/dashboard.test.ts` (quickstart §1 note — extend only if the dashboard flow adds an untested angle; otherwise record it as covered and skip)

### Implementation for User Story 2

- [X] T020 [US2] Extend `src/client/components/UpNextCard.vue` with the quick-done button and an inline add-note editor that pre-validates with the shared `noteTextSchema` from `src/shared/validation.ts` and shows the validation message inline without fetching (research D7); quick actions stop click propagation so they never open the overlay (FR-016/FR-017 boundary)
- [X] T021 [US2] Extend `src/client/components/UpNextDashboard.vue` with the action handlers: quick done calls the placement endpoint with `{ lane: quickDoneLane, index: Number.MAX_SAFE_INTEGER }` then refetches immediately, non-ok responses render the dismissible inline error banner (`Board.vue` banner pattern) plus refetch (research D6); add-note posts then refetches; per-card note-editor state is keyed by task id in refs the poll will never touch (research D11) — makes T018 pass

**Checkpoint**: Stories 1–2 work — the dashboard is actionable, not read-only furniture.

---

## Phase 5: User Story 3 - Configure the view, saved across devices (Priority: P3)

**Goal**: Display and filter popups edit a pending copy with live preview behind the popup; OK saves the full view server-side via `PUT /api/dashboard/view` (one saved view, any device); dirty-dismiss warns before discarding; invalid views (no lanes, bad limit) cannot be saved; empty results show a styled no-match message.

**Independent Test**: Change display toggles and filters through the popups verifying live preview / OK-save / discard-confirmation, reload, then open `/up-next` in a fresh browser session sharing no cookies or storage and verify the same saved view applies (Story 3 scenarios 1–4, SC-003).

### Tests for User Story 3 (write first — must fail) ⚠️

- [X] T022 [P] [US3] Extend `tests/integration/dashboard.test.ts` with failing tests for `PUT /api/dashboard/view` (contracts/dashboard-api.md): 200 echoes the saved view and the next GET returns it verbatim; 400 with the `{ error: { message } }` envelope on empty `lanes`, limit 0 / negative / non-integer / >100, and a missing `show` key (nothing written); a second PUT fully replaces the first (last write wins, FR-019); a stored view referencing since-deleted tags/lanes is returned verbatim by GET (client-side tolerance, FR-021)
- [X] T023 [P] [US3] Extend `tests/unit/up-next-view.test.ts` with failing tests for `tagOptions(cards)`: only tags attached to ≥1 card, deduped by id, sorted `localeCompare(..., { sensitivity: 'base' })` (FR-009, research D10)
- [X] T024 [P] [US3] Extend `tests/component/up-next-page.test.ts` with failing tests: display popup opens with exactly four toggles reflecting the current view (FR-008); toggling lane on / latest note off previews live on the list behind the popup; dismissing with dirty state raises the discard confirmation, discarding reverts the list to the saved view, OK saves via the view PUT and refetches (FR-011); filter popup offers lane multi-select, tag multi-select, text input, and limit input reflecting the current view (FR-009); adding a lane or raising the limit grows the previewed list live; OK is disabled with zero lanes selected or a non-integer/out-of-range limit (invalid-view edge case); a filter combination matching nothing renders the styled no-match message with a `data-testid`, not a blank page (FR-013, SC-005)

### Implementation for User Story 3

- [X] T025 [US3] Add `PUT /api/dashboard/view` to `src/server/routes/dashboard.ts`: validate the body with the shared `dashboardSavedViewSchema` (400 envelope on violation, nothing written), upsert via `setAppState('dashboard.view', JSON.stringify(body))`, echo the saved view — makes T022 pass
- [X] T026 [US3] Add `tagOptions(cards)` to `src/client/utils/up-next-view.ts` — makes T023 pass
- [X] T027 [P] [US3] Create `src/client/components/UpNextDisplayPopup.vue`: `NModal preset="dialog"` (modal conventions: `display-directive="if"`, root `data-testid`), four toggles seeded from the effective view snapshot on open, edits emitted as pending state for live preview, dirty = deep-equal against the open-time snapshot (toggling back counts as clean), any non-OK close while dirty opens a nested "Discard changes?" confirm that reverts on discard, OK emits the full merged view (research D9)
- [X] T028 [P] [US3] Create `src/client/components/UpNextFilterPopup.vue`: lane multi-select over configured lanes, tag multi-select fed by `tagOptions`, text input, `NInputNumber` limit (min 1, max 100, integer precision, default 5), same snapshot/pending/dirty/confirm-discard mechanics, OK disabled while pending state is invalid (no lanes, bad limit) (research D9)
- [X] T029 [US3] Extend `src/client/components/UpNextDashboard.vue`: popup orchestration — while a popup is open its pending state drives `selectCards`/display over the latest payload (live preview), OK PUTs the merged view then refetches, discard reverts to the saved view; render the styled `NEmpty` no-match state with a `data-testid` when the filtered list is empty — makes T024 pass

**Checkpoint**: Stories 1–3 work — the view is configurable and follows Tyler across devices.

---

## Phase 6: User Story 4 - Full card detail as an overlay (Priority: P4)

**Goal**: Clicking a card (outside its quick actions) opens the complete detail view — lane pills, notes, tags, links, archive/delete — as an overlay above the dashboard; closing it refetches so overlay-made changes appear in the list; the URL never changes.

**Independent Test**: Click "Order catering", verify the overlay shows everything the detail page shows, click the "Up Next" lane pill inside it, close it, and verify the dashboard shows "Order catering" 4th and "Book venue" 5th with no navigation (Story 4 scenario 1).

### Tests for User Story 4 (write first — must fail) ⚠️

- [X] T030 [US4] Extend `tests/component/up-next-page.test.ts` with failing tests: clicking a card outside its quick actions opens a modal rendering the task's full detail (`TaskDetail`); clicking a quick action does NOT open it; closing the overlay refetches and the list reflects a lane move made inside it; the route never changes while the overlay opens and closes (FR-017)

### Implementation for User Story 4

- [X] T031 [US4] Extract `src/client/components/TaskDetail.vue` from `src/client/pages/TaskDetailPage.vue`: the full detail body takes a `taskId: number` prop and replaces the two hard-coded `router.push('/')` calls (archive, delete) with emitted events; `TaskDetailPage.vue` becomes a thin route wrapper passing `route.params.id` and navigating home on those emits exactly as today (BoardPage → Board precedent, research D8); all existing detail-page tests MUST stay green — this is a behavior-preserving refactor under existing coverage
- [X] T032 [US4] Extend `src/client/components/UpNextDashboard.vue`: card-body click opens an `NModal` (card preset, ~680px) rendering `TaskDetail` for that task id; overlay open/task state lives in its own refs; closing (including after archive/delete emits) closes the modal and refetches the dashboard — makes T030 pass

**Checkpoint**: Stories 1–4 work — full card management without leaving the dashboard.

---

## Phase 7: User Story 5 - The page keeps itself current (Priority: P5)

**Goal**: A 45-second poll keeps the untouched page current within the 90-second window — for card changes (including MCP-agent moves) and remotely saved view changes — without ever clobbering an open popup, a typed note draft, or an open overlay, and failing polls stay silent.

**Independent Test**: With the dashboard open and untouched, move a listed card via the MCP move tool from an authorized agent and watch the list update on its own within 90 seconds (Story 5 scenario 1; the MCP half is the integration test, the on-screen half is browser evidence per research D14).

### Tests for User Story 5 (write first — must fail) ⚠️

- [X] T033 [P] [US5] Extend `tests/component/up-next-page.test.ts` with failing fake-timer tests: a 45s tick refetches and applies list changes; an open popup's live preview, a typed-but-unsent note draft, and an open overlay all survive the tick with list changes applied around them (FR-019); a remotely changed `savedView` arriving via poll is adopted by an untouched dashboard but changes nothing visible while a popup is open (pending state keeps driving the preview; OK still saves the popup's state, FR-018/FR-019); a failed tick leaves the last-good list with no error UI and the next successful tick brings it current (FR-022)
- [X] T034 [P] [US5] Extend `tests/integration/dashboard.test.ts`: drive the real MCP `move-task` tool against a listening app (stub identity provider pattern from `tests/integration/mcp-move-tools.test.ts`) and assert the next `GET /api/dashboard` reflects the move (SC-004 MCP half) — NOTE: this may pass immediately since both halves already exist; that is acceptable here, it is evidence coverage, not new behavior

### Implementation for User Story 5

- [X] T035 [US5] Extend `src/client/components/UpNextDashboard.vue`: `POLL_INTERVAL_MS = 45_000` poll refetching `GET /api/dashboard`, started on mount and cleared in `onUnmounted` (`MailboxPanel.vue` pattern); the poll only ever replaces the payload `data` ref — popup pending state, per-card note drafts, and overlay state live in refs it never touches; a failed poll keeps the last-good payload silently; a separate 30s "now" ticker re-renders relative timestamps (`TaskNotes.vue` pattern) (research D5, D11) — makes T033 pass

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Evidence

**Purpose**: The definition-of-done gate — full verification, browser evidence, independent confirmation.

- [X] T036 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` and confirm every suite passes (quickstart §1; also enforced by the Stop hook)
- [X] T037 Produce browser evidence per quickstart §2: create the object-form lane config and scratch DB under `/tmp/up-next-acceptance/`, start the dev server with `LANES_CONFIG_PATH` and `DATABASE_PATH` set (API 3029, UI 5129), seed the spec's board via the API in creation order (tags VIP + Q3, Sam Rivera, Acme Inc, 9 cards, 2 notes, links, archive "Old duplicate"), then dispatch the `browser-tester` agent to confirm the five story checklists with screenshots into `docs/evidence/029-up-next-dashboard/results.md` + `pr-screenshots/` — one numbered entry per criterion with PASS/FAIL
- [X] T038 Dispatch the `verifier` agent to independently re-run the gate and cross-check every FR/SC against the automated tests and the browser evidence before anything is reported done (constitution Principle III)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — run first.
- **Foundational (Phase 2)**: after Setup. BLOCKS all user stories (every story consumes the `GET /api/dashboard` payload, shared types, and lane designations).
- **US1 (Phase 3)**: after Phase 2. No other story dependencies. 🎯 MVP.
- **US2 (Phase 4)**: after US1 (extends `UpNextCard`/`UpNextDashboard` and the US1 component test file).
- **US3 (Phase 5)**: after US1 (extends the same components/tests); independent of US2 — T022/T025 (server PUT) could even start right after Phase 2.
- **US4 (Phase 6)**: after US1 (overlay hangs off the US1 list); T031 (TaskDetail extraction) touches only detail-page files and could start any time after Phase 2.
- **US5 (Phase 7)**: after US1 for the poll itself; the full non-clobber test (T033) needs US2 (note draft), US3 (popup preview), and US4 (overlay) in place, so Phase 7 runs last among stories.
- **Polish (Phase 8)**: after all stories.

### Within Each Story

Tests are written and observed FAILING before implementation (constitution II). Within phases: shared types/schemas → server → client utils → components → orchestration.

### Key Task-Level Dependencies

- T006 ← T002; T008 ← T004; T009 ← T003, T005, T007, T008
- T013 ← T011, T004; T017 ← T012, T013, T014, T016
- T021 ← T018, T020; T025 ← T022, T005; T029 ← T024, T026, T027, T028
- T031 ← T030 (test names the extracted component) — but T031's safety net is the existing detail-page suite; T032 ← T030, T031
- T035 ← T033 and effectively all prior story implementations

### Parallel Opportunities

- Phase 2: T002 + T003 together (different test files); then T004 + T005 together; T006 and T008 in parallel (different files) once their prerequisites exist.
- Phase 3: T010 + T011 + T012 together (three different test files); T014 parallel with T013/T016.
- Phase 5: T022 + T023 + T024 together; then T027 + T028 together (two new component files).
- Phase 7: T033 + T034 together (component vs integration file).
- Cross-story (if parallelizing): after Phase 2, T022/T025 (US3 server half) and T031 (US4 extraction) touch files no other story edits.

---

## Parallel Example: Foundational Phase

```bash
# Write both failing test suites together:
Task: "Extend tests/unit/lanes-config.test.ts with union-format failing tests"      # T002
Task: "Create tests/integration/dashboard.test.ts with GET contract failing tests"  # T003

# Then add shared shapes together:
Task: "Add dashboard types to src/shared/types.ts"              # T004
Task: "Add dashboardSavedViewSchema to src/shared/validation.ts" # T005
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (baseline gate) → Phase 2 (foundational server surface) → Phase 3 (US1).
2. **STOP and VALIDATE**: seed a board, open `/up-next`, confirm Story 1's two scenarios by hand and via the new tests.
3. The page is already useful on a side monitor at this point — a correct, glanceable default list.

### Incremental Delivery

Each subsequent phase is a shippable increment on the same branch: US2 makes it actionable, US3 configurable/cross-device, US4 adds the escape hatch, US5 keeps it fresh. Commit after each task or logical red→green pair (Conventional Commits); the feature lands as one PR after Phase 8.

### Notes

- The committed `config/lanes.json` stays in legacy array form on purpose — everyday dev exercises the fallback path; acceptance runs point `LANES_CONFIG_PATH` at an object-form fixture (research D14).
- The board page, its filter bar, and the MCP tool surface are out of scope — touching them is a spec violation, not a nice-to-have (FR-012, plan constraints).
- No migration files exist in this feature; if one appears something has gone wrong (research D1).
