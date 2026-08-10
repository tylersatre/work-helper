# Tasks: Tags

**Input**: Design documents from `/specs/011-tags/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, contracts/mcp-tools.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires TDD: every behavior gets a failing test before the code that makes it pass. Test tasks are ordered red-before-green within each phase.

**Organization**: Tasks are grouped by user story so each story is an independently implementable, independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same group (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3) — user-story phases only
- Every task names its exact file path(s)

## Path Conventions

Single-package web app at repo root: server in `src/server/`, Vue SPA in `src/client/`, shared code in `src/shared/`, tests in `tests/unit|component|integration/`, migrations in `drizzle/` (per plan.md Project Structure).

---

## Phase 1: Setup (Schema & Migration)

**Purpose**: Put the three new tables in place so every later layer has storage to build on. Schema DDL is structure, not behavior — its correctness is proven by the failing integration tests in the story phases, so these two tasks carry no test of their own (constitution TDD applies to behavior code).

- [X] T001 Add `tags`, `personTags`, `taskTags` tables to `src/server/db/schema.ts` per data-model.md: `tags` (id PK autoincrement, name text NOT NULL with unique index `tags_name_unique` on `lower(name)`, color text NOT NULL, created_at integer NOT NULL epoch ms); `person_tags` (personId FK → people.id ON DELETE CASCADE, tagId FK → tags.id ON DELETE CASCADE, composite PK); `task_tags` (taskId FK → tasks.id ON DELETE CASCADE, tagId FK → tags.id ON DELETE CASCADE, composite PK)
- [X] T002 Regenerate the single baseline migration per research.md R9 (dev-phase policy): delete the contents of `drizzle/`, run `npx drizzle-kit generate`, and delete the dev DB file `./data/work-helper.db` so `migrate()` recreates it on next start

---

## Phase 2: Foundational (Shared Types, Validation, Palette)

**Purpose**: Shared building blocks every user story consumes — `Tag` types, name/color validation schemas, and the 10-color auto-assign palette with its cycling rule.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Write failing unit tests in `tests/unit/tag-validation.test.ts` for `tagNameSchema` (trims surrounding whitespace; rejects empty and whitespace-only with message "A name is required"; accepts a valid name and returns it trimmed) and `tagColorSchema` (accepts `#RRGGBB` hex; rejects anything else with message "A valid color is required") per data-model.md Validation rules
- [X] T004 [P] Write failing unit tests in `tests/unit/tag-palette.test.ts` for the shared palette module: exports the exact 10 colors from research.md R3 in order; `nextTagColor(lastColor)` returns `palette[0]` when `lastColor` is null/undefined (no tags yet), returns `palette[(i + 1) % 10]` when `lastColor` sits at palette index `i` (including wrap from index 9 to 0), and returns the first palette color that differs from `lastColor` when it is a custom color not in the palette
- [X] T005 [P] Add `Tag { id: number; name: string; color: string }` and `TagWithCounts extends Tag { peopleCount: number; tasksCount: number }` interfaces to `src/shared/types.ts` per data-model.md (do NOT add `tags` to `Person`/`TaskDetail` yet — that lands with the read-model work in T011)
- [X] T006 [P] Implement `tagNameSchema` and `tagColorSchema` in `src/shared/validation.ts` to make T003 pass
- [X] T007 [P] Implement `src/shared/tag-palette.ts` exporting the 10-color `TAG_PALETTE` and `nextTagColor(lastColor)` per research.md R3 to make T004 pass

**Checkpoint**: `npx vitest run tests/unit/tag-validation.test.ts tests/unit/tag-palette.test.ts` green — user story phases can begin.

---

## Phase 3: User Story 1 - Tag people and tasks inline (Priority: P1) 🎯 MVP

**Goal**: Create/attach tags from a tag input on task and person detail views, render colored chips on task detail, person detail, and people-list rows, detach without deleting — one shared vocabulary across both record types.

**Independent Test**: Open a task's detail view, create a tag, attach the same tag to a person via the case-insensitive suggestion, and remove it from the task — all without any Tags page existing (spec US1 Independent Test).

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T008 [P] [US1] Write failing integration tests in `tests/integration/tags.test.ts` for `GET /api/tags` per contracts/http-api.md: empty array when no tags exist; lists every tag with `id`, `name`, and `color` after tags are created through the create-and-attach endpoints (usage-count aggregates and FR-009 ordering are US2 behavior — asserted in T025, implemented in T026)
- [X] T009 [P] [US1] Write failing integration tests in `tests/integration/tag-attachments.test.ts` for the attach/detach endpoints per contracts/http-api.md, symmetric for `POST|DELETE /api/tasks/:id/tags[/:tagId]` and `POST|DELETE /api/people/:id/tags[/:tagId]`: create-and-attach by `{name}` returns 200 `{tags}` with the new tag auto-colored; consecutively created tags get different palette colors; `{name}` case-insensitively matching an existing tag attaches it without creating a duplicate (tag count unchanged, SC-004); trimmed whitespace-only name → 400 "A name is required"; a body with neither `tagId` nor `name` (or both) → 400 "Provide a tagId or a name"; attach by `{tagId}` works and unknown tagId → 404 "Tag not found"; attaching an already-attached tag is a no-op; detach removes only that record's attachment (tag and its other attachments survive); detaching a not-attached tag is a no-op returning the current list; unknown person/task → 404; `GET /api/people`, `GET /api/people/:id`, `GET /api/tasks/:id` each include `tags: Tag[]` ordered by name case-insensitively

### Implementation for User Story 1

- [X] T010 [US1] Implement `src/server/services/tags.ts`: `createTag` (trim via tagNameSchema, case-insensitive duplicate detection returning a typed `name-taken` result, auto-assign color with `nextTagColor` from the most recently created tag's color per research.md R3), `listTags` (the whole vocabulary — `id`, `name`, `color`; usage-count aggregates and FR-009 ordering land in US2 via T026), `attachTagToPerson`/`attachTagToTask` (by tagId, or by name as create-and-attach in one transaction, attaching the existing tag on a case-insensitive name match per research.md R6, `onConflictDoNothing` for re-attach), `detachTagFromPerson`/`detachTagFromTask`, and `getTagsForPerson`/`getTagsForTask` (name-ordered case-insensitively)
- [X] T011 [US1] Add `tags: Tag[]` to `Person` and `TaskDetail` in `src/shared/types.ts` and populate it in `src/server/services/people.ts` (`getPerson` and `listPeople`) and `src/server/services/tasks.ts` (`getTaskDetail`), ordered by name case-insensitively per research.md R8
- [X] T012 [US1] Create `src/server/routes/tags.ts` with `GET /api/tags` (returns `listTags` output) and register it in `src/server/app.ts`
- [X] T013 [US1] Add `POST /api/people/:id/tags` + `DELETE /api/people/:id/tags/:tagId` to `src/server/routes/people.ts` and `POST /api/tasks/:id/tags` + `DELETE /api/tasks/:id/tags/:tagId` to `src/server/routes/tasks.ts`, both responding 200 `{tags}` per contracts/http-api.md — T008 and T009 must now pass
- [X] T014 [P] [US1] Write failing component tests in `tests/component/tag-chip.test.ts`: `TagChip` renders the tag name, applies the tag's color, and (when removable) emits a remove event from its close affordance
- [X] T015 [P] [US1] Write failing component tests in `tests/component/tag-input.test.ts` per research.md R5: suggestions filter the vocabulary case-insensitively as the user types; tags already attached to the current record are excluded from suggestions; a "Create" option appears only when the typed name does not case-insensitively match any existing tag; selecting a suggestion emits attach-by-id and choosing create emits create-by-name; submitting an empty or whitespace-only name shows "A name is required" and emits nothing
- [X] T016 [P] [US1] Implement `src/client/components/TagChip.vue` (single source of chip rendering: name + color, optional remove affordance) to make T014 pass
- [X] T017 [US1] Implement `src/client/components/TagInput.vue` following the `LinkedPeople.vue` pattern (NInput + suggestion list, vocabulary fetched from `GET /api/tags`, client-side case-insensitive filtering, conditional create option) to make T015 pass
- [X] T018 [P] [US1] Extend `tests/component/task-detail.test.ts` with failing tests for a Tags section on the task detail view: chips render from the task's `tags`, removing a chip calls `DELETE /api/tasks/:id/tags/:tagId` and updates the list, and the `TagInput` attaches via `POST /api/tasks/:id/tags`
- [X] T019 [P] [US1] Extend `tests/component/person-detail-page.test.ts` with failing tests for a Tags section on the person detail view: chips render from the person's `tags`, removing a chip calls `DELETE /api/people/:id/tags/:tagId`, and the `TagInput` attaches via `POST /api/people/:id/tags`
- [X] T020 [P] [US1] Extend `tests/component/people-page.test.ts` with failing tests for tag chips rendered on each people-list row from the person's `tags` (no input, no remove affordance on rows)
- [X] T021 [P] [US1] Add the Tags section (chips via `TagChip` + `TagInput` + detach handling) to `src/client/pages/TaskDetailPage.vue` to make T018 pass
- [X] T022 [P] [US1] Add the Tags section (chips via `TagChip` + `TagInput` + detach handling) to `src/client/pages/PersonDetailPage.vue` to make T019 pass
- [X] T023 [P] [US1] Render tag chips via `TagChip` on people-list rows in `src/client/pages/PeoplePage.vue` to make T020 pass
- [X] T024 [US1] Collect US1 browser evidence: run the `browser-tester` agent through quickstart.md "US1 — inline tagging" steps 1–6 against the dev server (`npm run dev`, UI on port 5111) and save screenshots + results to `docs/evidence/011-tags/us1/`

**Checkpoint**: User Story 1 is fully functional on its own — inline create/attach/detach with persistent chips on all three surfaces, no Tags page required. This is the MVP.

---

## Phase 4: User Story 2 - Manage the tag vocabulary on a Tags page (Priority: P2)

**Goal**: A Tags page reachable from the top nav listing every tag most-used-first, with create, rename, recolor (preset swatches + custom), and delete behind a count-stating confirmation dialog — changes reflected on every surface.

**Independent Test**: Seed a tag attached to one person and one task, then exercise create, rename, recolor, and delete from the Tags page and check every surface where the tag appeared (spec US2 Independent Test).

**Depends on**: US1 (extends `src/server/services/tags.ts` and `src/server/routes/tags.ts` created there; exercises chips on US1 surfaces).

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T025 [US2] Extend `tests/integration/tags.test.ts` with failing vocabulary CRUD and ordering tests per contracts/http-api.md: `GET /api/tags` returns `TagWithCounts[]` with `peopleCount`/`tasksCount` aggregates, ordered by total attachments descending with ties broken by `lower(name)` ascending (seed VIP×2 attachments, Q3×1, Alpha and Beta ×0 → order VIP, Q3, Alpha, Beta); `POST /api/tags` creates with auto-assigned color and zero attachments (201 `Tag`), rejects whitespace-only name with 400 "A name is required" and case-insensitive duplicate with 409 "That tag name is already in use"; `PATCH /api/tags/:id` renames (reflected in subsequent person/task/tag reads), rejects a duplicate against any other tag with 409 while allowing recasing the tag's own name, recolors with a valid hex and rejects an invalid color with 400 "A valid color is required", rejects an empty body (neither `name` nor `color`) with 400 "Nothing to update", and returns 404 "Tag not found" for an unknown id; `DELETE /api/tags/:id` returns 204 and cascade-removes all of the tag's attachments from person and task reads, 404 for an unknown id

### Implementation for User Story 2

- [X] T026 [US2] Add `renameTag` (trim + case-insensitive duplicate check excluding the tag's own id per research.md R2), `recolorTag`, and `deleteTag` (row delete, FK cascade clears attachments) to `src/server/services/tags.ts`, and extend `listTags` with `peopleCount`/`tasksCount` aggregates and the FR-009 order in SQL per research.md R7
- [X] T027 [US2] Add `POST /api/tags`, `PATCH /api/tags/:id`, `DELETE /api/tags/:id` to `src/server/routes/tags.ts` per contracts/http-api.md — T025 must now pass
- [X] T028 [P] [US2] Write failing component tests in `tests/component/tags-page.test.ts`: styled "No tags yet" empty state when the vocabulary is empty; tags listed as chips in the server-provided order; create control adds a tag and surfaces "A name is required" / "That tag name is already in use" validation messages; rename flow edits a tag and surfaces the same validation messages; recolor uses `NColorPicker` with `:swatches` bound to the shared `TAG_PALETTE` and hex mode for custom colors (research.md R4); delete opens an in-app confirmation dialog stating the freshly fetched counts (research.md R7) with correct pluralization — "attached to 1 person and 1 task" at counts of one, "attached to 0 people and 0 tasks"-style plurals otherwise — cancel changes nothing, confirm deletes and updates the list
- [X] T029 [P] [US2] Extend `tests/component/app-shell.test.ts` with failing tests for a "Tags" link in the top navigation that routes to `/tags` and is marked as the active section while on it
- [X] T030 [US2] Add the `/tags` route to `src/client/router.ts` and the "Tags" nav link with active-section handling to `src/client/App.vue` to make T029 pass
- [X] T031 [US2] Implement `src/client/pages/TagsPage.vue` (usage-ordered chip list from `GET /api/tags`, create control, rename, `NColorPicker` recolor with palette swatches + custom hex, delete with count-stating in-app confirm dialog) to make T028 pass
- [X] T032 [US2] Collect US2 browser evidence: run the `browser-tester` agent through quickstart.md "US2 — Tags page" steps 1–6 and save screenshots + results to `docs/evidence/011-tags/us2/`

**Checkpoint**: User Stories 1 and 2 both work — the vocabulary is fully manageable and every change propagates to every chip surface.

---

## Phase 5: User Story 3 - Agents see tags on people and tasks (Priority: P3)

**Goal**: `get-person` and `get-task` MCP tool responses include the record's tag names (names only — no colors or ids) for authorized agents.

**Independent Test**: Tag one person and one task in the app, then fetch each through the MCP tools and check the tags in the responses (spec US3 Independent Test).

**Depends on**: US1 read models (T011); independent of US2 — can run in parallel with Phase 4 (no shared files).

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T033 [US3] Extend `tests/integration/mcp-read-tools.test.ts` with failing tests per contracts/mcp-tools.md: `get-person` `structuredContent` includes `tags` as an array of tag names ordered case-insensitively (e.g. `["VIP"]`); `get-task` likewise (e.g. `["Q3", "VIP"]`); an untagged record returns `tags: []`; the tag entries are plain strings carrying no color or id data

### Implementation for User Story 3

- [X] T034 [US3] Add `tags: z.array(z.string())` to the `outputSchema` of `get-person` and `get-task` in `src/server/mcp/tools.ts` and map the read models' `tags` to names-only in both handlers — T033 must now pass
- [X] T035 [US3] Record US3 evidence: capture the passing `npx vitest run tests/integration/mcp-read-tools.test.ts` output to `docs/evidence/011-tags/us3/` (MCP-only criterion — recorded automated-check output is the surface-appropriate evidence per the constitution)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Verification Gate

**Purpose**: Full-repo verification and independent confirmation before the PR.

- [X] T036 Run the full gate from the repo root — `npm run lint && npm run typecheck && npm test && npm run build` — and fix any fallout across `src/` and `tests/`
- [X] T037 Invoke the `verifier` agent to independently re-check every acceptance criterion in `specs/011-tags/spec.md` against the automated checks and the evidence in `docs/evidence/011-tags/` (constitution Principle III) before reporting the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 → T002. No other dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1. T003/T004/T005 first (parallel), then T006 (needs T003) and T007 (needs T004) in parallel. BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Phase 2. Server: T008/T009 (parallel, red) → T010 → T011 → T012 → T013 (green). Client: T014/T015 (parallel, red) → T016 → T017 → T018/T019/T020 (parallel, red) → T021/T022/T023 (parallel, green) → T024 (evidence).
- **US2 (Phase 4)**: Depends on US1 (extends `services/tags.ts`, `routes/tags.ts`, and US1 chip surfaces). T025 (red) → T026 → T027 (green); T028/T029 (parallel, red) → T030 → T031 (green) → T032 (evidence).
- **US3 (Phase 5)**: Depends on US1 T011 (read models) only — can run in parallel with all of Phase 4 (disjoint files). T033 (red) → T034 (green) → T035 (evidence).
- **Polish (Phase 6)**: Depends on all story phases. T036 → T037.

### User Story Dependencies

- **US1 (P1)**: Only on Setup + Foundational — no other stories.
- **US2 (P2)**: On US1 (shared service/route files and chip surfaces), by design ("builds directly on User Story 1" per spec).
- **US3 (P3)**: On US1's read-model task (T011) only; independent of US2.

### Parallel Opportunities

- Phase 2: T003, T004, T005 together; then T006 ∥ T007.
- US1 tests: T008 ∥ T009; T014 ∥ T015; T018 ∥ T019 ∥ T020.
- US1 implementation: T021 ∥ T022 ∥ T023 (three different page files).
- US2 tests: T028 ∥ T029.
- **US3 (all of Phase 5) can run in parallel with US2 (Phase 4)** — no shared files.

---

## Parallel Example: User Story 1

```bash
# Red — launch the two integration test suites together:
Task: "Write failing integration tests for GET /api/tags in tests/integration/tags.test.ts"        # T008
Task: "Write failing integration tests for attach/detach in tests/integration/tag-attachments.test.ts"  # T009

# Red — launch the two new-component test suites together:
Task: "Write failing component tests in tests/component/tag-chip.test.ts"    # T014
Task: "Write failing component tests in tests/component/tag-input.test.ts"   # T015

# Green — after T016/T017, wire the three surfaces together:
Task: "Add Tags section to src/client/pages/TaskDetailPage.vue"    # T021
Task: "Add Tags section to src/client/pages/PersonDetailPage.vue"  # T022
Task: "Render tag chips on rows in src/client/pages/PeoplePage.vue" # T023
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (schema + migration) → Phase 2 (shared types, validation, palette).
2. Phase 3 (US1): inline create/attach/detach with chips on task detail, person detail, and people-list rows.
3. **STOP and VALIDATE**: run `npx vitest run tests/integration/tags.test.ts tests/integration/tag-attachments.test.ts tests/component` plus the T024 browser evidence — US1 alone already delivers the feature's core value and is independently shippable.

### Incremental Delivery

1. Setup + Foundational → building blocks proven by unit tests.
2. US1 → MVP validated (inline tagging everywhere).
3. US2 (Tags page management) and US3 (MCP tags) — in priority order, or in parallel since they share no files.
4. Polish: full gate + `verifier` confirmation → PR.

---

## Notes

- Commit after each red→green pair or logical group (Conventional Commits).
- Verify each test task fails before starting its implementation task — code written before its failing test is discarded, not retrofitted (constitution Principle II).
- Integration tests use the existing real-Fastify + in-memory-SQLite helpers in `tests/integration/helpers`; MCP tests use the SDK client pattern already in `tests/integration/mcp-read-tools.test.ts`.
- Validation messages must match the contract exactly: "A name is required" (400), "Provide a tagId or a name" (400), "Nothing to update" (400), "A valid color is required" (400), "That tag name is already in use" (409), "Tag not found" / "Person not found" / "Task not found" (404).
