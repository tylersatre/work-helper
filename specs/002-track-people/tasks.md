# Tasks: Track People

**Input**: Design documents from `/specs/002-track-people/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires TDD: every test task is written first and MUST FAIL before its implementation task begins. Code written before its failing test is discarded.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story is independently implementable and testable. Research decisions are referenced as R1–R8 (research.md), validation rules as V1–V4 (data-model.md), contract test obligations as O1–O11 (contracts/http-api.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5); setup, foundational, and polish tasks have no story label
- Every task names its exact file path(s)

## Phase 1: Setup

**Purpose**: The two additions every later phase assumes — the routing dependency and the field-configuration file.

- [X] T001 Add `vue-router@4` to `dependencies` in `package.json` and run `npm install` (the feature's only new dependency, research.md R4)
- [X] T002 [P] Create `config/person-fields.json` containing `["Nickname"]` (matches quickstart.md prerequisites; `[]` would disable extra fields — data-model.md Field configuration)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, shared types, and client routing shell that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Write failing integration tests in `tests/integration/db.test.ts` (extend existing file): after migration the `people` and `task_people` tables exist; `PRAGMA foreign_keys` is ON; the `people_email_unique` partial index rejects a second row whose email differs only by case while allowing multiple NULL emails; the composite PK on `task_people` rejects a duplicate (task_id, person_id) pair; deleting a `people` row cascades away its `task_people` rows
- [X] T004 Add `people` and `task_people` tables to `src/server/db/schema.ts` per data-model.md: `people` with `id`, `first_name`/`last_name` NOT NULL, nullable `email`/`phone`, `extra_fields` JSON text NOT NULL DEFAULT `'{}'` via `text('extra_fields', { mode: 'json' }).$type<Record<string, string>>()`, `created_at` epoch ms, and `uniqueIndex('people_email_unique')` on `lower(email)` WHERE email IS NOT NULL; `task_people` with composite PK (`task_id`, `person_id`) and FKs to `tasks.id`/`people.id` both `ON DELETE CASCADE`
- [X] T005 Enable `sqlite.pragma('foreign_keys = ON')` in `createDb()` in `src/server/db/index.ts` (research.md R3 — better-sqlite3 does not enable FK enforcement by default)
- [X] T006 Generate the migration with `npx drizzle-kit generate` into `drizzle/`, hand-append the partial unique index SQL if drizzle-kit mishandles the expression (research.md R3), and confirm the T003 tests now pass
- [X] T007 [P] Add `Person` (id, firstName, lastName, email: string | null, phone: string | null, extraFields: Record<string, string>, createdAt) and `PersonInput` types to `src/shared/types.ts` per data-model.md API shape
- [X] T008 Introduce routing: create `src/client/pages/BoardPage.vue` hosting the current App content (`CreateTaskForm` + `Board`), create `src/client/router.ts` with route `/` → BoardPage (history mode), rewrite `src/client/App.vue` as a nav shell (Board | People links + `<RouterView>`), and install the router in `src/client/main.ts`
- [X] T009 Run `npm test` and `npm run typecheck` to confirm the full existing suite is still green after the router refactor (existing component tests mount `Board.vue`/`CreateTaskForm.vue` directly and should be untouched; fix any breakage before proceeding)

**Checkpoint**: Schema migrated, FK enforcement on, routing shell in place — user story implementation can begin.

---

## Phase 3: User Story 1 - Build the people directory (Priority: P1) 🎯 MVP

**Goal**: A People page where Tyler creates people (first name, last name, email, phone) and sees them listed alphabetically by last name, with name-required and email-uniqueness validation (FR-001..FR-005).

**Independent Test**: Open the People page, create a person, confirm they appear in the list with their details and survive a page reload.

### Tests for User Story 1 (write first — must fail) ⚠️

- [X] T010 [P] [US1] Write failing unit tests for the person input schema in `tests/unit/validation.test.ts` (extend existing file): blank or whitespace-only firstName/lastName rejected (V1); email/phone trimmed and blank-after-trim normalized to null (V2); no email format rule — any non-blank string accepted (research.md R8)
- [X] T011 [P] [US1] Write failing integration tests in `tests/integration/people.test.ts` using `app.inject()` against `createDb(':memory:')` covering O1–O4: POST `/api/people` → 201 with created Person and it appears in GET `/api/people` with all fields; ordering — "Alvarez" above "Rivera", same last name falls back to first name, case ignored (R7); blank names → 400 `{ error: { message: "First and last name are required" } }` with nothing persisted; duplicate email differing only by case → 409 `{ error: { message: "That email is already in use" } }` with nothing persisted; two blank-email people coexist
- [X] T012 [P] [US1] Write failing component tests in `tests/component/people-page.test.ts` (@testing-library/vue + jsdom, per `tests/component/setup.ts` idiom): people list renders rows with name, email, phone in given order; create form submits the four built-in fields; server 400/409 validation messages are shown to the user

### Implementation for User Story 1

- [X] T013 [US1] Add `personInputSchema` to `src/shared/validation.ts` implementing V1 (names required after trim) and V2 (email/phone trim, blank → null) — make T010 pass
- [X] T014 [US1] Create `src/server/services/people.ts` with `createPerson` (V3 email-uniqueness check via `lower(email)` comparison excluding own id → conflict result, R3) and `listPeople` ordered `last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC` (R7), storing `extra_fields` as `{}` for now (US5 adds handling)
- [X] T015 [US1] Create `src/server/routes/people.ts` with GET `/api/people` (200 → Person[]) and POST `/api/people` (201 created Person; 400 "First and last name are required"; 409 "That email is already in use"; error envelope `{ error: { message } }` per R8) and register the routes in `src/server/app.ts` — make T011 pass
- [X] T016 [P] [US1] Create `src/client/components/PersonForm.vue`: the shared create/edit form rendering the four built-in fields (First name, Last name, Email, Phone), emitting submitted values, and displaying a passed-in server validation message
- [X] T017 [US1] Create `src/client/pages/PeoplePage.vue` (fetch and render the directory from GET `/api/people`; create people via `PersonForm` + POST `/api/people`; surface 400/409 messages; rows show name, email, phone) and add the `/people` route to `src/client/router.ts` — make T012 pass

**Checkpoint**: The people directory works end-to-end and survives reloads — this is the MVP.

---

## Phase 4: User Story 2 - View and edit a person's record (Priority: P2)

**Goal**: A person record view showing all fields, editable with the same validation rules as create (FR-006, FR-007).

**Independent Test**: Open an existing person's record, confirm all fields are displayed, change one field, save, and confirm the change survives a page reload.

### Tests for User Story 2 (write first — must fail) ⚠️

- [X] T018 [P] [US2] Write failing integration tests in `tests/integration/people.test.ts` (extend) covering O5: GET `/api/people/:id` → 200 Person, 404 `{ error: { message: "Person not found" } }` for unknown id; PUT `/api/people/:id` round-trip — edited phone persists on subsequent GET; PUT validation matches create (400 blank names, 409 another person's email, stored record unchanged after each rejection); PUT keeping the person's own email unchanged succeeds (V3 own-record exclusion)
- [X] T019 [P] [US2] Write failing component tests in `tests/component/person-form.test.ts`: `PersonForm` renders pre-filled existing values in edit mode, emits changed values on save, and shows the rejection message while retaining the displayed record's previous values

### Implementation for User Story 2

- [X] T020 [US2] Add `getPerson` and `updatePerson` to `src/server/services/people.ts` (updatePerson applies V1–V3 exactly as create with the person's own id excluded from the email check) — make the service-level part of T018 pass
- [X] T021 [US2] Add GET `/api/people/:id` (200/404) and PUT `/api/people/:id` (200 updated Person / 400 / 409 / 404, same messages as create) to `src/server/routes/people.ts` — make T018 pass
- [X] T022 [US2] Create `src/client/pages/PersonDetailPage.vue` (display first name, last name, email, phone; edit via `PersonForm`; save via PUT; a rejected save shows the message and leaves the displayed record unchanged), add the `/people/:id` route to `src/client/router.ts`, and link each `PeoplePage` row to its person's record — make T019 pass

**Checkpoint**: User Stories 1 and 2 both work — the directory is browsable and correctable.

---

## Phase 5: User Story 3 - Link people to a task (Priority: P3)

**Goal**: Clicking a kanban card opens a task detail view where people are found by case-insensitive name/email substring search, linked, and unlinked (FR-012..FR-017).

**Independent Test**: With one task and one unlinked person, open the task's detail view, search for the person, link them, confirm they appear in the linked-people list, then remove them and confirm the person is untouched on the People page.

### Tests for User Story 3 (write first — must fail) ⚠️

- [X] T023 [P] [US3] Write failing integration tests in `tests/integration/people-search.test.ts` covering O6: GET `/api/people?q=` matches case-insensitive substring over first name, last name, and email; `%` and `_` in `q` match literally (R5); blank or absent `q` returns the full directory; results keep directory order
- [X] T024 [P] [US3] Write failing integration tests in `tests/integration/task-people.test.ts` covering O7–O8: GET `/api/tasks/:id` → 200 `TaskDetail` with title and empty `people` initially, 404 `{ error: { message: "Task not found" } }` for unknown task; POST `/api/tasks/:id/people` `{ personId }` → 200 TaskDetail with the person listed in directory order; linking the same person twice yields one entry (R6); unknown task or person → 404 with the matching message; DELETE `/api/tasks/:id/people/:personId` → 200 TaskDetail without the person while GET `/api/people/:id` still returns them unchanged; unlinking a not-linked person is a no-op 200
- [X] T025 [P] [US3] Write failing component tests in `tests/component/task-detail.test.ts`: task detail shows the task title, an empty linked-people section with a search box, search results showing each person's name AND email (FR-013), selecting a result adds them to the linked list, a remove control unlinks them, and the view offers no task-field editing and no create-person affordance (FR-016)
- [X] T026 [P] [US3] Write failing component test in `tests/component/task-card.test.ts`: clicking a `TaskCard` navigates to `/tasks/:id` (use a memory-history router in the test) and the card's rendered face markup is unchanged (FR-017)

### Implementation for User Story 3

- [X] T027 [US3] Add the `q` filter to `listPeople` in `src/server/services/people.ts` using `instr(lower(first_name), lower(?)) > 0 OR instr(lower(last_name), lower(?)) > 0 OR instr(lower(coalesce(email, '')), lower(?)) > 0` with trimmed `q` (R5), and accept the optional `q` query param in GET `/api/people` in `src/server/routes/people.ts` — make T023 pass
- [X] T028 [US3] Add `TaskDetail` type (existing `Task` + `people: Person[]`) to `src/shared/types.ts` and implement `getTaskDetail`, `linkPerson` (insert with `onConflictDoNothing()`, R6), and `unlinkPerson` in `src/server/services/tasks.ts`, linked people ordered like the directory (R7)
- [X] T029 [US3] Add GET `/api/tasks/:id`, POST `/api/tasks/:id/people`, and DELETE `/api/tasks/:id/people/:personId` to `src/server/routes/tasks.ts` (200 TaskDetail; 404 "Task not found" / "Person not found"; error envelope per R8) — make T024 pass
- [X] T030 [P] [US3] Create `src/client/components/LinkedPeople.vue`: renders the task's linked people, a debounced search input querying GET `/api/people?q=` only for non-blank text, results showing name and email, select → POST link, remove → DELETE unlink, re-rendering from each returned TaskDetail
- [X] T031 [US3] Create `src/client/pages/TaskDetailPage.vue` (read-only task title + `LinkedPeople`; no task-field editing per FR-016), add the `/tasks/:id` route to `src/client/router.ts`, and make `src/client/components/TaskCard.vue` navigate to `/tasks/:id` on click without changing its rendered face (FR-017) — make T025 and T026 pass

**Checkpoint**: Tasks and people are linkable — both halves of the feature's value are live.

---

## Phase 6: User Story 4 - Delete a person everywhere at once (Priority: P4)

**Goal**: Deleting a person from the People page removes them from the list and from every task's linked people with no orphans (FR-008, SC-006).

**Independent Test**: Link one person to two tasks, delete the person from the People page, and confirm they are gone from the list and from both tasks' detail views.

### Tests for User Story 4 (write first — must fail) ⚠️

- [X] T032 [P] [US4] Write failing integration tests in `tests/integration/person-delete.test.ts` covering O9: DELETE `/api/people/:id` → 204 with no body and the person gone from GET `/api/people`; a person linked to two tasks → after delete, both GET `/api/tasks/:id` responses show empty `people` (cascade); unknown person → 404 `{ error: { message: "Person not found" } }`
- [X] T033 [P] [US4] Extend `tests/component/people-page.test.ts` with a failing test: each row has a delete action, and activating it removes the person from the rendered list

### Implementation for User Story 4

- [X] T034 [US4] Add `deletePerson` to `src/server/services/people.ts` (single delete; `task_people` rows removed by FK CASCADE, R3) and DELETE `/api/people/:id` (204/404) to `src/server/routes/people.ts` — make T032 pass
- [X] T035 [US4] Add a delete action to each row in `src/client/pages/PeoplePage.vue` calling DELETE `/api/people/:id` and refreshing the list — make T033 pass

**Checkpoint**: The directory and task links stay trustworthy — no orphaned references anywhere.

---

## Phase 7: User Story 5 - Extra fields from configuration (Priority: P5)

**Goal**: Extra optional free-text fields defined in `config/person-fields.json` appear on the create/edit form and person record, persisting like built-in fields, with no management UI (FR-009..FR-011).

**Independent Test**: With `["Nickname"]` configured, create a person, fill in the Nickname input, and confirm the value shows on their record and survives a page reload.

### Tests for User Story 5 (write first — must fail) ⚠️

- [X] T036 [P] [US5] Write failing unit tests in `tests/unit/person-fields-config.test.ts` (mirror `tests/unit/lanes-config.test.ts`): a valid label array loads in config order; `[]` is valid; blank-after-trim entries rejected; case-insensitive duplicates rejected; entries colliding case-insensitively with built-in labels ("First name", "Last name", "Email", "Phone") rejected; missing or malformed file fails fast; `PERSON_FIELDS_CONFIG_PATH` env override respected (R1)
- [X] T037 [P] [US5] Write failing integration tests in `tests/integration/people.test.ts` (extend) covering O10–O11: GET `/api/person-fields` → 200 `{ fields: [...] }` in config order; a configured extra field value round-trips through POST create, GET read, and PUT update; keys not in the configuration are stripped and blank values dropped (V4)
- [X] T038 [P] [US5] Extend `tests/component/person-form.test.ts` with failing tests: each configured extra field renders as an optional free-text input on create and edit, its value is included in the submitted payload, leaving it blank still submits successfully, and the person record displays the saved extra field value

### Implementation for User Story 5

- [X] T039 [US5] Create `src/server/person-fields-config.ts` with `loadPersonFieldsConfig()` mirroring `src/server/lanes-config.ts` (Zod schema, `PERSON_FIELDS_CONFIG_PATH` override, fail-fast validation per R1) — make T036 pass
- [X] T040 [US5] Load the config at startup in `src/server/index.ts`, decorate it as `app.personFields` in `src/server/app.ts` (following the lanes decoration pattern), and add GET `/api/person-fields` → `{ fields }` to `src/server/routes/people.ts`
- [X] T041 [US5] Add optional `extraFields` to `personInputSchema` in `src/shared/validation.ts` and implement V4 in `createPerson`/`updatePerson` in `src/server/services/people.ts`: strip keys not in the current configuration, trim values, drop blanks; surface only currently configured keys on read — make T037 pass
- [X] T042 [US5] Extend `src/client/components/PersonForm.vue` to fetch GET `/api/person-fields` and render one optional free-text input per configured label (create and edit), and show saved extra field values on `src/client/pages/PersonDetailPage.vue` — make T038 pass

**Checkpoint**: All five user stories are functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Spec edge cases spanning stories, the full verification gate, and the constitution's evidence requirements.

- [X] T043 [P] Ensure very long names and emails render without breaking the layout of the people list (`src/client/pages/PeoplePage.vue`), person record (`src/client/pages/PersonDetailPage.vue`), and linked-people list (`src/client/components/LinkedPeople.vue`) — overflow-safe styles per the spec's edge case
- [X] T044 Run the full automated gates from quickstart.md — `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all green, all 11 contract obligations covered
- [X] T045 Run the quickstart.md API smoke sequence with curl against `npm run dev` (create, order, 400, 409, search, link, unlink, delete cascade) and confirm each expected status and body
- [X] T046 Dispatch the `browser-tester` agent against the Vite dev URL for quickstart.md browser scenarios 1–5 (one evidence set per user story, folding in the edge checks: blank-email coexistence, own-email re-save, no duplicate link, long-name layout), saving screenshots and results to `docs/evidence/track-people/`
- [X] T047 Dispatch the `verifier` agent to independently re-check every row of the quickstart.md acceptance-criteria mapping table — each spec item must have both its automated check and its browser evidence confirmed (constitution Principle III) before the feature is reported done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T008 needs vue-router from T001) — BLOCKS all user stories.
- **User Stories (Phases 3–7)**: All depend on Foundational completion. Sequential execution follows priority order P1 → P2 → P3 → P4 → P5. US2 (T018 extends `people.test.ts`; T022 links from PeoplePage), US4 (T033/T035 extend PeoplePage), and US5 (T037/T041 extend people service/schema) build on US1's files; US3 only needs Foundational plus a person to search for (US1's service). Each story remains independently *testable* at its checkpoint.
- **Polish (Phase 8)**: Depends on all five user stories; T044 → T045 → T046 → T047 in order (gates before smoke, evidence before verifier).

### Within Each User Story

- All test tasks for the story are written first and MUST FAIL before any implementation task in that story starts (constitution Principle II).
- Shared validation/types before services; services before routes; routes before client pages; pages/router wiring last.
- The story's checkpoint is only reached when the story's tests — and all earlier tests — are green.

### Parallel Opportunities

- **Phase 1**: T002 alongside T001.
- **Phase 2**: T007 in parallel with T003–T006 (different files); T008 after T001.
- **Every story phase**: all its test tasks are [P] with each other (different files, e.g. T010+T011+T012, T023+T024+T025+T026, T036+T037+T038).
- **Implementation**: client-only component tasks marked [P] (T016, T030) can proceed alongside server tasks of the same story.
- **Phase 8**: T043 alongside T044.

---

## Parallel Example: User Story 1

```bash
# After Phase 2, launch all US1 test tasks together (all must fail first):
Task T010: "Failing unit tests for person input schema in tests/unit/validation.test.ts"
Task T011: "Failing integration tests (O1–O4) in tests/integration/people.test.ts"
Task T012: "Failing component tests in tests/component/people-page.test.ts"

# Then implement bottom-up; T016 can run alongside T014/T015:
Task T013: "personInputSchema in src/shared/validation.ts"
Task T014: "People service in src/server/services/people.ts"
Task T015: "People routes in src/server/routes/people.ts" + Task T016 [P]: "PersonForm.vue"
Task T017: "PeoplePage.vue + /people route"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T009) — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T010–T017)
4. **STOP and VALIDATE**: run the US1 independent test (create a person, see them listed alphabetically, reload persists, validation messages show); this alone is a shippable people directory

### Incremental Delivery

1. Setup + Foundational → schema, types, routing shell ready
2. US1 → people directory (MVP — demo-able)
3. US2 → record view + edit
4. US3 → task detail + linking (second half of the feature's value)
5. US4 → delete cascades everywhere
6. US5 → configured extra fields
7. Polish → edge-case layout, gates, API smoke, browser evidence, verifier sign-off → PR

Each story leaves the app releasable; commit after each task or logical group with Conventional Commits.
