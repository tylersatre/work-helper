# Tasks: task-fields

**Input**: Design documents from `/specs/030-task-fields/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Test tasks are **mandatory** in this repo — Constitution II (Test-First, NON-NEGOTIABLE) requires a failing test before the code that makes it pass. Every implementation task below is preceded by the failing test that drives it; code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demonstrated independently, following exactly the ordering `plan.md`'s "Design notes carried into `/speckit-tasks`" lays out: Foundation (schema → shared types/validation → client date utils → `createTask`/`updateTask` service layer → HTTP routes) unblocks everything, then US1 (P1, create-time fields), then US2 (P2, detail-view editing + card badge), then US3 (P3, MCP parity).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Every task names its exact file path

## Path Conventions

Single-package web app per plan.md: `src/client`, `src/server`, `src/shared`, tests split `tests/unit`, `tests/integration`, `tests/component`. All paths are repository-root relative.

**One schema change, one migration** — four new nullable columns on `tasks` (`due_date text`, `priority text`, `effort text`, `description text`), a single non-destructive `ALTER TABLE ADD` × 4 (data-model.md, research.md R1), expected as `drizzle/0007_<generated-name>.sql` (next after `0006_silky_the_renegades.sql`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the worktree is ready; no project initialization is needed (existing repo, existing tooling, no new dependency).

- [X] T001 Verify the worktree baseline is green before any change by running `npm run lint && npm run typecheck && npm test && npm run build` from the repository root, recording that the suite passes on branch `030-task-fields` (so later failures are provably this feature's)
- [X] T002 [P] Create the evidence directory `docs/evidence/task-fields/` with a `.gitkeep` so browser and MCP evidence has a home (Constitution III)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The four columns, migration, shared types/validation, client date utils, and the `createTask`/`updateTask` service + HTTP route pair every user story depends on. This is entirely server + shared-layer + client-utils work; no Vue component or MCP tool is touched yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Write a failing test in `tests/integration/migration-upgrade.test.ts` — a new `it('applies 0007 (task-fields columns) to a pre-existing baseline-only database without losing data, and converges with a fresh-DB schema', ...)` inside the existing `describe` block, following the exact shape of the `0006` case immediately above it: build a baseline-only DB via `buildBaselineOnlyMigrationsFolder()`, insert one pre-existing `tasks` row via raw SQL, upgrade in place via `createDb(dbPath)`, assert the row survived, assert `due_date`/`priority`/`effort`/`description` are `NULL` on that pre-existing row, and assert `tableInfo(upgradedSqlite, 'tasks')` equals `tableInfo(freshSqlite, 'tasks')` for a fresh `:memory:` DB. Confirm the test FAILS (the columns don't exist yet)
- [X] T004 Add `dueDate: text('due_date')`, `priority: text('priority', { enum: ['Low', 'Medium', 'High', 'Urgent'] })`, `effort: text('effort', { enum: ['S', 'M', 'L', 'XL'] })`, `description: text('description')` to the `tasks` table in `src/server/db/schema.ts` per data-model.md — none `.notNull()`, none with a default
- [X] T005 Generate the migration with `npx drizzle-kit generate`, inspect the output before committing (CLAUDE.md's migration rule) to confirm it is four non-destructive `ALTER TABLE tasks ADD <column> text` statements with no table rebuild (research.md R1) — expected to land as `drizzle/0007_<generated-name>.sql`; hand-adjust and flag to Tyler only if drizzle-kit proposes anything lossier. Makes T003 pass
- [X] T006 [P] Add `export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent'`, `export type TaskEffort = 'S' | 'M' | 'L' | 'XL'`, and `dueDate: string | null`, `priority: TaskPriority | null`, `effort: TaskEffort | null`, `description: string | null` to the `Task` interface in `src/shared/types.ts` per data-model.md, letting `BoardTask`/`TaskDetail` inherit them with no further edits to those interfaces
- [X] T007 [P] Write a failing unit test in `tests/unit/validation.test.ts` for `taskPrioritySchema`/`taskEffortSchema`: each of `'Low'`/`'Medium'`/`'High'`/`'Urgent'` and `'S'`/`'M'`/`'L'`/`'XL'` respectively parses successfully; an out-of-range value (e.g. `'Critical'`, `'XXL'`, `''`, lowercase `'low'`) fails `.safeParse`. Confirm the test FAILS (the schemas don't exist yet — import error)
- [X] T008 Add `export const taskPriorityValues = ['Low', 'Medium', 'High', 'Urgent'] as const`, `export const taskEffortValues = ['S', 'M', 'L', 'XL'] as const`, `export const taskPrioritySchema = z.enum(taskPriorityValues)`, `export const taskEffortSchema = z.enum(taskEffortValues)` to `src/shared/validation.ts` per data-model.md. Makes T007 pass
- [X] T009 [P] Write a failing unit test in `tests/unit/time.test.ts` for two new exports from `src/client/utils/time.ts`: `parseLocalDate('YYYY-MM-DD'): number` returns the correct local-midnight epoch ms for a well-formed date (mirroring `SyncPage.vue`'s existing local `parseLocalDate`, now promoted to a shared util per research.md R2's alternatives-considered discussion); `formatDueDate('YYYY-MM-DD'): string` returns a nice display string (e.g. `'2026-08-20'` → `'Aug 20, 2026'`) for a well-formed date and falls back to returning the raw input string unchanged when it doesn't parse as a valid date (research.md R2's graceful-degradation requirement for malformed MCP-supplied values). Confirm the test FAILS (the exports don't exist yet)
- [X] T010 Add `parseLocalDate` and `formatDueDate` to `src/client/utils/time.ts` per research.md R2 (and add any small additional local helper the picker components need for the reverse epoch→`'YYYY-MM-DD'` conversion when submitting a date picker's value — mirroring `SyncPage.vue`'s own `formatLocalDate`; keep it in `time.ts` only if it turns out to be reused by more than one component, otherwise a component-local helper is fine). Makes T009 pass
- [X] T011 [P] Write failing integration tests in `tests/integration/tasks.test.ts` (new `describe('createTask fields (030-task-fields)', ...)` block, alongside the existing `describe('createTask lane targeting (US3)', ...)`) for `createTask`'s new optional `rawFields` parameter per data-model.md: creating with all four fields set (`{ dueDate: '2026-09-05', priority: 'High', effort: 'L', description: '**Urgent**' }`) stores exactly those values on the inserted row; creating with `rawFields` omitted, or with each key individually blank/whitespace, leaves all four columns `null` (FR-003); creating with an invalid `priority`/`effort` value throws (mirroring `titleSchema.parse`'s existing throw-on-invalid behavior, since `createTask` validates via `taskPrioritySchema`/`taskEffortSchema` per data-model.md). Confirm the tests FAIL (the parameter doesn't exist yet)
- [X] T012 Add the optional 6th parameter `rawFields?: { dueDate?: unknown; priority?: unknown; effort?: unknown; description?: unknown }` to `createTask` in `src/server/services/tasks.ts` per data-model.md: each present, non-blank key is validated (`priority`/`effort` via `taskPrioritySchema`/`taskEffortSchema`, `dueDate`/`description` accepted as-is per research.md R2) and stored on the inserted row; an omitted or blank key leaves that column `null`. Makes T011 pass
- [X] T013 Write failing integration tests in `tests/integration/tasks.test.ts`, replacing the existing `describe('updateTaskTitle (service)', ...)` block with `describe('updateTask (service)', ...)` per data-model.md's `UpdateTaskInput`/`UpdateTaskResult` shape: renaming via `{ title }` still works exactly as `updateTaskTitle` did (valid rename; empty/whitespace title → `{ ok: false, error: 'invalid-title' }`; unknown id → `{ ok: false, error: 'task-not-found' }`); setting each of the four new fields fresh on a task with none set; changing an already-set field to a new value; explicitly clearing a set field via `{ <field>: null }`; a key omitted from the input object leaves that field completely unchanged; all four fields changed together in one call; a body with an invalid/empty title alongside otherwise-valid new field values rejects the *entire* call with no field changed at all — not even the valid ones (contracts/mcp-tools.md B4, data-model.md's "no partial write"). Confirm the tests FAIL (`updateTask` doesn't exist yet)
- [X] T014 In `src/server/services/tasks.ts`, replace `updateTaskTitle`/`UpdateTaskTitleResult` with `updateTask(db, taskId, input: UpdateTaskInput): UpdateTaskResult` per data-model.md's tri-state semantics (key absent → unchanged; key `null` → cleared; key present with a value → set; `priority`/`effort` are NOT re-validated here — they're assumed already-valid, gated upstream per research.md R5; `title`, when present, is still validated via `titleSchema` with the existing empty/whitespace rejection and no partial write on failure), building a single `db.update(tasks).set(patch).where(eq(tasks.id, taskId)).run()` covering only the keys actually present in `input`. Also update the MCP `update-task` tool's handler in `src/server/mcp/tools.ts` (currently `updateTaskTitle(context.db, taskId, title)`) to call `updateTask(context.db, taskId, { title })` instead, preserving its exact current behavior and inputSchema unchanged (title still required, no new fields yet — this call-site fix exists only to keep the build green after `updateTaskTitle` is removed; the tool's field-accepting extension is US3's job, T030) — the existing `describe('US4: update-task', ...)` block in `tests/integration/mcp-note-tag-task-tools.test.ts` must keep passing unmodified after this task. Makes T013 pass
- [X] T015 Write a failing integration test in `tests/integration/tasks.test.ts`, extending the existing `describe('POST /api/tasks', ...)` block, per `contracts/http-api.md`: a body with all four new keys set creates a task with those values (`201`, response row includes them); a body omitting them creates a task with all four `null`; an invalid `priority`/`effort` value returns `400 { error: { message: 'Invalid priority' } }` / `400 { error: { message: 'Invalid effort' } }` and no task is created; the existing empty-title `400 { error: { message: 'Title is required' } }` behavior is unchanged. Confirm the test FAILS (the route doesn't accept the new body keys yet)
- [X] T016 Extend `POST /api/tasks` in `src/server/routes/tasks.ts` per `contracts/http-api.md`: read `dueDate`/`priority`/`effort`/`description` off the request body and forward them into `createTask`'s new `rawFields` parameter (T012); on a `ZodError` from an invalid `priority`/`effort` value, return the field-specific message (`'Invalid priority'` / `'Invalid effort'`) rather than the existing generic `'Title is required'` catch — either by inspecting `error.issues[0]?.path[0]` or by giving `taskPrioritySchema`/`taskEffortSchema` a custom error message, implementer's choice; a title-validation `ZodError` still produces `'Title is required'` exactly as today. Makes T015 pass
- [X] T017 Write a failing integration test in `tests/integration/tasks.test.ts`, new `describe('PATCH /api/tasks/:id', ...)` block, per `contracts/http-api.md`: a body with a subset of the four keys changes only those fields, leaving omitted ones untouched and returning `200` with the full updated row; `null` on any key clears that field; a body with none of the four keys is a no-op `200` returning the current row unchanged; an unknown `:id` returns `404 { error: { message: 'Task not found' } }`; an invalid `priority`/`effort` value returns `400 { error: { message: 'Invalid priority' } }` / `400 { error: { message: 'Invalid effort' } }` with the task's existing values completely unchanged (verify via a follow-up read). Confirm the test FAILS (the route doesn't exist yet)
- [X] T018 Add `PATCH /api/tasks/:id` to `src/server/routes/tasks.ts` per `contracts/http-api.md` and data-model.md: parse the body's four optional keys, defensively `safeParse` any non-null `priority`/`effort` against `taskPrioritySchema`/`taskEffortSchema` (400 on failure, no service call), call `updateTask` (T014), 404 on `task-not-found`, 200 with the updated row on success. Makes T017 pass

**Checkpoint**: Schema, migration, shared types/validation, client date utils, `createTask`/`updateTask` service functions, and both HTTP routes exist. `GET /api/tasks/:id` and `GET /api/board` already flow all four new columns through automatically — both call sites already `db.select().from(tasks)` a full row and spread it (data-model.md), so no further server change is needed for either read path. User story implementation can now begin.

---

## Phase 3: User Story 1 - Set fields when creating a task in the UI (Priority: P1)

**Goal**: `CreateTaskForm.vue` gains four optional inputs (due date, priority, effort, description), submitted only when set, mirroring the existing `note` field's blank-is-omitted behavior.

**Independent Test**: Create a task titled "Book venue" from the board, setting all four fields in the create form, then confirm the `POST /api/tasks` request carried all four values and the created task's stored row has them (per T011/T015's coverage). Full confirmation of the acceptance scenario's second half — "opens its detail view and confirms all four values are shown" — completes once Phase 4 (US2) lands `TaskFields.vue`, which is the only place those values are rendered; this mirrors `card-archive`'s US1/US2 pairing.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they FAIL before any implementation task in this phase.

- [X] T019 [P] [US1] Extend `tests/component/create-task-form.test.ts` with failing tests per `contracts/task-fields-ui.md`: the expanded form renders a labeled due-date picker (`data-testid="create-task-due-date"`), a labeled priority select with options `Low`/`Medium`/`High`/`Urgent` (`data-testid="create-task-priority"`), a labeled effort select with options `S`/`M`/`L`/`XL` (`data-testid="create-task-effort"`), and a labeled description textarea (`data-testid="create-task-description"`), all defaulting to unset; submitting with all four filled sends them all in the `POST /api/tasks` body (`dueDate` as a plain `'YYYY-MM-DD'` string); submitting with all four left blank omits all four keys from the body entirely (mirroring the existing "omits the note from the request body when it is blank" test); on a successful submit, `reset()` clears all six inputs (title, note, and the four new ones), matching the existing collapse/reopen-blank test

### Implementation for User Story 1

- [X] T020 [US1] Add the four optional inputs to `src/client/components/CreateTaskForm.vue` per `contracts/task-fields-ui.md`: `NDatePicker` (`type="date"`, `clearable`) for due date, `NSelect` (`clearable`) populated from `taskPriorityValues`/`taskEffortValues` for priority/effort, `NInput` (`type="textarea"`, matching the existing note field's `autosize`) for description; on submit, include each in the request body only when it has a non-blank value (converting the date picker's epoch value to `'YYYY-MM-DD'` via T010's util before sending), and clear all four alongside `title`/`note` in `reset()`. Makes T019 pass

**Checkpoint**: Tasks can be created with structured fields from the UI. Full end-to-end confirmation (detail view showing what was set) lands with Phase 4.

---

## Phase 4: User Story 2 - Edit fields from the task detail view (Priority: P2)

**Goal**: A new `TaskFields.vue` component, mounted from `TaskDetail.vue`, shows and edits all four fields — due date/priority/effort as always-visible auto-saving controls, description via an Edit/Save/Cancel toggle rendering markdown — and `TaskCard.vue` gains the due-date badge on the board.

**Independent Test**: With an existing task that has no fields set, open its detail view, set a due date, and confirm it appears there and as a badge on the card face and survives a reload; clear it and confirm it disappears from both and survives a reload; repeat the change (not just set/clear) flow for priority and effort, and change the description content, confirming persistence for each.

### Tests for User Story 2 ⚠️

> Write these FIRST and confirm they FAIL before any implementation task in this phase.

- [X] T021 [P] [US2] Extend `tests/component/task-card.test.ts` with failing tests per `contracts/task-fields-ui.md`: a task with `dueDate` set renders `data-testid="due-date-badge"` containing the `formatDueDate()`-formatted text (FR-008); a task with `dueDate: null` renders no badge at all (not an empty placeholder); a task with `priority`/`effort`/`description` set renders no indicator for any of them on the card face (FR-008, Edge Cases)
- [X] T022 [US2] Add the due-date badge to `src/client/components/TaskCard.vue` per `contracts/task-fields-ui.md`: render `data-testid="due-date-badge"` with T010's `formatDueDate(task.dueDate)` when `task.dueDate !== null`, nothing otherwise; no icon, no color coding, no relative-time wording; `priority`/`effort`/`description` are present on the `task` prop but intentionally left unused here. Makes T021 pass
- [X] T023 [P] [US2] Extend `tests/component/task-detail.test.ts` with failing tests per `contracts/task-fields-ui.md` (mounted via `TaskDetailPage.vue` as the existing tests do, with `task()` payloads now including `dueDate`/`priority`/`effort`/`description`): a task with all four unset shows `"No due date"`/`"No priority"`/`"No effort"`/`"No description"` labels (`data-testid="due-date-unset"`/`"priority-unset"`/`"effort-unset"`/`"description-unset"`) each next to a control to set it (FR-004); a task with values set shows the due-date picker and priority/effort selects pre-filled with the current value; changing the due-date picker immediately issues `PATCH /api/tasks/:id` with `{ dueDate: '<YYYY-MM-DD>' }` (no confirmation) and updates the local view from the response; clearing it issues `PATCH` with `{ dueDate: null }`; changing priority/effort immediately issues `PATCH` with `{ priority: <value> }` / `{ effort: <value> }`; the unset description state shows `data-testid="description-add-button"` reading "Add description" that reveals `data-testid="description-textarea"` pre-filled empty; the set description state renders markdown (`data-testid="description-rendered"`, via `renderNoteMarkdown` — bold/italic/link/two-item bulleted list all render as formatted HTML, not raw markdown, per FR-006) next to `data-testid="description-edit-button"` reading "Edit"; clicking Edit reveals the raw-markdown textarea plus `data-testid="description-save-button"`/`"description-cancel-button"`; Save with non-blank content issues `PATCH` with `{ description: <raw textarea value> }` and returns to the rendered view; Save with blank/whitespace content issues `PATCH` with `{ description: null }`; Cancel discards the textarea edit and returns to the prior view with no request sent; a failed `PATCH` on any of the four fields surfaces inline via `role="alert"` and the control's displayed value reverts to the last-known-good server value (`contracts/http-api.md`'s UI consumption contract). Confirm the tests FAIL (`TaskFields.vue` doesn't exist / isn't mounted yet)
- [X] T024 [US2] Create `src/client/components/TaskFields.vue` per `contracts/task-fields-ui.md`'s exact props/emits contract (`taskId`, `dueDate`, `priority`, `effort`, `description` in; `update:fields` emitting the full merged field set out): due date/priority/effort each render as an always-visible, `clearable` control (`NDatePicker`/`NSelect`/`NSelect`) that immediately `PATCH`es `/api/tasks/:id` with exactly the one changed key on `update:value` (research.md R3, no confirmation step, using T010's `parseLocalDate`/`formatDueDate` for the date picker's display/round-trip); description renders rendered markdown (`renderNoteMarkdown`, same treatment as `NoteItem.vue`) with an Edit control that reveals a raw-text `NInput` textarea plus Save/Cancel (mirroring `CompanyDetailPage.vue`'s rename control exactly), Save sending `{ description: null }` when the trimmed value is empty and the raw value otherwise, Cancel discarding with no request; a `PATCH` failure on any field surfaces inline `role="alert"` and reverts that field's displayed value to the last props-provided value
- [X] T025 [US2] Mount `TaskFields.vue` from `src/client/components/TaskDetail.vue` as a new `<div class="task-detail-section">` (alongside the existing People/Companies/Emails/Notes/Tags sections), passing `task.id`/`task.dueDate`/`task.priority`/`task.effort`/`task.description`, and add an `onUpdateFields(fields)` handler that assigns the emitted fields onto `task.value` in place, mirroring the existing `onUpdatePeople`/`onUpdateCompanies`/`onUpdateNotes` pattern. Makes T023 pass

**Checkpoint**: US1 and US2 together are the coherent P1+P2 increment — a task can be created with structured fields, viewed, edited, and cleared from the detail view, and the due-date badge shows on the board, all surviving a reload.

---

## Phase 5: User Story 3 - Manage fields via MCP (Priority: P3)

**Goal**: The MCP `create-task` and `update-task` tools accept the four fields as optional (and, for `update-task`, tri-state nullable-optional) inputs; `get-task`, `list-board`, `move-task`, `archive-card`, and `unarchive-card` all report the four fields in their output.

**Independent Test**: Call the MCP `create-task` tool with all four fields set for a new task, then call `get-task` and `list-board` and confirm both return the same four values; call `update-task` to change all four fields in one call and again to clear the due date, confirming each change is reflected; call `update-task` with an invalid priority value and confirm it's rejected without changing the task.

### Tests for User Story 3 ⚠️

> Write these FIRST and confirm they FAIL before any implementation task in this phase.

- [X] T026 [P] [US3] Extend `tests/integration/mcp-read-tools.test.ts` with failing tests per `contracts/mcp-tools.md`: for a task with all four fields set, `get-task` returns all four values; `list-board` (default, no filter) returns the same four values for that task in its lane's `tasks` array; a task with all four fields unset returns `null` for each from both tools
- [X] T027 [P] [US3] Extend `tests/integration/mcp-note-tag-task-tools.test.ts` with failing tests per `contracts/mcp-tools.md`'s worked examples: `create-task` with all four fields set creates a task carrying exactly those values (verify via a follow-up `get-task`-equivalent read); `create-task` with the four fields omitted creates a task with all four `null`; `create-task` with `priority: "Critical"` (or `effort: "XXL"`) is rejected by schema validation before the handler runs, and no task is created; `update-task` with `{ taskId, priority: "Urgent", effort: "XL", dueDate: "2026-09-10", description: "Updated scope" }` changes all four fields in one call while leaving `title` untouched; a second `update-task` call with `{ taskId, dueDate: null }` clears only `dueDate`, leaving the other three (and `title`) untouched; `update-task` with `{ taskId, priority: "Critical" }` is rejected with the task's `priority` (and everything else) left unchanged; the existing rename-only behavior (`{ taskId, title: "New name" }`, and the existing empty/whitespace-title rejection cases from the `describe('US4: update-task', ...)` block) still passes with `title` now optional. Confirm the tests FAIL (the tools don't accept the new fields yet)

### Implementation for User Story 3

- [X] T028 [US3] Add `dueDate: z.string().nullable()`, `priority: z.enum(taskPriorityValues).nullable()`, `effort: z.enum(taskEffortValues).nullable()`, `description: z.string().nullable()` to the shared `taskSummarySchema` in `src/server/mcp/tools.ts`, and add the corresponding four fields (copied straight from the row) to every place that currently hand-builds a task's `structuredContent` — `taskDetailContent()`, and the `create-task`, `update-task`, `move-task`, `archive-card`, `unarchive-card` handlers' inline object literals — plus `list-board`'s per-task `.map(({ id, title, lane, position, createdAt, archived }) => ...)` destructuring, per `research.md` R7 and `contracts/mcp-tools.md`. This is purely an output-shape completion — no behavior change to what any of these tools *do*. Because `taskDetailOutputSchema` spreads `taskSummarySchema`, `get-task`'s output gains all four fields with no further schema edit. Makes the `get-task`/`list-board` half of T026 and T027 pass
- [X] T029 [US3] Extend `create-task`'s `inputSchema` in `src/server/mcp/tools.ts` with `dueDate: z.string().optional()`, `priority: z.enum(taskPriorityValues).optional()`, `effort: z.enum(taskEffortValues).optional()`, `description: z.string().optional()` per `contracts/mcp-tools.md`, and forward them into `createTask`'s `rawFields` parameter (T012). Makes the `create-task` half of T027 pass
- [X] T030 [US3] In `src/server/mcp/tools.ts`, change `update-task`'s `inputSchema` so `title` becomes `z.string().optional()` (was required) and add `dueDate: z.string().nullable().optional()`, `priority: z.enum(taskPriorityValues).nullable().optional()`, `effort: z.enum(taskEffortValues).nullable().optional()`, `description: z.string().nullable().optional()` per `contracts/mcp-tools.md`; update the handler to build the full tri-state input object (only keys actually present in the call) and pass it to `updateTask` (T014) instead of the current title-only call, keeping the existing `task-not-found`/invalid-title error handling. Makes the `update-task` half of T027 pass

**Checkpoint**: Agents have full MCP parity with the UI — create, read, and update all four fields, with enum validation rejecting invalid `priority`/`effort` values before any data changes (FR-012, SC-004).

---

## Phase 6: Polish, Evidence & Verification

**Purpose**: Cross-cutting confirmation and the evidence Constitution III requires. Nothing here changes feature behavior.

- [X] T031 Run the full gate from the repository root — `npm run lint && npm run typecheck && npm test && npm run build` — and confirm all green, including the new `0007_*` migration applying cleanly to a fresh database and no regression to existing rename (`update-task` title-only calls), archive/unarchive, lane-move, or delete behavior
- [X] T032 Seed a small board against the running dev API (`npm run dev` → API `http://localhost:3030`, UI `http://localhost:5130`, quickstart.md §2): "Book venue" with due date, priority "High", effort "L", and a markdown description containing bold, italic, a link, and a two-item bulleted list (created via the UI, exercising US1); "Draft budget" with all four fields left blank (exercising the unset-state scenarios); "Ship report" created via the MCP `create-task` tool with all four fields set (exercising US3's worked example)
- [X] T033 Dispatch the `browser-tester` agent against `http://localhost:5130` to walk US1 and US2's Given/When/Then scenarios on the seeded board and write screenshots plus results to `docs/evidence/task-fields/`, covering at minimum the shot list in quickstart.md §3: the expanded create-task form with all four new inputs filled in; the created card's detail view showing all four set values (description rendered, not raw markdown); a second task's detail view showing all four fields in their unset state with a label and control for each; the detail view after setting a due date, next to the board showing the new due-date badge on that card, both after a page reload; the detail view after clearing that due date, next to the board showing the badge gone, both after a page reload; the detail view after changing priority and effort, showing the board card face with no priority/effort indicator; the description in edit mode (raw textarea) and then saved (rendered bold/italic/link/list); two board cards side by side, one with a due-date badge and one without
- [X] T034 [P] Record the MCP-only evidence for US3 (no UI surface) with `npx vitest run tests/integration/mcp-read-tools.test.ts tests/integration/mcp-note-tag-task-tools.test.ts --reporter=verbose 2>&1 | tee docs/evidence/task-fields/mcp-task-fields.txt` (quickstart.md §4)
- [X] T035 Dispatch the `verifier` agent with `spec.md`, `quickstart.md`, and `docs/evidence/task-fields/`, confirming every FR (FR-001–FR-014) and SC (SC-001–SC-005) has both a passing automated check and surface-appropriate evidence; the verifier re-runs the checks itself rather than trusting a summary (Constitution III)
- [X] T036 Open the PR with a Conventional Commits title, calling out the single additive migration (`drizzle/0007_*.sql`, four non-destructive `ALTER TABLE ADD` statements) and that `updateTaskTitle` was replaced by `updateTask` (a behavior-preserving generalization, not a breaking change — its only caller was updated in the same change) with no regression to existing rename/archive/lane-move/delete flows, and let the Claude Code CI review run on the diff

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story** (the columns, migration, shared types/validation, client date utils, service functions, and routes are what every story is built on)
- **US1 (Phase 3)**: depends on Phase 2 only
- **US2 (Phase 4)**: depends on Phase 2 only (independent of Phase 3's `CreateTaskForm.vue` — different files); completes the "detail view shows what was set" half of US1's own acceptance scenario, so lands immediately after US1 as one coherent P1+P2 increment
- **US3 (Phase 5)**: depends on Phase 2 only (T012/T014's `createTask`/`updateTask` service functions) — **fully independent of the client phases** and can run in parallel with US1/US2 (different files: `src/server/mcp/tools.ts`, `tests/integration/mcp-*.test.ts`)
- **Polish (Phase 6)**: depends on every story phase intended for this release

### Within Each User Story

- Tests are written and confirmed FAILING before the implementation tasks in that phase (Constitution II)
- Schema/type/validation/util/service/route foundation before anything that calls it
- Story complete and checkpointed before moving to the next priority

### Parallel Opportunities

- T002 runs alongside T001
- Within Foundational, T003 (migration-upgrade test), T006 (shared types), T007 (validation test), and T009 (time.ts test) touch four different files with no dependency on each other and can be drafted together; each implementation task (T005, T008, T010) is sequential relative to its own test but independent of the others' implementation tasks
- T011/T013/T015/T017 all extend `tests/integration/tasks.test.ts` — only the first (T011) is marked `[P]` relative to the other Foundational test files; the rest are sequential accumulations onto the same file to avoid concurrent-edit conflicts
- **The largest parallel win**: once Phase 2 is done, US3 (Phase 5, server + integration tests) is disjoint from US1 (Phase 3) and US2 (Phase 4) (client + component tests) and can proceed concurrently
- Within US2, T021 (`task-card.test.ts`) and T023 (`task-detail.test.ts`) are different files and can be drafted together
- Within US3, T026 (`mcp-read-tools.test.ts`) and T027 (`mcp-note-tag-task-tools.test.ts`) are different files and can be drafted together; T028/T029/T030 all edit `src/server/mcp/tools.ts` and are sequential
- T034 (recording MCP output) is independent of T033 (browser evidence) once T031 is green

## Parallel Example: Foundational

```bash
Task: "Write a failing 0007 migration-upgrade test in tests/integration/migration-upgrade.test.ts"
Task: "Add TaskPriority/TaskEffort types and the four new Task fields to src/shared/types.ts"
Task: "Write a failing unit test for taskPrioritySchema/taskEffortSchema in tests/unit/validation.test.ts"
Task: "Write a failing unit test for parseLocalDate/formatDueDate in tests/unit/time.test.ts"
```

## Parallel Example: User Story 3 (fully independent of US1/US2)

```bash
Task: "Extend tests/integration/mcp-read-tools.test.ts with failing get-task/list-board field tests"
Task: "Extend tests/integration/mcp-note-tag-task-tools.test.ts with failing create-task/update-task field tests"

npx vitest run tests/integration/mcp-read-tools.test.ts tests/integration/mcp-note-tag-task-tools.test.ts   # expect RED before T028–T030
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T018) — **critical, blocks everything**
3. Phase 3: US1 (T019–T020)
4. Phase 4: US2 (T021–T025)
5. **STOP and VALIDATE**: create a task with all four fields set from the board, open its detail view and confirm every value renders correctly (description as formatted markdown), edit and clear each field and watch the due-date badge appear/disappear on the board, reload and confirm everything persisted — the feature's full core promise, independently demonstrable
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → columns, migration, shared types/validation, client date utils, service functions, and routes in place
2. + US1 + US2 → **MVP**: the complete create/view/edit/clear loop in the web UI, with the board-face due-date badge
3. + US3 → agents get full field parity through the MCP `create-task`/`update-task`/`get-task`/`list-board` tools
4. + Phase 6 → evidence, verifier, PR

Each step adds value without breaking the previous ones.

---

## Notes

- `[P]` = different files or independent test groups, no dependency on incomplete work
- `[Story]` maps each task to its spec user story for traceability
- Confirm every test FAILS before writing the code that makes it pass — code written before its failing test is discarded, not retrofitted (Constitution II)
- Commit after each task or logical group, Conventional Commits
- Two rules from `plan.md` that are easy to get subtly wrong: `updateTask`'s four new fields must distinguish `undefined` (leave unchanged) from `null` (clear) from a value (set) — three states, not two, or clearing becomes indistinguishable from "don't touch" (breaking FR-010); and enum validation for `priority`/`effort` belongs at the MCP `inputSchema`/HTTP-route `safeParse` layer, not deep in `updateTask`/`createTask`'s own logic — the schema itself is the gate (research.md R5)
- The `drizzle/0007_*.sql` migration file, once landed on `main`, is immutable — never edited, regenerated, or deleted (CLAUDE.md)
- No value constraint applies to `dueDate`/`description` beyond "accept any string" (FR-002) — resist the urge to add a date-format regex or length limit that wasn't asked for
