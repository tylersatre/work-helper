# Tasks: Move Task from Detail View

**Input**: Design documents from `/specs/023-move-task-detail-view/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: TDD is mandatory (constitution Principle II) — every implementation task is preceded by a failing-test task. Tests must be written and observed failing before the corresponding implementation task begins.

**Organization**: Tasks are grouped by user story, in priority order. US1 (P1, the pill control itself) is the MVP. US2 (P2, MCP visibility) adds no new code — its test proves, by construction, that the pill control reuses the existing `moveTask()` path (research D7, FR-009), so it's ordered after US1's implementation lands. There is no Foundational phase: the one shared read-model change (`lanes` on `TaskDetail`) is consumed only by US1's frontend (data-model.md), so it lives in US1's phase rather than blocking both stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Path Conventions

Single TypeScript project at repo root: `src/shared/`, `src/server/routes/`, `src/client/pages/`, `tests/integration/`, `tests/component/` (per plan.md Project Structure).

---

## Phase 1: Setup

**Purpose**: Confirm the worktree starts from a green baseline so every later red test is attributable to this feature.

- [X] T001 Verify green baseline in the worktree: run `npm run lint && npm run typecheck && npm test && npm run build` and confirm all pass before any feature work

---

## Phase 2: User Story 1 - Move a card's lane from its detail view (Priority: P1) 🎯 MVP

**Goal**: The task detail view renders all configured lanes as an ordered row of pills under the title, the current lane marked and non-interactive, every other pill clickable to move the card there immediately (bottom of the destination lane, no confirmation), with the row updating on success and showing an inline error while keeping the last-saved lane on failure.

**Independent Test**: Open a card's detail view, click a non-current lane pill, confirm the card moved on the board and the pill row updated — independent of any other feature.

### Tests for User Story 1 (write first, observe failing)

- [X] T002 [P] [US1] Create tests/integration/task-detail-lane-move.test.ts with a failing test that `GET /api/tasks/:id` (via `app.inject()`, following the `buildApp({ db, lanes: LANES })` pattern in tests/integration/tasks.test.ts) returns a `lanes` field equal to the configured lane list in configured order, regardless of which lanes currently hold tasks (FR-001; data-model.md D1; contracts/http-api.md). Observe failing (the field doesn't exist yet)
- [X] T003 [P] [US1] In tests/component/task-detail.test.ts, replace the existing "renders the task lane as read-only text and offers no control to change it (FR-009)" test (lines 51-70) with failing tests that: (a) render a row of pills for every lane in `task.lanes`, in order, directly under the title with no section header, the current lane's pill visually marked and rendered as a disabled control that fires no `fetch` call when clicked (FR-001, FR-002); (b) clicking a non-current pill calls `fetch('/api/tasks/1/placement', { method: 'PUT', body: JSON.stringify({ lane: <clicked lane>, index: Number.MAX_SAFE_INTEGER }) })` (data-model.md D2) and, on a successful response, updates `task.value` so the clicked pill becomes marked current and the prior current pill becomes clickable again (FR-003, FR-005); (c) on a failed response (`ok: false`), the pill row keeps showing the task's last-saved lane as current and an inline `role="alert"` error message appears, mirroring the existing `tagError` precedent in this file (research D3; spec edge case 2); (d) when a second click fires before the first click's response resolves, only the response matching the most recently issued request is applied to `task.value` (research D4; spec edge case 3). Observe failing (no pill markup exists yet — only `<p data-testid="task-lane">`)

### Implementation for User Story 1

- [X] T004 [P] [US1] Add `lanes: string[]` to the `TaskDetail` interface in src/shared/types.ts (data-model.md D1)
- [X] T005 [US1] In src/server/routes/tasks.ts, change the `GET /api/tasks/:id` handler to return `{ ...task, lanes: app.lanes }`, mirroring the existing `lanes: app.lanes.map(...)` pattern in src/server/routes/board.ts. Run T002 and confirm it passes
- [X] T006 [US1] In src/client/pages/TaskDetailPage.vue, replace `<p class="task-lane" data-testid="task-lane">Lane: {{ task.lane }}</p>` with a row of pill buttons derived from `task.lanes`/`task.lane` (data-model.md "Client-side derived state"): the current-lane pill is `disabled`, styled with the link-blue-tint "current" convention already used by `ContactEntryList.vue`'s `.contact-entry-primary` marker (`background: rgba(59, 130, 246, 0.2)`-family tint, `--wh-link-hover` text — research D5); every other pill is an enabled button styled like `.contact-entry-row`/`.person-row` (`background: var(--wh-surface); border: 1px solid var(--wh-border-subtle);`) that on click calls `PUT /api/tasks/:id/placement` with `{ lane: <pill's lane>, index: Number.MAX_SAFE_INTEGER }`, tracks the latest issued request so a stale response is discarded (research D4), applies `task.value` from a successful response, and on failure sets an inline `role="alert"` error message below the pill row without changing `task.value` (research D3). Run T003 and confirm it passes

**Checkpoint**: User Story 1 is fully functional and testable independently — a card's lane can be changed from its detail view, the row reflects the move, reload persists it, and failures degrade safely.

---

## Phase 3: User Story 2 - Moves made here are visible to agents (Priority: P2)

**Goal**: A move made via the detail view's lane pills is indistinguishable, through the existing MCP `list-board` tool, from a move made by dragging on the board.

**Independent Test**: Move a card via the detail view's lane pills, then call the existing MCP board-listing tool and confirm the card appears under its new lane.

### Tests for User Story 2 (write first, observe failing)

- [X] T007 [US2] Append a failing test to tests/integration/task-detail-lane-move.test.ts (created in T002) that seeds a board (following the `seedBoard`/`boardOrderViaListBoard` helper pattern in tests/integration/mcp-move-tools.test.ts, including a real MCP `Client` over `StreamableHTTPClientTransport`), moves a task via `PUT /api/tasks/:id/placement` with the exact request shape the pill row sends (`{ lane: <target>, index: Number.MAX_SAFE_INTEGER }`), and asserts the MCP `list-board` tool shows that task under the new lane at the bottom, with no discrepancy from `GET /api/board` (FR-004, FR-006, FR-008, FR-009). This depends on T002 having created the file first, so land it after T002

### Implementation for User Story 2

- [X] T008 [US2] Run T007. It should pass without any new implementation — `PUT /api/tasks/:id/placement` and the `list-board` MCP tool are both untouched by T004-T006 and already funnel through the same `moveTask()` service call (research D7). If it fails, the defect is in T004-T006, not a missing US2 feature — fix there until T007 passes with T002/T003 still green

**Checkpoint**: Both user stories complete — the pill control works end-to-end and every move it makes is visible to MCP clients with no discrepancy.

---

## Phase 4: Polish & Definition of Done

**Purpose**: Regression check on the reused endpoint, full verification gate, and the evidence the constitution requires before the feature is reported done.

- [X] T009 [P] Run `npx vitest run tests/integration/tasks.test.ts` and confirm the reused placement endpoint's existing "clamps an index past the end of the destination lane to append" behavior is unaffected by T005 (quickstart.md "Existing placement behavior, unchanged")
- [X] T010 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` and record passing output (quickstart.md "Full gate")
- [X] T011 Dispatch the `browser-tester` agent against the dev server (`npm run dev`, API 3023 / UI 5123) to walk quickstart.md's manual scenario steps 1-7 (pill row renders in order with no header; click moves immediately with no confirmation; board shows bottom-of-lane landing; clicking the current pill is a no-op; a non-adjacent move in one click; moving into an empty lane; state survives reload) and capture screenshot evidence for User Story 1's acceptance scenarios and edge case 1 in docs/evidence/023-move-task-detail-view/
- [X] T012 Dispatch the `verifier` agent to independently confirm every acceptance criterion has a passing automated check plus surface-appropriate evidence (browser-tester evidence for User Story 1, recorded `tests/integration/task-detail-lane-move.test.ts` output for User Story 2) before reporting the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **User Story 1 (Phase 2)**: Depends on T001. T002 and T003 can be written in parallel (different files). T004 (types.ts) has no dependency and can run alongside T002/T003. T005 depends on T004 (route handler references the widened `TaskDetail` shape) and makes T002 pass. T006 depends on T003 being written (TDD) and on T004/T005 (the page needs a real `lanes` field to be meaningful end-to-end) and makes T003 pass.
- **User Story 2 (Phase 3)**: Depends on T002 (same file, T007 is appended after it) and on T005/T006 (there must be a real move path to assert against). Independent of T003/T004's UI specifics beyond the request shape they establish.
- **Polish (Phase 4)**: T009 anytime after T005. T010 after all user story phases. T011 after T010. T012 last.

### Within Each User Story

- Failing tests are written and observed failing before their implementation task (constitution Principle II — code written before its failing test is discarded, not retrofitted).
- Shared type (T004) before the route handler that relies on it (T005).

### Parallel Opportunities

- T002 + T003 + T004 (three different files, no dependencies between them) can all be written/started together.
- T009 can run in parallel with T011's dev-server session (different processes).

---

## Parallel Example: User Story 1

```bash
# Launch the two failing-test tasks and the shared-type task together:
Task: "Create tests/integration/task-detail-lane-move.test.ts with a failing lanes-field test"
Task: "Replace the FR-009 read-only-lane test in tests/component/task-detail.test.ts with failing pill tests"
Task: "Add lanes: string[] to TaskDetail in src/shared/types.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: User Story 1 — the lane-pill control, fully working in the UI.
3. **STOP and VALIDATE**: Open a card's detail view, click pills, confirm moves land and persist.

### Incremental Delivery

1. Setup → baseline confirmed.
2. User Story 1 → the pill control ships (MVP) — Tyler can move a card without leaving the detail view.
3. User Story 2 → proves, by construction, that those moves are indistinguishable from any other move to MCP clients.
4. Polish → regression check, full gate, browser evidence, verifier sign-off, then PR.

Each checkpoint leaves the suite green and the branch shippable; commit after each task or logical red→green pair (Conventional Commits).
