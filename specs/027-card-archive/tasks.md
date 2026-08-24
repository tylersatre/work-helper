# Tasks: card-archive

**Input**: Design documents from `/specs/027-card-archive/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks are **mandatory** in this repo — Constitution II (Test-First, NON-NEGOTIABLE) requires a failing test before the code that makes it pass. Every implementation task below is preceded by the failing test that drives it; code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demonstrated independently. Phases follow the spec's priorities (P1 → P1 → P2 → P2 → P3), with US1 and US2 ordered exactly as `plan.md`'s "Design notes carried into `/speckit-tasks`" lays out — US1 lands the detail-view control, US2 lands the board-side default-hide/reveal layering, and together they form one coherent, independently demonstrable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task names its exact file path

## Path Conventions

Single-package web app per plan.md: `src/client`, `src/server`, `src/shared`, tests split `tests/unit`, `tests/integration`, `tests/component`. All paths are repository-root relative.

**One schema change, one migration** — `tasks.archived` (boolean, `NOT NULL DEFAULT false`), a single non-destructive `ALTER TABLE ADD` (data-model.md, research.md R1).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the worktree is ready; no project initialization is needed (existing repo, existing tooling, no new dependency).

- [X] T001 Verify the worktree baseline is green before any change by running `npm run lint && npm run typecheck && npm test && npm run build` from the repository root, recording that the suite passes on branch `027-card-archive` (so later failures are provably this feature's)
- [X] T002 [P] Create the evidence directory `docs/evidence/card-archive/` with a `.gitkeep` so browser and MCP evidence has a home (Constitution III)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `archived` column, the migration, the shared type, and the service/route pair every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add `archived: integer('archived', { mode: 'boolean' }).notNull().default(false)` to the `tasks` table in `src/server/db/schema.ts` per data-model.md
- [X] T004 Generate the migration with `npx drizzle-kit generate`, inspect the output before committing (CLAUDE.md's migration rule) to confirm it is a single non-destructive `ALTER TABLE tasks ADD archived integer DEFAULT 0 NOT NULL` with no table rebuild (research.md R1) — expected to land as `drizzle/0005_<generated-name>.sql`; hand-adjust and flag to Tyler only if drizzle-kit proposes anything lossier
- [X] T005 Add `archived: boolean` to the `Task` interface in `src/shared/types.ts` per data-model.md, letting `BoardTask`/`TaskDetail` inherit it with no further edits
- [X] T006 Write failing integration tests in `tests/integration/task-archive.test.ts` for `POST /api/tasks/:id/archive` and `POST /api/tasks/:id/unarchive` per `contracts/http-api.md`: archiving an active task returns `archived: true` with `lane`/`position`/notes/links untouched (FR-003, FR-008); archiving an already-archived task is an idempotent no-op with no field changes (edge case, research.md R4); a not-found `:id` returns 404 `{ error: { message: 'Task not found' } }` for both routes; unarchiving an archived task returns `archived: false` with `position` recomputed to `max(position) + 1` over the whole lane (data-model.md, research.md R3); unarchiving an already-active task is an idempotent no-op that does **not** move `position` (research.md R4); `GET /api/board` includes both an archived and an active task in the same lane, each correctly flagged. Confirm the tests FAIL (routes do not exist yet)
- [X] T007 Implement `archiveTask(db, id)` and `unarchiveTask(db, id)` in `src/server/services/tasks.ts` per data-model.md's signatures and transition rules (not-found → error union; already-in-target-state → unchanged no-op; real transition → `UPDATE` plus, for unarchive only, the lane-wide `max(position) + 1` recompute inside a transaction, mirroring `createTask`'s existing pattern)
- [X] T008 Add `POST /api/tasks/:id/archive` and `POST /api/tasks/:id/unarchive` to `src/server/routes/tasks.ts`, wired to T007's service functions following the existing `deleteTask`/`updateTaskTitle` route conventions, making T006 pass

**Checkpoint**: The column, migration, shared type, service, and routes exist. `GET /api/board` and `GET /api/tasks/:id` already flow `archived` through automatically (data-model.md — no query-shape change needed). User story implementation can now begin.

---

## Phase 3: User Story 1 - Archive a card from its detail view (Priority: P1) 🎯 MVP (half)

**Goal**: The card detail view grows an archive control that archives immediately, with no confirmation, and returns to the board — identically regardless of the card's lane.

**Independent Test**: Open a card's detail view, click the archive control, and verify the card no longer appears in any lane on the board. (Full board-side confirmation of "no longer appears" completes once US2's default-hide layering lands in Phase 4 — plan.md treats US1+US2 as one coherent P1 increment.)

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they FAIL before any implementation task in this phase.

- [X] T009 [P] [US1] Extend `tests/component/task-detail.test.ts` with a failing test that `data-testid="archive-card-button"` renders in the header next to the existing lane pills and `data-testid="delete-card-button"` whenever `task.archived === false` (FR-001, scenario 1)
- [X] T010 [P] [US1] Extend `tests/component/task-detail.test.ts` with a failing test that clicking `archive-card-button` issues `POST /api/tasks/:id/archive` with no confirmation dialog (no `role="alertdialog"`) and, on success, navigates to the board (`router.push('/')`) (FR-002, scenario 2)
- [X] T011 [P] [US1] Extend `tests/component/task-detail.test.ts` with a failing test that the same `archive-card-button` behavior holds for a card in the In Progress lane, not just Done (FR-003, scenario 3), and a failing test that a failed archive request surfaces inline via a `role="alert"` region without navigating away, following the existing `laneError`/`deleteError` precedent

### Implementation for User Story 1

- [X] T012 [US1] Implement the archive control in `src/client/pages/TaskDetailPage.vue`: render `data-testid="archive-card-button"` in the header when `task.archived === false`, call `POST /api/tasks/:id/archive` on click with no confirmation step, navigate to the board on success, and surface a failure in a new `archiveError` ref rendered `role="alert"` (`contracts/board-archive-ui.md`), making T009–T011 pass

**Checkpoint**: The detail-view half of US1 is demonstrable. Full "disappears from the board" behavior is confirmed once Phase 4 lands the default-hide gate.

---

## Phase 4: User Story 2 - Reveal and restore an archived card (Priority: P1) 🎯 MVP (other half)

**Goal**: The board hides archived cards by default (completing US1's promise), the filter bar's "Show archived" toggle reveals them dimmed and badged in place, and the detail view gains a symmetric unarchive control.

**Independent Test**: With an archived card, turn on the "Show archived" toggle, verify it reappears dimmed and badged in its lane, open its detail view, click unarchive, and verify it becomes an active card at the bottom of its original lane.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] Extend `tests/component/board.test.ts` with failing tests that: with the toggle absent/off, an archived card is never rendered in any lane even though `GET /api/board` now includes it (FR-004); toggling `data-testid="show-archived-toggle"` on reveals the archived card dimmed with `data-testid="archived-badge"`, in its normal manual-order position among that lane's other cards (FR-006, scenario 1)
- [X] T014 [P] [US2] Extend `tests/component/task-card.test.ts` with failing tests that `TaskCard.vue` renders a dimmed style and `data-testid="archived-badge"` when `task.archived === true`, neither when `false`, and that no archive/unarchive click affordance is added to the card face — clicking it still only navigates to the detail view (FR-006, FR-017)
- [X] T015 [P] [US2] Extend `tests/component/task-detail.test.ts` with failing tests that: an archived task's header renders `data-testid="unarchive-card-button"` in place of `archive-card-button`, never both (FR-007, scenario 2), and that its notes and its links to people, companies, and email conversations are unchanged from before archiving; clicking `unarchive-card-button` issues `POST /api/tasks/:id/unarchive` with no confirmation, updates `task.value.archived` to `false` in place **without** navigating away, and the header immediately swaps back to `archive-card-button` (FR-009, FR-010, scenario 3)

### Implementation for User Story 2

- [X] T016 [US2] Add a `showArchived` prop/`update:showArchived` emit pair to `src/client/components/BoardFilterBar.vue`: a labeled `data-testid="show-archived-toggle"`, off by default, independent of the existing `text`/`tagIds` props (FR-005, `contracts/board-archive-ui.md`)
- [X] T017 [US2] Add a session-local `showArchived` ref to `src/client/components/Board.vue` (persistence wiring is US5) and layer `archivedGatedLanes` ahead of the existing `matchesBoardFilter`-based `visibleLanes` computed exactly per `contracts/http-api.md`'s snippet, recomputing `totalCount`/`visibleCount` over the gated set, making T013 pass
- [X] T018 [US2] Add dimmed styling and the `archived-badge` to `src/client/components/TaskCard.vue` using `palette.ts` tokens (no pure black, no new hardcoded colors) when `task.archived`, making T014 pass
- [X] T019 [US2] Implement the unarchive control in `src/client/pages/TaskDetailPage.vue`: render `data-testid="unarchive-card-button"` instead of `archive-card-button` when `task.archived === true`, call `POST /api/tasks/:id/unarchive` on click with no confirmation, update `task.value.archived = false` in place on success (no navigation), reuse `archiveError` for failures, making T015 pass

**Checkpoint**: US1 and US2 together are the coherent P1 increment — archive hides the card from the board, the toggle reveals it dimmed and badged in place, and unarchive restores it to the bottom of its lane.

---

## Phase 5: User Story 3 - Archived cards respect the board's search and tag filters (Priority: P2)

**Goal**: With "Show archived" on, the existing text search and tag filter apply to archived cards using the same rules as active cards, and stay overridden by the toggle when it's off.

**Independent Test**: With the "Show archived" toggle on and two archived cards where only one matches a search term, verify only the matching one remains visible.

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Extend `tests/component/board.test.ts` with failing tests that: with `show-archived-toggle` on and two archived cards where only one's title matches a typed search term, only the matching card remains visible, still dimmed and badged (FR-011, scenario 1); and that with the toggle **off**, an archived card that would otherwise match the active text search or tag filter stays hidden regardless (FR-012, edge case)

### Implementation for User Story 3

- [X] T021 [US3] Re-run `tests/component/board.test.ts` against T017's `archivedGatedLanes` → `visibleLanes` composition and confirm T020 passes with no further `src/` edit (plan.md's design notes: this story is primarily test-coverage confirming the existing layering, not new implementation — per `research.md` R2, `matchesBoardFilter` in `src/shared/board-filter.ts` stays untouched). If T020 fails, the fix belongs in `Board.vue`'s gate ordering, not in the shared predicate

**Checkpoint**: Search/tag parity for archived cards is confirmed by construction — the toggle gate runs structurally ahead of text/tag matching.

---

## Phase 6: User Story 4 - Agents can archive and unarchive cards through MCP (Priority: P2)

**Goal**: `list-board` gains an `includeArchived` argument, and two new one-card tools, `archive-card`/`unarchive-card`, give agents the same actions Tyler has in the UI.

**Independent Test**: Call the archive-card MCP tool on an active card, verify it's excluded from the default `list-board` response and included when `list-board` is called with include-archived, then call unarchive-card and verify it's active again in both the default response and the web UI.

### Tests for User Story 4 ⚠️

- [X] T022 [P] [US4] Extend `tests/integration/mcp-read-tools.test.ts` with failing tests for `list-board` per `contracts/mcp-tools.md`'s worked examples: `{}` returns only active cards, each `archived: false` (A1, unchanged from today); `{ includeArchived: true }` returns every card, active and archived, each correctly flagged, grouped under its lane (A2); the archived gate applies **before** `search`/`tags` matching — an archived card titled to match a search term stays excluded when `includeArchived` is omitted (A3, FR-012 parity); with `includeArchived: true`, `search`/`tags` matching on an archived card behaves identically to an active card's (A4, US3 parity)
- [X] T023 [P] [US4] Create `tests/integration/mcp-archive-tools.test.ts` with failing tests for `archive-card` and `unarchive-card` per `contracts/mcp-tools.md`: archiving an active task returns a `taskSummarySchema` with `archived: true`; a not-found `taskId` returns a tool error for both tools; archiving an already-archived task is an idempotent no-op returning the same success shape (R4); unarchiving an archived task returns `archived: false` with `position` at the bottom of its lane; unarchiving an already-active task is an idempotent no-op that does not move `position` (FR-014, R4)

### Implementation for User Story 4

- [X] T024 [US4] Add `archived: z.boolean()` to `taskSummarySchema` in `src/server/mcp/tools.ts`, and add `archived: <row>.archived` to every hand-built `structuredContent` mapping (`create-task`, `move-task`, `update-task`, `taskDetailContent`), per `research.md` R5
- [X] T025 [US4] Add `includeArchived: z.boolean().optional()` to `list-board`'s input schema in `src/server/mcp/tools.ts` and implement the server-side gate (filtering out archived cards before the existing `matchesBoardFilter` call, exactly mirroring the UI's toggle-before-filter order per `research.md` R2), making T022 pass
- [X] T026 [US4] Register the `archive-card` and `unarchive-card` MCP tools in `src/server/mcp/tools.ts` per `contracts/mcp-tools.md` (input `{ taskId: z.number().int().positive() }`, calling T007's `archiveTask`/`unarchiveTask`, `toolError('Task ${taskId} not found')` when not found, output `taskSummarySchema`), making T023 pass

**Checkpoint**: Agents have the same archive/unarchive/list-with-filter capability as the web UI, with no delete tool added (FR-019 unaffected).

---

## Phase 7: User Story 5 - The "Show archived" toggle persists (Priority: P3)

**Goal**: The "Show archived" toggle survives a page reload, via its own independent `localStorage` key.

**Independent Test**: Turn on the "Show archived" toggle, reload the page, and verify the toggle is still on and archived cards are still shown.

### Tests for User Story 5 ⚠️

- [X] T027 [P] [US5] Create `tests/unit/board-archive-storage.test.ts` with failing tests for `readShowArchived()`/`writeShowArchived()` over a stubbed `localStorage` under the key `wh.board.showArchived`: a round trip returns what was written; malformed or missing storage reads as `false`; an absent or throwing `localStorage` degrades to non-persistent behavior rather than throwing (mirrors `board-filter-storage.ts`'s shape, `research.md` R7)
- [X] T028 [P] [US5] Extend `tests/component/board.test.ts` with a failing test that, with `wh.board.showArchived` already stored as `true`, a freshly mounted `Board.vue` renders the toggle checked and archived cards visible with no user interaction (FR-015, scenario 1)

### Implementation for User Story 5

- [X] T029 [US5] Create `src/client/utils/board-archive-storage.ts` exporting `readShowArchived()`/`writeShowArchived()`, mirroring `board-filter-storage.ts`'s try/catch shape but under its own key and its own file (`research.md` R7 — kept independent of `BoardFilter`'s own persistence), making T027 pass
- [X] T030 [US5] Wire `src/client/components/Board.vue`'s `showArchived` ref (from T017) to `board-archive-storage.ts` — read on mount before first render, write on every change — making T028 pass

**Checkpoint**: All five user stories are independently functional; the toggle survives a reload.

---

## Phase 8: Polish, Evidence & Verification

**Purpose**: Cross-cutting confirmation and the evidence Constitution III requires. Nothing here changes feature behavior.

- [X] T031 Run the full gate from the repository root — `npm run lint && npm run typecheck && npm test && npm run build` — and confirm all green, including the new `0005_*` migration applying cleanly to a fresh database and `delete-card`'s existing behavior unaffected (FR-019, non-regression)
- [X] T032 Seed a small multi-lane board against the running dev API (`npm run dev` → API `http://localhost:3027`, UI `http://localhost:5127`, quickstart.md §2): at least "Follow up with Sam" in To Do and "Write proposal" in In Progress, plus a second card such as "Draft goals" to archive alongside "Follow up with Sam" for US3's two-card search-narrowing scenario
- [X] T033 Dispatch the `browser-tester` agent against `http://localhost:5127` to walk US1, US2, US3, and US5's Given/When/Then scenarios on the seeded board and write screenshots plus results to `docs/evidence/card-archive/`, covering at minimum: the detail view's archive control next to the lane pills and delete control; the board immediately after archiving, showing the card gone from every lane; the filter bar with `Show archived` off then on, the archived card reappearing dimmed with its badge in its original lane position; the archived card's detail view showing the unarchive control; the board right after unarchiving, active at the bottom of its original lane with `Show archived` off; a search narrowing two archived cards down to the one matching; the board after a reload with `Show archived` still on (quickstart.md §3)
- [X] T034 [P] Record the MCP-only evidence for US4 (no UI surface) with `npx vitest run tests/integration/mcp-read-tools.test.ts tests/integration/mcp-archive-tools.test.ts --reporter=verbose 2>&1 | tee docs/evidence/card-archive/mcp-archive-tools.txt` (quickstart.md §4)
- [X] T035 Dispatch the `verifier` agent with `spec.md`, `quickstart.md`, and `docs/evidence/card-archive/`, confirming every FR (FR-001–FR-019) and SC (SC-001–SC-006) has both a passing automated check and surface-appropriate evidence; the verifier re-runs the checks itself rather than trusting a summary (Constitution III)
- [ ] T036 Open the PR with a Conventional Commits title, calling out the single additive `tasks.archived` migration (`drizzle/0005_*.sql`, non-destructive `ALTER TABLE ADD`) and that `delete-card` and `board-search-filter`'s own tag-selector/persistence are unaffected, and let the Claude Code CI review run on the diff

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story** (the column, migration, type, service, and routes are what every story is built on)
- **US1 (Phase 3)**: depends on Phase 2 only
- **US2 (Phase 4)**: depends on Phase 2; shares `TaskDetailPage.vue`'s header and `archiveError` with US1, and completes the board-side default-hide behavior US1's own acceptance scenario relies on — lands immediately after US1 as one increment
- **US3 (Phase 5)**: depends on Phase 4's `archivedGatedLanes` (T017) existing — it is a coverage-only phase confirming that composition, not new implementation
- **US4 (Phase 6)**: depends on Phase 2 only — **fully independent of the client phases** and can run in parallel with US1–US3, US5 (different files: `src/server/mcp/tools.ts`, `tests/integration/mcp-*.test.ts`)
- **US5 (Phase 7)**: depends on Phase 4's `showArchived` ref existing in `Board.vue` (T017)
- **Polish (Phase 8)**: depends on every story phase intended for this release

### Within Each User Story

- Tests are written and confirmed FAILING before the implementation tasks in that phase (Constitution II)
- Schema/type/service/route foundation before anything that calls it
- Story complete and checkpointed before moving to the next priority

### Parallel Opportunities

- T002 runs alongside T001; T003–T005 are sequential (same schema/type foundation) but T006 (integration tests) can be drafted in parallel with T003–T005 since it only needs the contract, not the implementation
- Within each story phase, all `[P]`-marked test tasks touch distinct files or distinct describe blocks and can be written together — T009/T010/T011; T013/T014/T015; T022/T023; T027/T028
- **The largest parallel win**: once Phase 2 is done, US4 (Phase 6, server + integration tests) is disjoint from US1/US2/US3/US5 (client + component tests) and can proceed concurrently
- T034 (recording MCP output) is independent of T033 (browser evidence) once T031 is green

## Parallel Example: User Story 1

```bash
# Write US1's failing component test groups together, then confirm all FAIL:
Task: "Extend tests/component/task-detail.test.ts with a failing archive-card-button render test"
Task: "Extend tests/component/task-detail.test.ts with a failing archive-click/navigate test"
Task: "Extend tests/component/task-detail.test.ts with a failing lane-independence + error test"

npx vitest run tests/component/task-detail.test.ts   # expect RED before T012
```

## Parallel Example: Foundational

```bash
Task: "Add archived column to src/server/db/schema.ts"
Task: "Write failing integration tests in tests/integration/task-archive.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T008) — **critical, blocks everything**
3. Phase 3: US1 (T009–T012)
4. Phase 4: US2 (T013–T019)
5. **STOP and VALIDATE**: archive a card from its detail view, watch it vanish from the board, flip "Show archived" and watch it reappear dimmed and badged, unarchive it back to the bottom of its lane — the feature's full core promise, independently demonstrable
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → column, migration, type, service, and routes in place
2. + US1 + US2 → **MVP**: the complete archive/reveal/restore loop in the web UI
3. + US3 → search/tag parity for archived cards confirmed
4. + US4 → agents get the same archive/unarchive/list-with-filter capability
5. + US5 → the toggle survives a reload
6. + Phase 8 → evidence, verifier, PR

Each step adds value without breaking the previous ones.

---

## Notes

- `[P]` = different files or independent test groups, no dependency on incomplete work
- `[Story]` maps each task to its spec user story for traceability
- Confirm every test FAILS before writing the code that makes it pass — code written before its failing test is discarded, not retrofitted (Constitution II)
- Commit after each task or logical group, Conventional Commits
- Two rules that are easy to get subtly wrong (plan.md): `unarchiveTask` must **not** recompute `position` on a no-op call — only an actual `archived → active` transition appends to the bottom; and the archived gate is structural (`Board.vue`'s `archivedGatedLanes`, `list-board`'s pre-filter `.filter()`) — never add an `archived` parameter to the shared `matchesBoardFilter` predicate itself
- The `drizzle/0005_*.sql` migration file, once landed on `main`, is immutable — never edited, regenerated, or deleted (CLAUDE.md)
