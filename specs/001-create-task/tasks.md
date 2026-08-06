# Tasks: Create Task

**Input**: Design documents from `/specs/001-create-task/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — TDD is NON-NEGOTIABLE (constitution Principle II). Every behavior-bearing implementation task is preceded by a task that writes its failing test. Pure configuration/wiring tasks (tsconfig, Vite config, entrypoint) carry no unit test; they are covered by the verification gate (`lint`/`typecheck`/`test`/`build`).

**Organization**: Tasks are grouped by user story. US1 (P1) is the MVP; US2 and US3 extend it. This is a greenfield repository (no `package.json` yet), so Setup and Foundational phases establish the whole stack per research.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3) — user-story phases only
- Every task names exact file paths

## Path Conventions

Single npm package at repo root (plan.md / research.md R9): `src/server/`, `src/client/`, `src/shared/`, `tests/{unit,integration,component}/`, `config/`, `drizzle/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the greenfield project — package, toolchain, configs. Establishes the stack decided in research.md (Node 24, TypeScript 5.9, Fastify 5, Vue 3.5 + Vite 8, Drizzle + better-sqlite3, zod 4, Vitest 4).

- [X] T001 Initialize npm package in `package.json`: `"type": "module"`, `engines.node >=22`; dependencies `fastify`, `@fastify/static`, `vue`, `drizzle-orm`, `better-sqlite3`, `zod`; devDependencies `typescript`, `vite`, `@vitejs/plugin-vue`, `vue-tsc`, `drizzle-kit`, `vitest`, `@testing-library/vue`, `jsdom`, `eslint` (+ TS/Vue plugins), `concurrently`, `@types/node`, `@types/better-sqlite3`; scripts `dev` (Fastify + Vite concurrently), `build` (vite build + server compile), `lint` (eslint), `typecheck` (`vue-tsc --noEmit`), `test` (`vitest run`)
- [X] T002 Create `tsconfig.json` (strict, NodeNext-compatible module resolution, covers `src/**` and `tests/**`; `.vue` SFCs typechecked via `vue-tsc`)
- [X] T003 [P] Configure ESLint flat config for TypeScript + Vue SFCs in `eslint.config.js`
- [X] T004 [P] Create `vite.config.ts`: root `src/client`, `@vitejs/plugin-vue`, dev proxy `/api` → Fastify port, production build output consumed by `@fastify/static`
- [X] T005 [P] Create `vitest.config.ts` with per-directory environments: `node` for `tests/unit/` and `tests/integration/`, `jsdom` for `tests/component/`
- [X] T006 [P] Create `config/lanes.json` containing `["To Do", "In Progress", "Waiting", "Done"]` (contracts/lanes-config.md)
- [X] T007 [P] Add `data/` (runtime SQLite file location) to `.gitignore`

**Checkpoint**: `npm install` succeeds; `npm run lint` and `npm run typecheck` pass on the empty skeleton.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, validation, lane config loading, database, app factory, client shell — everything every user story sits on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 Define shared types `Task` and `BoardView` in `src/shared/types.ts` per contracts/http-api.md (`id: number`, `title: string`, `lane: string`, `createdAt: number`; board = ordered lanes each with `name` + `tasks[]`)
- [X] T009 [P] Write failing unit tests for the title schema in `tests/unit/validation.test.ts`: accepts non-empty title and returns trimmed value; rejects empty string, whitespace-only, and missing/non-string title; no maximum length (data-model.md, research.md R7)
- [X] T010 Implement zod title schema in `src/shared/validation.ts` to make T009 pass (trim, then require non-empty)
- [X] T011 [P] Write failing unit tests for the lane-config loader in `tests/unit/lanes-config.test.ts`: loads a valid JSON array preserving order; honors `LANES_CONFIG_PATH` override; rejects non-array, empty array, empty-after-trim entries, and duplicate names with an error naming the file path and violated rule (contracts/lanes-config.md)
- [X] T012 Implement config loader in `src/server/lanes-config.ts` to make T011 pass (read once at startup, zod-validated)
- [X] T013 [P] Write failing integration test for database init in `tests/integration/db.test.ts`: init on `:memory:` creates a `tasks` table supporting insert + select round-trip; applying migrations twice is safe (idempotent)
- [X] T014 Define `tasks` table in `src/server/db/schema.ts` per data-model.md (`id` INTEGER PK AUTOINCREMENT, `title` TEXT NOT NULL, `lane` TEXT NOT NULL, `createdAt` INTEGER NOT NULL) plus `drizzle.config.ts`, and generate the SQL migration into `drizzle/` via `drizzle-kit`
- [X] T015 Implement database init in `src/server/db/index.ts` to make T013 pass: open better-sqlite3 at `DATABASE_PATH` (default `./data/work-helper.db`, `:memory:` in tests), create parent directory if missing, apply Drizzle migrations at startup
- [X] T016 Implement Fastify app factory in `src/server/app.ts`: accepts injected db and lane list (testable via `app.inject()`), JSON error shape `{ "error": { "message": ... } }`, serves built client via `@fastify/static` in production
- [X] T017 Implement server entrypoint in `src/server/index.ts`: load lane config (T012), open database (T015), build app (T016), listen on configurable port
- [X] T018 Create client shell: `src/client/index.html`, `src/client/main.ts` (mounts Vue app), `src/client/App.vue` (placeholder content)

**Checkpoint**: `npm test` green (unit + db integration); `npm run dev` starts Fastify + Vite and serves the placeholder page; foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Create a task and see it on the board (Priority: P1) 🎯 MVP

**Goal**: Kanban board renders the four configured lanes in order; submitting a title creates a task that appears as a card in the first lane alongside existing cards.

**Independent Test**: Open the board, create a task by title, and confirm a card with that title appears in the first lane (spec.md US1).

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [X] T019 [P] [US1] Write failing integration tests for `GET /api/board` in `tests/integration/board.test.ts`: empty database returns every configured lane, in config order, each with empty `tasks[]`; populated database returns tasks in the correct lane in `id ASC` order (contracts/http-api.md)
- [X] T020 [P] [US1] Write failing integration tests for `POST /api/tasks` happy path in `tests/integration/tasks.test.ts`: valid title returns `201` with created task (trimmed title, first configured lane, server-set `createdAt`); duplicate titles create distinct tasks; client-supplied `lane`/`id` are ignored, never honored
- [X] T021 [P] [US1] Write failing component tests for the board in `tests/component/board.test.ts`: renders all configured lanes left-to-right in config order; renders task cards inside the correct lane in given order (Vue Testing Library + jsdom)
- [X] T022 [P] [US1] Write failing component test for the create form happy path in `tests/component/create-task-form.test.ts`: entering a valid title and submitting posts the title and clears the input

### Implementation for User Story 1

- [X] T023 [US1] Implement tasks service in `src/server/services/tasks.ts`: `createTask` (validate via shared schema, trim, assign first configured lane, set `createdAt`, insert) and `listTasks` (`id ASC`) — plain service layer the future MCP server will consume (plan.md Principle IV)
- [X] T024 [P] [US1] Implement `GET /api/board` route in `src/server/routes/board.ts`: every configured lane in order, each with its tasks, empty lanes included
- [X] T025 [P] [US1] Implement `POST /api/tasks` happy path in `src/server/routes/tasks.ts`: `201` with the created task per contracts/http-api.md
- [X] T026 [US1] Register board and tasks routes in the app factory `src/server/app.ts`; make T019/T020 pass
- [X] T027 [P] [US1] Implement `src/client/components/TaskCard.vue`: renders the task title; long titles wrap via CSS without breaking board layout (spec edge case)
- [X] T028 [P] [US1] Implement `src/client/components/Lane.vue`: lane name heading + ordered list of `TaskCard`s
- [X] T029 [US1] Implement `src/client/components/Board.vue`: fetches `/api/board`, renders `Lane`s left-to-right in response order; make T021 pass
- [X] T030 [US1] Implement `src/client/components/CreateTaskForm.vue` happy path: title input + submit posting to `/api/tasks`, emits created event, clears input; make T022 pass
- [X] T031 [US1] Wire `src/client/App.vue`: `CreateTaskForm` above `Board`; board refreshes when a task is created
- [X] T032 [US1] Run `browser-tester` agent against the dev server for quickstart scenarios 1–3 (empty board lane order; create task lands in "To Do"; second task joins without disturbing the first); save screenshot + results evidence to `docs/evidence/create-task/`

**Checkpoint**: US1 fully functional — all US1 acceptance scenarios have passing automated tests and browser evidence. MVP deliverable.

---

## Phase 4: User Story 2 - Tasks persist across reloads (Priority: P2)

**Goal**: Created tasks survive a page reload or new browser session — proving the database half of the vertical slice.

**Independent Test**: Create a task, reload the page, and confirm the card is still shown in the same lane (spec.md US2).

### Tests for User Story 2 (write FIRST — must FAIL before implementation)

- [X] T033 [US2] Write failing integration test in `tests/integration/persistence.test.ts`: with a file-backed temp database, create a task via `POST /api/tasks` on one app instance, close it, build a fresh app instance on the same file — `GET /api/board` still returns the task in the first lane

### Implementation for User Story 2

- [X] T034 [US2] Make T033 pass in `src/server/db/index.ts`: file-backed open with parent-directory creation and idempotent migration application on an existing database (if already green from T015, verify the test genuinely exercises a restart before accepting it)
- [X] T035 [US2] Run `browser-tester` agent for quickstart scenario 4 (create task, reload page, card still in "To Do"; `/api/board` confirms); save evidence to `docs/evidence/create-task/`

**Checkpoint**: US1 and US2 both work — tasks survive reload with automated + browser evidence.

---

## Phase 5: User Story 3 - Blocked from creating a titleless task (Priority: P3)

**Goal**: Empty or whitespace-only titles are rejected server- and client-side with a visible "title is required" message; nothing is persisted.

**Independent Test**: Submit the form with an empty and a whitespace-only title; confirm no card is created and a validation message is shown (spec.md US3).

### Tests for User Story 3 (write FIRST — must FAIL before implementation)

- [X] T036 [P] [US3] Extend `tests/integration/tasks.test.ts` with failing rejection tests: `POST /api/tasks` with missing, empty, and whitespace-only title returns `400` with `{ "error": { "message": "Title is required" } }` and persists nothing (subsequent `GET /api/board` task count unchanged)
- [X] T037 [P] [US3] Extend `tests/component/create-task-form.test.ts` with failing validation tests: submitting an empty or whitespace-only title shows a "title is required" message and does not POST
- [X] T038 [US3] Implement `400` rejection in `src/server/routes/tasks.ts` using the shared schema from `src/shared/validation.ts`; make T036 pass
- [X] T039 [US3] Implement client-side validation in `src/client/components/CreateTaskForm.vue` using the same shared schema: show the message, block the request; make T037 pass
- [X] T040 [US3] Run `browser-tester` agent for quickstart scenario 5 (submit `""` and `"   "`: no card created, board unchanged, visible validation message; API returns `400`); save evidence to `docs/evidence/create-task/`

**Checkpoint**: All three user stories independently functional with automated + browser evidence.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge-case hardening, full-gate verification, independent confirmation.

- [X] T041 [P] Add failing component assertion for very-long-title rendering in `tests/component/board.test.ts`, then confirm/adjust wrapping CSS in `src/client/components/TaskCard.vue` so the card renders without breaking board layout (spec edge case)
- [X] T042 Run the full verification gate from quickstart.md — `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — and fix any failures
- [X] T043 Run `verifier` agent to independently confirm every acceptance criterion has (a) a passing automated check and (b) browser evidence in `docs/evidence/create-task/` (constitution Principle III); resolve anything it flags and re-run

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational
- **User Story 2 (Phase 4)**: Depends on Foundational; builds on US1's `POST /api/tasks` (T025) — run after US1
- **User Story 3 (Phase 5)**: Depends on Foundational; builds on US1's route (T025) and form (T030) — run after US1
- **Polish (Phase 6)**: Depends on all user stories being complete

### Story Dependency Note

US2 and US3 are independently *testable* (each has its own test + evidence), but both exercise components US1 creates, so the practical order is strictly sequential: **US1 → US2 → US3**. This matches priority order anyway.

### Within Each User Story

- Failing tests FIRST — verify red before writing implementation (constitution Principle II; code written before its failing test is discarded)
- Service (T023) before routes (T024/T025); routes before registration (T026)
- Leaf components (T027/T028) before container components (T029–T031)
- Browser evidence task last in each story phase

### Key Task-Level Dependencies

- T010 ← T009; T012 ← T011; T015 ← T013, T014
- T023 ← T010 (shared schema), T015 (db)
- T026 ← T024, T025; T029 ← T027, T028; T031 ← T029, T030
- T032 ← T031 (full US1 stack running)
- T038/T039 ← T010 (same shared schema on both layers)

### Parallel Opportunities

- **Setup**: T003, T004, T005, T006, T007 after T001–T002
- **Foundational**: test-writing tasks T009, T011, T013 together (different files)
- **US1**: all four test tasks T019–T022 together; then T024 ∥ T025, and T027 ∥ T028
- **US3**: T036 ∥ T037
- US2/US3 phases themselves are sequential after US1 (see Story Dependency Note)

---

## Parallel Example: User Story 1

```bash
# Write all US1 failing tests together (different files):
Task: "T019 integration tests for GET /api/board in tests/integration/board.test.ts"
Task: "T020 integration tests for POST /api/tasks in tests/integration/tasks.test.ts"
Task: "T021 component tests for board in tests/component/board.test.ts"
Task: "T022 component test for create form in tests/component/create-task-form.test.ts"

# After T023 (service), implement both routes together:
Task: "T024 GET /api/board route in src/server/routes/board.ts"
Task: "T025 POST /api/tasks route in src/server/routes/tasks.ts"

# Leaf components together:
Task: "T027 TaskCard.vue"
Task: "T028 Lane.vue"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T007)
2. Phase 2: Foundational (T008–T018) — blocks everything
3. Phase 3: User Story 1 (T019–T032)
4. **STOP and VALIDATE**: US1 acceptance scenarios green in tests + browser evidence captured
5. This alone is a working, shippable slice: a board that captures to-dos

### Incremental Delivery

1. Setup + Foundational → skeleton app runs
2. US1 → test independently → MVP (create + see on board)
3. US2 → test independently → persistence proven
4. US3 → test independently → guardrail in place
5. Polish → full gate + verifier confirmation → PR

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Verify every test fails (red) before writing its implementation — the verifier agent enforces this culture; code written before its failing test is discarded, not retrofitted
- Commit after each task or logical group (Conventional Commits); everything lands via PR from branch `001-create-task` — no direct commits to `main`
- Browser evidence accumulates in `docs/evidence/create-task/` across T032, T035, T040
- MCP tools, task editing/moving/deleting, tags, links, and lane management are explicitly OUT of scope (FR-007/FR-008) — do not add endpoints or UI beyond the two routes and four components listed
