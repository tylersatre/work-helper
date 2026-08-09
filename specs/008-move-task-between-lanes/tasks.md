# Tasks: Move Task Between Lanes

**Input**: Design documents from `/specs/008-move-task-between-lanes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, contracts/mcp-tools.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires TDD: every behavior gets a failing test before the code that makes it pass. Test tasks below are ordered red-first within each phase; code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story so each story is an independently completable, independently testable increment. One deliberate exception, called out in Phase 3: the server-side placement transaction (`moveTask`, data-model.md "Move task") is a single indivisible algorithm, so its full contract — including the exact-index splice that user-facing Story 2 exercises — is tested and implemented once in the US1 phase rather than split into fake-red halves. Story 2 then delivers the client-side exact-placement experience on top of it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3) — user story phases only
- Every task names exact file paths

## Path Conventions

Single package at repository root: `src/server/`, `src/client/`, `src/shared/`, `tests/`, `drizzle/` — per plan.md Project Structure.

---

## Phase 1: Setup

**Purpose**: Establish a known-good baseline before touching anything.

- [X] T001 Confirm the baseline is green at the repository root: run `npm run lint && npm run typecheck && npm test && npm run build` and verify all pass before any feature change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `position` column, the squashed Drizzle baseline, ordered reads, and creation-append. `position` is NOT NULL with no default, so schema, `createTask`, and existing-test updates must land together to keep the suite green — and every user story depends on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing integration tests for position-based board ordering in tests/integration/board.test.ts: replace the id-ASC ordering expectation; seed tasks via direct `db.insert(tasks)` with explicit out-of-order `position` values; assert `GET /api/board` returns each lane's tasks ordered by `(position ASC, id ASC)` and that each task payload includes `position` (RED — column and ordering don't exist yet)
- [X] T003 [P] Write failing integration tests for creation append-at-bottom in tests/integration/tasks.test.ts: `POST /api/tasks` lands each new task at the bottom of the first configured lane (`position` 0 when empty, then 1, 2, …) below all existing cards, and the response payload includes `position` (RED) — covers FR-008/SC-006, whose user-facing acceptance is US3 scenario 1
- [X] T004 Add `position` integer NOT NULL column (no default) to the `tasks` table in src/server/db/schema.ts, and add `position: number` to the `Task` type in src/shared/types.ts (`BoardLane`/`BoardView`/`TaskDetail` inherit structurally)
- [X] T005 Squash the Drizzle baseline per research.md R2: delete the existing migration files `drizzle/0000_*.sql` through `drizzle/0004_*.sql` and `drizzle/meta/`, run `npx drizzle-kit generate` once against the updated schema to produce a fresh single `0000` baseline, and delete the dev database (`rm -f data/work-helper.db`) so it recreates from the new baseline
- [X] T006 [P] Delete tests/integration/migration-carry-over.test.ts — obsolete under the squashed baseline (research.md R2; deliberate consequence of the constitution's dev-phase data policy, flagged for PR review)
- [X] T007 Update `createTask` in src/server/services/tasks.ts to compute `position = max(position) + 1` over tasks in the first configured lane (0 when empty) inside the existing insert transaction — turns T003 green; applies to both `POST /api/tasks` and MCP `create-task` since both call this service
- [X] T008 Change `listTasksByLane` in src/server/services/tasks.ts to order tasks by `(position ASC, id ASC)` instead of `id ASC` — turns T002 green; `GET /api/board` and MCP `list-board` both inherit this through the shared service
- [X] T009 Sweep the existing suites broken by the NOT NULL column (research.md "Impacted existing tests"): supply `position` in every direct `db.insert(tasks)` seeding and component fixture, and add `position` to exact-payload assertions, across tests/integration/tasks.test.ts, tests/integration/board.test.ts, tests/integration/persistence.test.ts, tests/integration/mcp-read-tools.test.ts, tests/integration/helpers/ (if they seed tasks), tests/component/board.test.ts, tests/component/task-card.test.ts, and tests/component/task-detail.test.ts — do not touch MCP structured-output `position` assertions here (that field arrives in US3, T027)
- [X] T010 Checkpoint: run `npm run lint && npm run typecheck && npm test && npm run build` at the repository root and verify everything is green before starting user stories

**Checkpoint**: Schema carries `position`, reads are deterministic, creation appends — user story implementation can begin.

---

## Phase 3: User Story 1 - Move a card to another lane (Priority: P1) 🎯 MVP

**Goal**: Drag a card from one lane and drop it in another; the card lands in the destination lane, disappears from the source, and the arrangement survives reload. A drag released outside any lane changes nothing.

**Independent Test**: Drag a single card from To Do into another lane, reload the page, confirm the card is in the destination lane and nowhere else (spec US1 Independent Test).

**Note on scope**: T011–T013 deliver the *complete* placement contract (contracts/http-api.md) including exact-index splice, clamping, and same-lane handling, because the move transaction is one atomic algorithm (see Organization note above). US1's client work only sends append-at-end indices; exact drop targeting is US2.

### Tests for User Story 1 (write first, verify RED)

- [X] T011 [US1] Write failing integration tests for `PUT /api/tasks/:id/placement` in tests/integration/tasks.test.ts covering the full contract: cross-lane move shows the task in the destination and gone from the source via `GET /api/board` (FR-001/FR-006); moves work between any lane pair in both directions (FR-002); move into an empty lane; exact-slot splice at top, between two cards, and bottom of a populated lane (FR-003); within-lane reorder in both directions using final-index semantics — `index` counts the lane's cards with the moving card excluded (contracts/http-api.md), so the server splices unchanged: an upward move (bottom card to index 0 lands on top) and a downward move (top card of a 3-card lane to index 1 lands between the other two, [A,B,C] → [B,A,C]) both land exactly at the requested slot (FR-004); index past the end clamps to append; dropping a card onto its own current slot is a 200 no-op leaving order identical; 404 for unknown task id `{ "error": { "message": "Task not found" } }`; 400 for unconfigured lane `{ "error": { "message": "Unknown lane" } }`; 400 for missing/negative/non-integer index `{ "error": { "message": "Invalid index" } }` (RED — endpoint doesn't exist)
- [X] T012 [P] [US1] Write failing component tests in tests/component/board.test.ts (synthetic drag events with a stubbed `dataTransfer` per research.md R4 — jsdom has no native DnD): dropping a card on another lane optimistically moves it to that lane in the rendered board and issues `PUT /api/tasks/:id/placement` with the destination lane; a failed save (rejected/non-2xx fetch) triggers a refetch of `/api/board` restoring the last saved arrangement and shows a visible error banner; the banner clears on the next successful move or dismissal; two drops performed in rapid succession issue their placement PUTs sequentially in drop order — the second request starts only after the first resolves — and the final rendered board reflects both moves (research.md R5, spec edge case "several moves in quick succession"); `dragend` without a drop leaves the rendered board unchanged (RED)
- [X] T013 [P] [US1] Extend tests/component/task-card.test.ts with failing assertions: the card root renders `draggable="true"` and `dragstart` writes the task id to the (stubbed) `dataTransfer` (RED)

### Implementation for User Story 1

- [X] T014 [US1] Implement `moveTask` in src/server/services/tasks.ts per data-model.md "Move task": one better-sqlite3 transaction — load task by id (error `task-not-found`), validate `targetLane` against configured lanes (error `invalid-lane`), read destination lane ids ordered `(position, id)` excluding the moving task, clamp `targetIndex` to `[0, length]`, splice the task id in, renumber the spliced list 0..n-1 and set the task's `lane`, renumber the source lane 0..n-1 when it differs, return the updated row
- [X] T015 [US1] Add `PUT /api/tasks/:id/placement` to src/server/routes/tasks.ts: Zod body `{ lane: string, index: integer >= 0 }`, call `moveTask`, map `task-not-found` → 404 and `invalid-lane` → 400 with the contract's error shapes, invalid body → 400 `Invalid index`/`Unknown lane`, 200 with the updated task summary including `lane` and `position` — turns T011 green
- [X] T016 [P] [US1] Make TaskCard.vue a drag source: `draggable="true"`, `dragstart` sets the task id on `dataTransfer` (and drag-in-progress state), `dragend` emits so the board can clear drag state — turns T013 green
- [X] T017 [P] [US1] Make Lane.vue a drop target: `dragover` calls `preventDefault` to allow dropping (including on an empty lane), `drop` emits `(taskId, laneName, index)` with index = end of the lane's current card list (exact index computation arrives in US2)
- [X] T018 [US1] Implement the move flow in src/client/components/Board.vue: own drag state; on drop, apply the move to local board state immediately (optimistic) and call `PUT /api/tasks/:id/placement`; serialize saves through a promise chain so rapid successive moves post in drop order (research.md R5); on save failure refetch `/api/board` and show a dismissible banner "Couldn't save that move — the board has been restored." that clears on the next successful move or dismissal (if the refetch itself also fails, the banner still shows — the user is informed the move did not take); clear drag state on `dragend` so a drag released outside any lane changes nothing (FR-007) — turns T012 green
- [X] T019 [US1] Collect browser evidence for US1 with the browser-tester agent against the dev server (`npm run dev`, UI at http://localhost:5108, fresh database): quickstart.md scenarios 1–4 — lane move with reload persistence, onward move to a second lane with reload, cancelled drag over the page header leaves the board unchanged, and the save-failure revert (orchestrating session stops the API: banner appears; after API restart + reload the card is back in its last saved slot) — saving screenshots and results to docs/evidence/move-task-between-lanes/

**Checkpoint**: User Story 1 is fully functional on its own — cards move between lanes, persist, and cancelled drags are harmless. This is the MVP.

---

## Phase 4: User Story 2 - Place a card exactly where it is dropped (Priority: P2)

**Goal**: The drop position is meaningful: cards land exactly where dropped — top, bottom, or between two specific cards — in the same or another lane, with a drop indicator during drag, and the exact order survives reload.

**Independent Test**: Drag cards within one lane and into a populated lane, reload, confirm the exact top-to-bottom order everywhere (spec US2 Independent Test). Server-side exact placement is already covered by T011; this phase makes the client produce exact indices.

### Tests for User Story 2 (write first, verify RED)

- [X] T020 [P] [US2] Write failing unit tests for the pure drop-index helper in tests/unit/drop-index.test.ts: given a pointer Y coordinate and the midpoint Y coordinates of the lane's cards excluding the dragged card (the call site performs the exclusion, T023), return 0 above the first midpoint, i when between midpoints i-1 and i, and the list length below the last midpoint — final-index semantics, so the result is passed to the placement endpoint unchanged; an empty midpoint list (empty lane, or the dragged card is the lane's only card) returns 0 (RED — helper doesn't exist)
- [X] T021 [P] [US2] Extend tests/component/board.test.ts with failing exact-placement tests (synthetic events, stubbed `dataTransfer`): dropping a card between two cards of another lane renders it exactly between them and issues `PUT /api/tasks/:id/placement` with that exact index (US2-S1); dragging a card above the top card of its own lane reorders the lane and sends index 0 (US2-S2); dragging a lane's top card down between the two cards below it renders the lane as [second, moved, third] and sends index 1 — the downward direction that displayed-index semantics would land one slot low (quickstart scenario 7); a drop indicator is rendered at the computed insertion index (dragged card excluded) during `dragover` and removed on `drop`/`dragend` (RED)

### Implementation for User Story 2

- [X] T022 [P] [US2] Implement the pure `computeDropIndex` helper in src/client/utils/drop-index.ts (extracted per research.md R4 so it is testable without a browser) — turns T020 green
- [X] T023 [US2] Wire exact placement into src/client/components/Lane.vue and src/client/components/Board.vue: `dragover` computes the insertion index via `computeDropIndex` from the midpoints of the lane's cards excluding the dragged card and renders a drop indicator at that index, `drop` emits the exact computed index (replacing the US1 append default), and the board passes it through to the placement call unchanged (final-index semantics — exact in both directions) — turns T021 green
- [X] T024 [US2] Collect browser evidence for US2 with the browser-tester agent (drive drags per the quickstart Playwright note: `browser_drag`/`locator.dragTo`, falling back to `page.dragAndDrop` with `targetPosition` or dispatched `DragEvent`s if a between-cards drop needs finer targeting, recording which mechanism produced the evidence): quickstart.md scenarios 5–7 — cross-lane drop between two specific cards, within-lane reorder to top, and within-lane reorder downward (top card dropped between the two below it), each asserted before and after reload — saving screenshots and results to docs/evidence/move-task-between-lanes/

**Checkpoint**: User Stories 1 and 2 both work — placement is exact, visible during drag, and durable.

---

## Phase 5: User Story 3 - The rest of the app respects board placement (Priority: P3)

**Goal**: Consistency guarantees around the core interaction: creation appends predictably (server behavior already landed in T003/T007 — evidenced here), the detail view shows the lane read-only, and MCP reads mirror the board exactly.

**Independent Test**: Create a task and check where it lands; open a moved task's detail view; call the MCP board-listing tool after arranging the board — each check independent (spec US3 Independent Test).

### Tests for User Story 3 (write first, verify RED)

- [X] T025 [P] [US3] Extend tests/component/task-detail.test.ts with failing assertions: the detail view renders the task's current lane as read-only text (e.g. a moved task shows "Waiting"), and the page contains no control — no select, button, or editable input — that changes the lane (FR-009) (RED)
- [X] T026 [P] [US3] Extend tests/integration/mcp-read-tools.test.ts with failing assertions: arrange a board via several `PUT /api/tasks/:id/placement` calls (cross-lane and reorder), then an authenticated in-process MCP client's `list-board` returns the same lane membership and the same `(position, id)` top-to-bottom order per lane as `GET /api/board` (FR-010/SC-005); each task summary in `list-board`, `get-task`, and `create-task` structured output includes `position`; `create-task` over MCP appends at the bottom of the first configured lane (RED — specifically the `position`-field assertions, absent from structured outputs until T027; the lane-order mirror assertions already pass once Phase 2's T008 lands, so verify the position assertions are the failing portion)

### Implementation for User Story 3

- [X] T027 [P] [US3] Add `position: z.number()` to `taskSummarySchema` in src/server/mcp/tools.ts and include `position` in the structured outputs of `list-board`, `get-task`, and `create-task` (contracts/mcp-tools.md — additive only, no new tools, no input changes) — turns T026 green; lane ordering itself needs no MCP change because `list-board` already flows through `listTasksByLane`
- [X] T028 [P] [US3] Render the task's lane as read-only text in src/client/pages/TaskDetailPage.vue (e.g. a "Lane: Waiting" line near the title) using the `lane` already returned by `GET /api/tasks/:id`, with no control to change it — turns T025 green
- [X] T029 [US3] Collect browser evidence for US3 with the browser-tester agent: quickstart.md scenarios 8–10 — creating "Send invites" appends it at the bottom of an arranged To Do; a card moved to Waiting shows "Waiting" read-only on its detail page with no lane control; the MCP mirror check comparing the arranged UI against `curl http://localhost:3008/api/board` plus the authenticated `list-board` equivalence from T026 — saving screenshots and results to docs/evidence/move-task-between-lanes/

**Checkpoint**: All three user stories are independently functional and evidenced.

---

## Phase 6: Polish & Verification

**Purpose**: Final gates and independent confirmation per the constitution's Definition of Done.

- [X] T030 Run the full quickstart.md validation at the repository root: `npm test` and `npm run lint && npm run typecheck && npm run build` all green, and confirm the quickstart's suite-to-criteria mapping holds (placement contract in tests/integration/tasks.test.ts, ordering in tests/integration/board.test.ts, MCP mirror in tests/integration/mcp-read-tools.test.ts, drag/revert in tests/component/board.test.ts + tests/unit/drop-index.test.ts, read-only lane in tests/component/task-detail.test.ts)
- [X] T031 Run the verifier agent to independently confirm every acceptance scenario in spec.md has both a passing automated check and browser evidence in docs/evidence/move-task-between-lanes/, without trusting builder summaries — including explicit absence checks: the board offers no move mechanism besides drag-and-drop (no menus, buttons, or keyboard moves — FR-012) and no lane gets special styling or behavior (FR-011); fix anything it flags and re-verify before reporting the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run first.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories — the NOT NULL `position` column, squashed baseline, ordered reads, and creation-append must land together (T002–T009 green at T010) before any story work.
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP, including the complete server placement contract.
- **User Story 2 (Phase 4)**: Depends on Foundational and on US1's endpoint (T014–T015) and drag wiring (T016–T018) — it refines the drop index the US1 client already sends.
- **User Story 3 (Phase 5)**: Depends on Foundational; T026 also uses US1's placement endpoint (T015) to arrange the board it asserts against. Independent of US2.
- **Polish (Phase 6)**: Depends on all three story phases.

### Within Each User Story

- Test tasks are written first and verified RED before their implementation tasks (constitution Principle II).
- Services before routes (T014 → T015); child components before board wiring (T016/T017 → T018); pure helper before its consumer (T022 → T023).
- Browser-evidence tasks (T019, T024, T029) close each story phase.

### Parallel Opportunities

- Phase 2: T002 ∥ T003 (different test files); T006 in parallel with T004/T005.
- Phase 3: T012 ∥ T013 after T011 exists (three different test files); T016 ∥ T017 (different components).
- Phase 4: T020 ∥ T021 (different test files); T022 in parallel with T021.
- Phase 5: T025 ∥ T026 (different test files); T027 ∥ T028 (server vs client files).
- US2 (Phase 4) and US3 (Phase 5) are mutually independent and can proceed in parallel once US1 is done.

---

## Parallel Example: User Story 1

```text
# After T011 (endpoint tests) is written, launch the component test tasks together:
Task: "T012 — failing board drag/optimistic/revert component tests in tests/component/board.test.ts"
Task: "T013 — failing draggable/dragstart assertions in tests/component/task-card.test.ts"

# After tests are RED and T014/T015 are green, launch the drag-source/drop-target implementations together:
Task: "T016 — TaskCard.vue drag source"
Task: "T017 — Lane.vue drop target"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline green) → Phase 2 (position column, squashed baseline, ordered reads, creation-append — suite green at T010).
2. Phase 3: full placement contract server-side, drag-and-drop between lanes client-side, optimistic save with visible revert.
3. **STOP and VALIDATE**: US1 independent test + T019 browser evidence. The board is already a working tool here.

### Incremental Delivery

1. Add US2 (exact drop placement + reorder + indicator) → validate with T024 evidence.
2. Add US3 (read-only detail lane, MCP `position` + mirror) → validate with T029 evidence.
3. Phase 6 gates and verifier confirmation → PR per the constitution (Conventional Commits, one slice on `008-move-task-between-lanes`).

---

## Notes

- Total: 31 tasks (Setup 1, Foundational 9, US1 9, US2 5, US3 5, Polish 2).
- [P] = different files with no dependency on an incomplete task; same-file work (e.g. T014/T015 feeding tests/integration/tasks.test.ts expectations, T017 vs T023 on Lane.vue) stays sequential.
- The dev database must be reset once (T005) — the squashed baseline will not migrate an old dev DB (quickstart.md Prerequisites).
- Commit after each task or logical group with Conventional Commits; every phase checkpoint should leave lint/typecheck/test/build green for the Stop-hook gate.
