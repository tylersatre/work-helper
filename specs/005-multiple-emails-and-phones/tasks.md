# Tasks: Multiple Emails and Phones per Person

**Input**: Design documents from `/specs/005-multiple-emails-and-phones/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D11), data-model.md, contracts/http-api.md, contracts/mcp-tools.md, quickstart.md

**Tests**: REQUIRED — the constitution makes TDD non-negotiable (Principle II). Every behavior task is preceded by a failing-test task; code written before its failing test is discarded.

**Organization**: Foundational phase carries the schema/migration/read-model reshape that every story depends on; then one phase per user story (US1 emails, US2 phones, US3 validation), each independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (emails, P1), US2 (phones, P2), US3 (duplicate/blank rejection, P3)

## Phase 1: Setup

**Purpose**: Confirm a green baseline before touching anything. No project initialization is needed — existing single-package app, zero new dependencies (plan.md Technical Context).

- [X] T001 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` in the worktree and confirm all pass, establishing the pre-feature baseline

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: New tables + migration 0004 with carry-over, shared types, split validation schemas, the people-service read-model reshape (entry arrays + primary projection), MCP primary projection, and the client adaptation to the new Person shape. Everything here is a prerequisite for all three stories because the `people.email`/`people.phone` columns are dropped in the same migration that creates the entry tables (research D5) — no story can run against the old shape.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete and the gate commands pass again.

- [X] T002 [P] Write failing migration carry-over test in tests/integration/migration-carry-over.test.ts: build an in-memory SQLite DB by executing the raw SQL of drizzle/0000–0003 in order (split on `--> statement-breakpoint`), seed people rows with legacy single email/phone values (including NULLs and mixed-case emails), apply drizzle/0004, assert every seeded value reappears as exactly one primary entry on the right person with `created_at` carried from the person row and nothing lost or altered (FR-014, SC-002, research D10)
- [X] T003 [P] Write failing unit tests in tests/unit/validation.test.ts: `entryValueSchema` trims leading/trailing whitespace, rejects empty and whitespace-only values; `updatePersonInputSchema` strips `email`/`phone` keys if sent; `createPersonInputSchema` keeps its existing shape with optional trimmed email/phone (FR-009, FR-015, data-model Validation rules)
- [X] T004 Modify src/server/db/schema.ts: add `personEmails` and `personPhones` tables (id PK autoincrement, personId FK → people.id ON DELETE CASCADE, value text not null, isPrimary integer boolean not null default 0, createdAt) with indexes `person_emails_value_unique` UNIQUE on `lower(value)`, `person_phones_value_unique` UNIQUE on `value`, and partial unique indexes on `(person_id) WHERE is_primary = 1` for each table; drop `email`/`phone` columns and the `people_email_unique` index from `people` (data-model, research D1–D3)
- [X] T005 Generate migration drizzle/0004_*.sql via `npx drizzle-kit generate`, then hand-insert the carry-over statements between table creation and column drop: `INSERT INTO person_emails (person_id, value, is_primary, created_at) SELECT id, email, 1, created_at FROM people WHERE email IS NOT NULL;` and the phones equivalent (research D5) — T002 must now pass
- [X] T006 [P] Modify src/shared/types.ts: add `ContactEntry { id, value, isPrimary, createdAt }`; change `Person` to carry `emails: ContactEntry[]` and `phones: ContactEntry[]` (ordered by id asc) replacing the scalar `email`/`phone` fields (data-model Read models)
- [X] T007 Modify src/shared/validation.ts: add `entryValueSchema` (string, trimmed, min length 1 after trim); split `personInputSchema` into `createPersonInputSchema` (unchanged shape: names + optional trimmed email/phone + extraFields) and `updatePersonInputSchema` (names + extraFields only, unknown keys stripped) — T003 must now pass (FR-009, FR-015, research D8)
- [X] T008 [P] Update tests/integration/people.test.ts to the new contract and watch it fail: person payloads carry `emails`/`phones` arrays ordered by id asc (never scalar email/phone), create person stores provided email/phone as primary entries, update person ignores `email`/`phone` keys in the body, deleting a person cascade-deletes its entries, re-reads confirm persistence (FR-011, FR-013, contracts/http-api.md changed endpoints)
- [X] T009 [P] Update tests/integration/people-search.test.ts to the new contract and watch it fail: the `q` substring search matches first name, last name, and the **primary** email only — a match on a non-primary address must NOT return the person (research D6)
- [X] T010 Reshape src/server/services/people.ts: read model returns `emails`/`phones` arrays ordered by id asc with primary projection helpers; list search joins the primary email entry (`is_primary = 1`); `createPerson` inserts provided email/phone as primary entries in the same transaction (keeping the existing email-conflict pre-check); `updatePerson` handles names + extraFields only — T008/T009 must now pass
- [X] T011 Update src/server/routes/people.ts: create route validates with `createPersonInputSchema`, update route with `updatePersonInputSchema` (no 409 path on update anymore); all person responses use the new shape (contracts/http-api.md changed endpoints)
- [X] T012 [P] Update tests/integration/mcp-read-tools.test.ts and watch it fail: seed entry rows directly via drizzle, then assert `get-person` returns `email`/`phone` as the primary entry values and `null` when a person has no entries of a type, `search-people` returns the primary email and matches primary email only, `get-task` linked-person `email` equals the primary value — output schemas unchanged in shape (FR-012, contracts/mcp-tools.md assertions 1, 2, 4; assertion 3 needs entry removal and lands in US1 via T018)
- [X] T013 Update src/server/mcp/tools.ts so `search-people`, `get-person`, and `get-task` project the primary entry values into their unchanged output shapes — T012 must now pass (research D9)
- [X] T014 [P] Update tests/component/people-page.test.ts (rows show primary email/phone derived from the arrays, empty cell when a person has none of a type) and tests/component/person-form.test.ts (create mode renders the single email and phone inputs, edit mode renders neither), and create tests/component/person-detail-page.test.ts (page shows the person's primary email and phone values from the entry arrays and renders PersonForm in edit mode without contact inputs) — watch all three fail (FR-010, FR-011, FR-015)
- [X] T015 [P] Modify src/client/components/PersonForm.vue: add a create/edit mode prop; contact inputs render in create mode only, and edit submissions send names + extraFields only (FR-015, research D8)
- [X] T016 [P] Modify src/client/pages/PeoplePage.vue: email/phone cells derive the primary entry from `person.emails`/`person.phones`, empty cell when none (FR-010)
- [X] T017 Modify src/client/pages/PersonDetailPage.vue: adapt to the new Person shape (display primary values for now — entry lists arrive in US1) and render PersonForm in edit mode — T014 must now pass, and `npm run typecheck` must be green again

**Checkpoint**: Migration, server, MCP, and client all speak the new shape; all four gate commands pass; user story phases can begin.

---

## Phase 3: User Story 1 - Manage a person's email addresses (Priority: P1) 🎯 MVP

**Goal**: Add, edit in place, mark-primary, and remove email addresses on a person's record, with first-entry-becomes-primary and lowest-id promotion on primary removal, the people list tracking the primary, and every state surviving reload (FR-001–FR-006 for emails, SC-001).

**Independent Test**: Create a person with one email, then add, edit, re-mark primary, and remove addresses on their record, confirming the record and the people-list row after each step and after a page reload (spec US1 Independent Test).

**Note**: Uniqueness/blank rejection behavior is US3; US1 covers the happy paths, promotion, and not-found handling. The DB unique indexes from Phase 2 are the interim backstop.

### Tests for User Story 1 (write first, must fail)

- [X] T018 [P] [US1] Write failing integration tests in tests/integration/contact-entries.test.ts for the email endpoints per contracts/http-api.md: POST `/api/people/:personId/emails` stores the first entry as primary and later entries as non-primary, returning 201 with the refreshed `entries` list; PATCH `.../:entryId` replaces the value and never touches the primary flag (editing the primary keeps it primary); PUT `.../:entryId/primary` moves the marker off the previous primary and re-marking the current primary is a no-op 200; DELETE `.../:entryId` returns 200 with the refreshed list, promotes the lowest-id survivor when the primary is removed, and removing the last entry leaves a valid empty list; unknown person → 404 "Person not found", unknown entry → 404 "Entry not found"; all states persist across a fresh re-read; and extend tests/integration/mcp-read-tools.test.ts with a failing test that after the primary email is removed and the survivor promoted, `get-person` and `search-people` immediately return the promoted value (FR-002–FR-006, FR-013, contracts/mcp-tools.md assertion 3)
- [X] T019 [P] [US1] Write failing component tests in tests/component/contact-entry-list.test.ts: renders the entry values with a primary marker on the primary entry, add/edit/mark-primary/remove controls call the configured endpoints and re-render from the returned `entries` list, a failed action (mocked 400/409 response) shows the server's validation message, empty-state text when no entries; and extend tests/component/person-detail-page.test.ts with a failing test that PersonDetailPage mounts a ContactEntryList for the person's emails (research D11)

### Implementation for User Story 1

- [X] T020 [US1] Create src/server/services/contact-entries.ts: generic add/edit/markPrimary/remove operations parameterized by entry table (emails and phones), each in one transaction — addEntry stores `is_primary = 1` iff the person has no entries of the type; editEntry updates value only; markPrimary clears the old flag then sets the new (no-op if already primary); removeEntry deletes and promotes the lowest-id survivor when the removed entry was primary; typed `not-found` results for unknown person/entry (data-model State transitions, research D3/D4)
- [X] T021 [US1] Add the email sub-resource routes to src/server/routes/people.ts via a generic registration helper (parameterized by type for US2 reuse): POST/PATCH/PUT-primary/DELETE under `/api/people/:personId/emails` with the contract's status codes and `{ entries }` responses — T018 must now pass
- [X] T022 [US1] Create src/client/components/ContactEntryList.vue: generic list parameterized by props (heading, empty-state text, API base path) with entry values, primary marker, add input, per-entry inline edit/mark-primary/remove controls, and the validation message from the last failed action, re-rendering from each server response — T019 must now pass (research D11)
- [X] T023 [US1] Update src/client/pages/PersonDetailPage.vue: mount ContactEntryList for emails (replacing the interim primary-email display from T017) — T019's person-detail-page test must now pass
- [X] T024 [US1] Run the browser-tester agent against `npm run dev` for the US1 scenarios (create Sam Rivera with email+phone → both primary on record and list row; add second email; edit it in place; mark it primary and watch the list row follow; remove the primary → survivor promoted; remove the last → empty cell; reload after each step) and save evidence into docs/evidence/multiple-emails-and-phones/ (SC-001, quickstart Browser evidence 1)

**Checkpoint**: Email management fully works end to end — US1 is independently shippable (MVP).

---

## Phase 4: User Story 2 - Manage a person's phone numbers (Priority: P2)

**Goal**: The same add/edit/mark-primary/remove model for phone numbers, with exact-text values, promotion on primary removal, and the people list tracking the primary phone (FR-001–FR-006 for phones).

**Independent Test**: Take a person with one phone number, add a second number, mark it primary, and confirm the record and people-list row after each step and after a page reload (spec US2 Independent Test).

### Tests for User Story 2 (write first, must fail)

- [X] T025 [P] [US2] Extend tests/integration/contact-entries.test.ts with failing tests for the phone endpoints: POST `/api/people/:personId/phones` first-entry-primary, add a second phone and PUT it primary (marker moves), PATCH `.../:entryId` edits a phone value in place without touching the primary flag (FR-004), DELETE the primary → lowest-id survivor promoted, removing the last phone leaves a valid empty list, values are stored as exact text ("555-0100" kept verbatim), 404 cases mirror emails; and extend tests/component/person-detail-page.test.ts with a failing test that PersonDetailPage mounts a second ContactEntryList for the person's phones (spec US2 scenarios)

### Implementation for User Story 2

- [X] T026 [US2] Register the phone sub-resource routes in src/server/routes/people.ts by instantiating the T021 generic helper for `phones` against `person_phones` — T025's integration tests must now pass
- [X] T027 [US2] Update src/client/pages/PersonDetailPage.vue: mount a second ContactEntryList for phones (replacing the interim primary-phone display) — T025's person-detail-page test must now pass
- [X] T028 [US2] Run the browser-tester agent for the US2 scenarios (add second phone, mark it primary, people-list row follows, remove both → empty cell, reload-checked) and save evidence into docs/evidence/multiple-emails-and-phones/ (quickstart Browser evidence 2)

**Checkpoint**: Phones behave identically to emails; US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Duplicate and blank values are rejected (Priority: P3)

**Goal**: Every duplicate (email case-insensitive, phone exact-text) and blank value is rejected with the exact contract message and zero data change, on entry add/edit and on person create (FR-007–FR-009, FR-011, SC-003, SC-004).

**Independent Test**: With two people, attempt to add one person's email/phone to the other, the person's own email in different letter-case, and a whitespace-only value; confirm each rejection message and that all lists are unchanged (spec US3 Independent Test).

### Tests for User Story 3 (write first, must fail)

- [X] T029 [P] [US3] Extend tests/integration/contact-entries.test.ts with failing rejection tests: adding another person's email or the person's own email in different case → 409 "That email is already in use"; adding another person's exact phone → 409 "That phone number is already in use"; "555-0100" and "5550100" coexist on different people (no normalization); editing an entry to a colliding value → 409, while re-casing an entry's own value in place succeeds (self-exclusion); blank or whitespace-only value on add and edit → 400 "A value is required"; after every rejection a fresh re-read shows all lists unchanged (FR-007–FR-009, SC-003, SC-004)
- [X] T030 [P] [US3] Extend tests/integration/people.test.ts with failing create-person rejection tests: creating a person with a phone another person already has → 409 "That phone number is already in use" and no person row is created; when both email and phone conflict, the email message wins (checked first); existing email-conflict behavior still intact (FR-011, contracts/http-api.md POST /api/people)
- [X] T031 [P] [US3] Extend tests/component/person-form.test.ts with a failing test: create-mode submit receiving a 409 phone-conflict response surfaces "That phone number is already in use" to the user and creates nothing (FR-011)

### Implementation for User Story 3

- [X] T032 [US3] Add uniqueness pre-checks to src/server/services/contact-entries.ts: email conflict query on `lower(value)` across all entries, phone conflict on exact `value`, both excluding the entry's own id on edits; return typed `email-conflict`/`phone-conflict` results before any write (research D2, data-model Failure modes)
- [X] T033 [US3] Map the conflict results to 409 with the exact messages in the entry routes in src/server/routes/people.ts, and add the phone-uniqueness pre-check to `createPerson` in src/server/services/people.ts (email checked first; any conflict aborts the whole creation) with its 409 mapping in the create route — T029/T030 must now pass
- [X] T034 [US3] Update src/client/components/PersonForm.vue to surface the phone-conflict message from a create 409 alongside the existing email-conflict handling — T031 must now pass
- [X] T035 [US3] Run the browser-tester agent for the US3 scenarios (own email in different case, another person's email, another person's phone, whitespace-only value — each rejected with its exact message, lists unchanged) and save evidence into docs/evidence/multiple-emails-and-phones/ (SC-003, quickstart Browser evidence 3)

**Checkpoint**: All three stories complete with rejection semantics enforced end to end.

---

## Phase 6: Polish & Verification

**Purpose**: Final gate and independent confirmation per the constitution's Definition of Done.

- [X] T036 Run the full verification gate (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) and confirm all pass with zero regressions (quickstart Automated checks)
- [X] T037 Run the verifier agent to independently cross-check every FR-001–FR-015 and SC-001–SC-004 against test output and the browser evidence in docs/evidence/multiple-emails-and-phones/ before reporting the feature done (constitution Principle III)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories (the migration drops the old columns, so nothing works on the old shape afterward)
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on Foundational; reuses the generic route helper (T021) and ContactEntryList (T022) from US1 — implement after US1 (or in parallel if T020–T022 are done)
- **US3 (Phase 5)**: depends on the contact-entries service (T020) and routes (T021/T026) existing — implement after US1 (email rejections) and ideally after US2 (phone rejections)
- **Polish (Phase 6)**: depends on all three stories

### Key Task Dependencies

- T002 → T005 (migration test fails until the migration exists); T004 → T005 (drizzle-kit generates from the schema)
- T003 → T007; T006 → T007 → T010; T008/T009 → T010 → T011
- T010 → T013 (MCP projects via the read model); T012 → T013
- T014 → T015/T016/T017; T006 → T015/T016/T017
- T018 → T020 → T021; T019 → T022 → T023
- T021 → T026; T022 → T027; T025 → T026; T025 → T027 (the person-detail-page phones test precedes the mount)
- T029/T030 → T032 → T033; T031 → T034

### Parallel Opportunities

- Phase 2: T002 + T003 together; T006 alongside T004; T008 + T009 + T012 + T014 together once T006/T007 exist; T015 + T016 in parallel (different files)
- Phase 3: T018 + T019 together (server vs component tests); T020/T021 and T022 proceed in parallel (server vs client)
- Phase 5: T029 + T030 + T031 together
- US2 and US3 test-writing (T025, T029–T031) can start as soon as US1 implementation lands

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Phase 1–2: baseline, then migrate the data model and reshape every existing surface to the new Person shape — the gate must be green again at the Phase 2 checkpoint.
2. Phase 3: deliver email management end to end (US1) — this is the shippable MVP; email is the reason the feature exists (ingestion matching).
3. **STOP and VALIDATE**: run the gate, exercise the US1 independent test, capture browser evidence.

### Incremental Delivery

1. Foundational checkpoint → all existing behavior preserved on the new schema (carry-over proven by T002).
2. US1 → emails manageable, people list tracks primary → validate → MVP.
3. US2 → phones ride the generic service/component with ~4 tasks → validate.
4. US3 → uniqueness/blank rejection with exact messages everywhere → validate.
5. Phase 6 → gate + verifier, then PR.

### Notes

- TDD ordering is mandatory: within every phase, the test tasks must be written and observed failing before their implementation tasks start.
- Commit after each red→green pair or logical group (Conventional Commits).
- The people-list primary display (FR-010), MCP projection (FR-012), edit-form contact removal (FR-015), and migration carry-over (FR-014) land in Phase 2 because the column drop forces every surface onto the new shape at once; the story phases then layer the entry-management interactions on top.
