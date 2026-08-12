# Tasks: MCP Move Tasks

**Input**: Design documents from `/specs/021-mcp-move-tasks/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, quickstart.md

**Tests**: TDD is mandatory (constitution Principle II) — every implementation task is preceded by a failing-test task. Tests must be run and observed failing before the corresponding implementation task begins.

**Organization**: Tasks are grouped by user story. US4 (P1) is sequenced after US1–US3 only because its acceptance scenarios exercise both tools' error paths; its move-only tasks (T013, T015 partial) need nothing beyond US1, so an MVP cut of US1 + move-error handling is possible — see Implementation Strategy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

## Path Conventions

Single TypeScript project at repo root: `src/server/`, `tests/integration/` (per plan.md Structure Decision).

---

## Phase 1: Setup

**Purpose**: Confirm the worktree starts from a green baseline so every later red test is attributable to this feature.

- [X] T001 Verify green baseline in the worktree: run `npm run lint && npm run typecheck && npm test && npm run build` and confirm all pass before any feature work

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test infrastructure every user story's integration tests build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Create tests/integration/mcp-move-tools.test.ts scaffold following the tests/integration/mcp-capture-tools.test.ts pattern (real Fastify app on ephemeral port, `:memory:` SQLite, stub identity provider, real `@modelcontextprotocol/sdk` client over StreamableHTTP), plus two shared helpers: a board-seeding helper that inserts titled cards into named lanes in a given order, and a dual-surface assertion helper that reads lane orders through both the `list-board` MCP tool and `GET /api/board` (the web app's data source) and asserts they match an expected `{lane: [titles top-to-bottom]}` shape (FR-012)

**Checkpoint**: Harness compiles and connects (an empty describe block or trivial smoke assertion passes) — user story tests can now be written.

---

## Phase 3: User Story 1 - Agent moves a card to another lane (Priority: P1) 🎯 MVP

**Goal**: A new `move-task` MCP tool moves an existing card to a configured lane; with no position given the card lands at the bottom, visible identically via `list-board` and the web app's data source.

**Independent Test**: Seed a board, call `move-task` with a destination lane and no position, confirm the card is at the bottom of that lane (and nowhere else) through both surfaces.

### Tests for User Story 1 (write first, observe failing)

- [X] T003 [P] [US1] Failing integration test for US1-AS1 in tests/integration/mcp-move-tools.test.ts: seed To Do = ["Follow up with Sam"], In Progress = ["Write proposal", "Review budget"]; call `move-task` with the card's id, lane "In Progress", no position; assert In Progress = ["Write proposal", "Review budget", "Follow up with Sam"] top-to-bottom, To Do is empty, and both surfaces agree (FR-001, FR-002, FR-006, FR-012)
- [X] T004 [P] [US1] Failing integration test (edge case) in tests/integration/mcp-move-tools.test.ts: move a card to the lane it is already in with no position → lands at the bottom of that lane, consistent with the "no position → bottom of destination lane" rule

### Implementation for User Story 1

- [X] T005 [US1] Implement the `move-task` tool in src/server/mcp/tools.ts per contracts/mcp-tools.md: `registerTool` with inputSchema `{ taskId: z.number().int().positive(), lane: z.string(), position: z.number().int().min(1).optional() }`; map input to the existing `moveTask(db, lanes, taskId, targetLane, targetIndex)` service with `targetIndex = position - 1`, omitted position → `Number.MAX_SAFE_INTEGER` (service clamp → bottom); on success return `structuredContent` `{ ...taskSummary, landedPosition: task.position + 1 }` and text `Moved task "<title>" to lane "<lane>" at position <landedPosition>.`; route service failures through the existing `toolError()` helper (exact messages pinned in US4). Run T003/T004 and confirm they pass.

**Checkpoint**: `move-task` works for the default-position case — the core conversational loop ("I finished the proposal" → card moves) is functional.

---

## Phase 4: User Story 2 - Agent positions a card precisely (Priority: P2)

**Goal**: `move-task` honors explicit 1-based positions — cross-lane, within-lane reorder, and past-the-end clamping with truthful `landedPosition` reporting.

**Independent Test**: Seed ordered lanes, call `move-task` with mid-lane, position-1, and past-the-end positions, confirm exact resulting orders via both surfaces.

### Tests for User Story 2 (write first, observe failing)

- [X] T006 [P] [US2] Failing integration tests for US2-AS1 and US2-AS2 in tests/integration/mcp-move-tools.test.ts: (a) cross-lane to position 2 — seed To Do = ["Draft Q3 goals"], In Progress = ["Write proposal", "Review budget"]; move "Draft Q3 goals" to In Progress position 2; assert In Progress = ["Write proposal", "Draft Q3 goals", "Review budget"]; (b) within-lane to position 1 — seed To Do = ["Book venue", "Order catering", "Send invites"]; move "Send invites" within To Do to position 1; assert To Do = ["Send invites", "Book venue", "Order catering"]; both asserted through both surfaces (FR-003, FR-004)
- [X] T007 [P] [US2] Failing integration tests for clamping and boundary edges in tests/integration/mcp-move-tools.test.ts: (a) US2-AS3 — seed Waiting = ["Chase invoice", "Await contract", "Ping vendor"]; move "Chase invoice" to Waiting position 10; assert success, Waiting = ["Await contract", "Ping vendor", "Chase invoice"], and the response's `landedPosition` is 3 (FR-005); (b) within-lane move to the card's current position → success, order unchanged, response reports the unchanged 1-based position; (c) position 0, negative, and non-integer → rejected at the tool boundary (SDK-level Zod invalid-params), board unchanged

### Implementation for User Story 2

- [X] T008 [US2] Verify the T005 implementation in src/server/mcp/tools.ts satisfies T006/T007 (clamping via the service, `landedPosition` from the returned row, `z.number().int().min(1)` boundary rejection); fix any gaps until T006/T007 pass with T003/T004 still green

**Checkpoint**: Full parity with the UI drag — lane moves and within-lane reordering with truthful position reporting.

---

## Phase 5: User Story 3 - Agent creates a task in a chosen lane (Priority: P3)

**Goal**: `create-task` accepts an optional `lane`; when given, the card is created at the bottom of that lane; when omitted, behavior is byte-identical to today (bottom of the first configured lane).

**Independent Test**: Call `create-task` with and without `lane`, confirm lane and bottom placement via both surfaces.

### Tests for User Story 3 (write first, observe failing)

- [X] T009 [P] [US3] Failing service-level tests in tests/integration/tasks.test.ts for the extended `createTask` in src/server/services/tasks.ts: (a) explicit valid lane → row created at bottom of that lane (max position + 1); (b) omitted lane → bottom of `lanes[0]`, unchanged from today; (c) unconfigured lane → `invalid-lane` failure before any insert, zero rows written (FR-009, FR-010, FR-011, FR-014)

### Implementation for User Story 3

- [X] T010 [US3] Extend `createTask` in src/server/services/tasks.ts with an optional target lane (per research.md R4): validate the lane against `lanes` before any insert; omitted lane → `lanes[0]`; existing max-position query parameterized on the target lane; note handling unchanged. REST route and UI callers unchanged. Run T009 and confirm it passes.
- [X] T011 [US3] Failing MCP integration tests in tests/integration/mcp-capture-tools.test.ts: (a) US3-AS1 — seed Waiting = ["Chase invoice", "Await contract"]; call `create-task` with title "Confirm venue hold" and lane "Waiting"; assert Waiting = ["Chase invoice", "Await contract", "Confirm venue hold"] through both `list-board` and `GET /api/board`; (b) US3-AS2 — seed To Do = ["Book venue", "Order catering"]; call `create-task` with title "Send invites" and no lane; assert To Do = ["Book venue", "Order catering", "Send invites"] and the success result shape/text is unchanged from today
- [X] T012 [US3] Add `lane: z.string().optional()` to the `create-task` tool inputSchema in src/server/mcp/tools.ts, pass it through to the extended `createTask`, and update the tool description to "Creates a task at the bottom of the given lane (or the first configured lane when no lane is given), optionally with an initial note." Run T011 and confirm it passes.

**Checkpoint**: Agents can file new work directly into the right lane; existing no-lane creation is provably unchanged.

---

## Phase 6: User Story 4 - Invalid input leaves the board untouched (Priority: P1)

**Goal**: Both tools reject bad input with the exact contracted messages — lane errors name the valid lanes, unknown ids say the task was not found — and the board is byte-for-byte unchanged after every failure.

**Independent Test**: Call `move-task` and `create-task` with an unconfigured lane and `move-task` with a nonexistent id; confirm the error messages and that a full board snapshot taken before each call is identical after it.

**Note**: T013 depends only on US1 (T005); T014 depends on US3 (T012). See Implementation Strategy for the MVP cut.

### Tests for User Story 4 (write first, observe failing)

- [ ] T013 [P] [US4] Failing integration tests for move-tool errors in tests/integration/mcp-move-tools.test.ts: (a) US4-AS1 — `move-task` with lane "Doing" → result has `isError: true` with message exactly `Unknown lane "Doing". Valid lanes: To Do, In Progress, Waiting, Done`, and the full board state (all lanes, all orders, via both surfaces) is identical to a snapshot taken before the call; (b) US4-AS2 — `move-task` with a `taskId` matching no task → `isError: true` with message `Task <taskId> not found`, board snapshot unchanged (FR-007, FR-008, FR-014); (c) auth gate — a `move-task` call without valid authentication (following the tests/integration/mcp-forged-identity.test.ts / mcp-connect.test.ts rejection pattern) is rejected before the tool handler runs and the board snapshot is unchanged (FR-013, spec edge case "Unauthenticated or unauthorized MCP calls")
- [ ] T014 [P] [US4] Failing integration test for US4-AS3 in tests/integration/mcp-capture-tools.test.ts: `create-task` with title "Book venue" and lane "Doing" → `isError: true` with message `Unknown lane "Doing". Valid lanes: To Do, In Progress, Waiting, Done`, and no card with that title exists in any lane afterward — board snapshot unchanged (FR-011, FR-014)

### Implementation for User Story 4

- [ ] T015 [US4] Implement exact error formatting in src/server/mcp/tools.ts for both tools per research.md R5: on `invalid-lane` return `Unknown lane "<given>". Valid lanes: <context.lanes joined with ", ">` built from live config at call time (never hardcoded); on `task-not-found` return `Task <id> not found` matching the existing `get-task`/`add-note` phrasing; all via `toolError()` (`isError: true` result, not a protocol error). Run T013/T014 and confirm they pass with all earlier tests still green.

**Checkpoint**: All four stories complete — happy paths, precise positioning, lane-aware creation, and strict no-partial-effect validation.

---

## Phase 7: Polish & Definition of Done

**Purpose**: Full verification gate, quickstart validation, and the evidence the constitution requires before the feature is reported done.

- [ ] T016 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` and record passing output (quickstart.md §1)
- [ ] T017 Run the targeted suite `npx vitest run tests/integration/mcp-move-tools.test.ts` and confirm every quickstart.md §2 expected outcome is pinned by a passing test; record output as automated-check evidence for the MCP-only criteria
- [ ] T018 Dispatch the `browser-tester` agent against the dev server (`npm run dev`, API 3021 / UI 5121) to capture web-app-visibility evidence for the "after a page reload" clauses of US1–US3 and SC-004 (MCP-driven move and lane-aware create visible on the web board after reload), stored in docs/evidence/021-mcp-move-tasks/
- [ ] T019 Dispatch the `verifier` agent to independently confirm every acceptance criterion has a passing automated check plus surface-appropriate evidence (browser evidence for UI-facing criteria, recorded test output for MCP-only criteria) before reporting the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on T001. Blocks all user stories.
- **US1 (Phase 3)**: Depends on T002.
- **US2 (Phase 4)**: Depends on US1 (T005) — refines the same tool.
- **US3 (Phase 5)**: Depends on T002 only — independent of US1/US2 (different service function and tool). Can run in parallel with Phases 3–4 if desired.
- **US4 (Phase 6)**: T013 depends on US1 (T005); T014 depends on US3 (T012); T015 depends on T013 + T014.
- **Polish (Phase 7)**: Depends on all user stories complete; T018 before T019 (verifier confirms the evidence).

### Within Each User Story

- Failing tests are written and observed failing before their implementation task (constitution Principle II — code written before its failing test is discarded, not retrofitted).
- Service changes (T010) before tool changes (T012).

### Parallel Opportunities

- T003 + T004 (independent test cases, same new file — write together or in either order).
- T006 + T007 can be written in parallel once US1 is green.
- Phase 5 (US3: T009–T012, files tasks.ts / tasks.test.ts / mcp-capture-tools.test.ts) can proceed in parallel with Phases 3–4 (US1/US2: mcp-move-tools.test.ts + the move-task tool) — disjoint test files; both touch src/server/mcp/tools.ts but in separate tool registrations.
- T013 + T014 (different test files) in parallel once their prerequisites are green.

---

## Implementation Strategy

### MVP First

1. Phases 1–2 (baseline + harness), then Phase 3 (US1).
2. For a safety-complete MVP, additionally run T013 and the move-tool half of T015 — US1's tool then has both the happy path and strict validation, needing nothing from US2/US3.
3. Validate: `npx vitest run tests/integration/mcp-move-tools.test.ts`.

### Incremental Delivery

1. US1 → agents can move cards (core value).
2. US2 → precise positioning (full drag parity).
3. US3 → lane-aware creation.
4. US4 → exact error contracts pinned across both tools.
5. Phase 7 → gate, evidence, verifier — then PR.

Each checkpoint leaves the suite green and the branch shippable; commit after each task or logical red→green pair (Conventional Commits).
