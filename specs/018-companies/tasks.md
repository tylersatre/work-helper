# Tasks: Companies

**Input**: Design documents from `/specs/018-companies/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, contracts/mcp-tools.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires a failing test before the code that makes it pass. Every implementation task below is preceded by its failing-test task; code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story (US1–US7, priorities P1–P7 from spec.md) so each story is an independently completable, testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US7); Setup/Foundational/Polish tasks carry no story label
- Every task names its exact file path(s)

## Path Conventions

Single TypeScript web app at repository root: Vue SPA in `src/client/`, Fastify API in `src/server/`, MCP server in `src/server/mcp/`, shared types/validation in `src/shared/`, migrations in `drizzle/`, tests in `tests/integration/` and `tests/component/`.

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline before any feature work.

- [X] T001 Confirm dependencies are installed in this worktree and record a clean baseline by running `npm run lint && npm run typecheck && npm test && npm run build` on branch `018-companies` before any changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three new tables and the `people.company_id` column that every user story reads or writes, shipped as one additive, data-preserving migration.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Write failing assertions in tests/integration/migration-upgrade.test.ts extending the fresh-vs-upgraded parity check to cover the `companies`, `task_companies`, and `company_tags` tables, the `companies_name_unique` index on `lower(name)`, and the nullable `people.company_id` column, and asserting pre-existing rows survive the upgrade
- [X] T003 Add to src/server/db/schema.ts per data-model.md: `companies` table (id PK autoincrement, name text NOT NULL, createdAt epoch-ms) with `uniqueIndex('companies_name_unique')` on `lower(name)`; `taskCompanies` join table (taskId + companyId composite PK, both FKs `onDelete: 'cascade'`); `companyTags` join table (companyId + tagId composite PK, both FKs `onDelete: 'cascade'`); nullable `companyId` column on `people` referencing companies with `onDelete: 'set null'`
- [X] T004 Generate drizzle/0002_*.sql via `npx drizzle-kit generate`, review that the SQL is purely additive (3× CREATE TABLE, 1× CREATE UNIQUE INDEX, 1× ALTER TABLE people ADD COLUMN), hand-adjust any `people` table-recreate to the plain ADD COLUMN form per D4, confirm migrations 0000/0001 are untouched (`git diff main -- drizzle/`), and verify the T002 test now passes

**Checkpoint**: Schema and migration landed, migration-upgrade test green — user story phases can begin.

---

## Phase 3: User Story 1 - Manage companies on a dedicated page (Priority: P1) 🎯 MVP

**Goal**: A Companies nav link, an alphabetical Companies list page with create-by-name (trimmed, required, case-insensitively unique), and a company detail page with rename and styled empty states for people/cards/tags.

**Independent Test**: Open the Companies page from the nav, create companies, attempt blank and case-duplicate names, open a detail page, and rename — with no people, cards, or tags involved.

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T005 [P] [US1] Write failing integration tests in tests/integration/companies.test.ts: POST /api/companies creates (201, name trimmed before save and uniqueness check); GET /api/companies lists alphabetically case-insensitively; GET /api/companies?q= filters by case-insensitive substring on name; blank/whitespace-only name → 400 `{ error: { message: "A name is required" } }`; case-insensitive duplicate → 409 `{ error: { message: "That company name is already in use" } }`; GET /api/companies/:id returns CompanyDetail with empty people/cards/tags arrays and 404 for a missing id; PATCH /api/companies/:id renames with the same 400/409 contract, allows renaming to a different casing of the company's own name, and 404s on a missing id
- [X] T006 [P] [US1] Write failing component tests in tests/component/companies-page.test.ts: styled empty state when no companies exist, alphabetical list rendering, create form success appends to list, and visible validation messages for blank and duplicate names
- [X] T007 [P] [US1] Write failing component tests in tests/component/company-detail.test.ts: detail page shows the company name, styled empty-state messages for the people, cards, and tags sections, and a rename flow that updates the displayed name and surfaces the 400/409 validation messages
- [X] T008 [P] [US1] Extend tests/component/app-shell.test.ts with failing assertions: the top navigation includes a "Companies" link routing to /companies and marks Companies as the active section (aria-current) while on it

### Implementation for User Story 1

- [X] T009 [P] [US1] Add `Company { id, name }` and `CompanyDetail { id, name, people, cards, tags }` types to src/shared/types.ts and `companyNameSchema = z.string().trim().min(1, 'A name is required')` to src/shared/validation.ts per D11
- [X] T010 [US1] Implement src/server/services/companies.ts: `createCompany`, `listCompanies(q?)` (name COLLATE NOCASE ordering, `instr(lower(name), lower(q))` filtering), `getCompanyDetail` (people ordered lastName/firstName NOCASE, cards ordered title NOCASE, tags — all empty-capable), `renameCompany`, and a `findCompanyByNameCaseInsensitive(db, name, excludeId?)` helper, returning discriminated results (`{ ok: true } | { ok: false; error: 'invalid-name' | 'name-taken' | 'not-found' }`) per the tags-service pattern
- [X] T011 [US1] Implement src/server/routes/companies.ts (GET /api/companies with optional ?q=, POST /api/companies, GET /api/companies/:id, PATCH /api/companies/:id mapping service errors to 400/409/404 with the contract messages) and register companyRoutes in src/server/app.ts — T005 goes green
- [X] T012 [US1] Add /companies and /companies/:id routes to src/client/router.ts and the Companies nav link with activeSection mapping to src/client/App.vue — T008 goes green
- [X] T013 [US1] Implement src/client/pages/CompaniesPage.vue: alphabetical list, create-by-name form with inline validation messages, styled NEmpty empty state, rows linking to detail — T006 goes green
- [X] T014 [US1] Implement src/client/pages/CompanyDetailPage.vue: company name display, rename control with validation messages, and people/cards/tags sections rendering styled empty states — T007 goes green

**Checkpoint**: US1 fully functional — companies can be created, listed, opened, and renamed; MVP deliverable.

---

## Phase 4: User Story 2 - Assign a person to a company (Priority: P2)

**Goal**: A company field on the person edit form (search existing companies, set/switch/clear), the person's record showing their company, and each company's detail page listing exactly its assigned people.

**Independent Test**: Seed two companies and one person, then set, switch, and clear the person's company while checking the person record and both companies' detail pages.

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T015 [P] [US2] Write failing integration tests (person-assignment block) in tests/integration/company-links.test.ts: PUT /api/people/:id with `companyId: number` sets and switches the assignment, `companyId: null` clears it, omitted `companyId` leaves it unchanged, a missing company id → 400 `{ error: { message: "Company not found" } }` with the person unchanged; GET /api/people/:id includes `company: Company | null`; GET /api/companies/:id people section lists exactly the currently assigned people ordered lastName/firstName NOCASE
- [X] T016 [P] [US2] Extend tests/component/person-form.test.ts with failing assertions: the form offers a company field that searches companies by substring (no create option offered), selecting sets the company, and the field supports switching to another company and clearing to none
- [X] T017 [P] [US2] Extend tests/component/company-detail.test.ts with failing assertions: a populated people section renders the assigned people ordered by last name, replacing the empty state

### Implementation for User Story 2

- [X] T018 [US2] Add `company: Company | null` to the Person type in src/shared/types.ts, populate company on the person detail and implement set/clear assignment (validating the company exists) in src/server/services/people.ts, and accept the optional `companyId: number | null` field on PUT in src/server/routes/people.ts — T015 goes green
- [X] T019 [US2] Implement src/client/components/CompanyPicker.vue: debounced (300ms) search-select against GET /api/companies?q= supporting set, switch, and clear, offering existing companies only
- [X] T020 [US2] Wire CompanyPicker into src/client/components/PersonForm.vue, show the current company on src/client/pages/PersonDetailPage.vue, and render populated people entries in the CompanyDetailPage.vue people section — T016 and T017 go green

**Checkpoint**: US1 and US2 work independently — person assignment round-trips between person records and company detail pages.

---

## Phase 5: User Story 3 - Link companies to kanban cards (Priority: P3)

**Goal**: A linked-companies search on the card detail view to add and remove existing companies, with each company's detail page listing its linked cards.

**Independent Test**: Seed one card and two companies, add both companies to the card, remove one, and check the card's detail view and both companies' cards sections.

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T021 [P] [US3] Write failing integration tests (card-links block) in tests/integration/company-links.test.ts: POST /api/tasks/:id/companies links a company and returns the full updated TaskDetail including `companies: Company[]` (ordered name NOCASE); linking an already-linked company is a no-op returning the unchanged detail; DELETE /api/tasks/:id/companies/:companyId unlinks and returns the updated detail; 404 for missing task or company; GET /api/tasks/:id includes `companies`; GET /api/companies/:id cards section lists exactly the linked cards ordered title NOCASE
- [X] T022 [P] [US3] Write failing component tests in tests/component/linked-companies.test.ts: search suggests existing companies by substring, excludes companies already linked to the card, offers no create option, adding shows the company on the card, and removing takes it away
- [X] T023 [P] [US3] Extend tests/component/company-detail.test.ts with failing assertions: a populated cards section renders the linked cards ordered by title, replacing the empty state

### Implementation for User Story 3

- [X] T024 [US3] Add `companies: Company[]` to the TaskDetail type in src/shared/types.ts, implement link/unlink functions in src/server/services/companies.ts, include companies in the task detail assembly in src/server/services/tasks.ts, and add POST /api/tasks/:id/companies + DELETE /api/tasks/:id/companies/:companyId to src/server/routes/tasks.ts mirroring the task-people routes — T021 goes green
- [X] T025 [US3] Implement src/client/components/LinkedCompanies.vue: debounced search against GET /api/companies?q= excluding already-linked ids client-side, add via POST, remove via DELETE, rendering the card's current companies (mirrors LinkedPeople.vue)
- [X] T026 [US3] Host LinkedCompanies in src/client/pages/TaskDetailPage.vue and render populated card entries in the CompanyDetailPage.vue cards section — T022 and T023 go green

**Checkpoint**: US1–US3 work independently — card links round-trip between card detail and company detail pages.

---

## Phase 6: User Story 4 - Browse a large company without clutter (Priority: P4)

**Goal**: The company detail page's people and cards sections each show a first page of 25 with an independent load-more control that reveals the remainder in one activation, and no control at 25 or fewer.

**Independent Test**: Stub a company detail with 30 people and 30 cards, open the page, and activate each section's load-more control independently.

### Tests for User Story 4 (write first, must fail) ⚠️

- [X] T027 [US4] Extend tests/component/company-detail.test.ts with failing assertions: with 30 people and 30 cards the people section shows the first 25 with a load-more control and the cards section independently shows its first 25 with its own control; one activation of a control reveals that section's full 30 without affecting the other section; with 25 or fewer entries a section shows everything and no control

### Implementation for User Story 4

- [X] T028 [US4] Implement per-section client-side truncation in src/client/pages/CompanyDetailPage.vue: a `showAll` ref per section, `visible = showAll ? all : all.slice(0, 25)`, and a load-more button rendered only when more than 25 entries exist (PersonEmailSection.vue pattern, per D7) — T027 goes green

**Checkpoint**: US4 complete — detail sections paginate independently client-side; no server change.

---

## Phase 7: User Story 5 - Tag a company from the shared tag pool (Priority: P5)

**Goal**: The company detail page offers the same tag input pattern as people and tasks — suggesting existing tags from the single shared vocabulary, rendering attached tags as chips — without ever creating a duplicate tag record.

**Independent Test**: Create a tag on a person or task, attach it to a company via the suggestion input, and confirm the Tags page still lists exactly one such tag.

### Tests for User Story 5 (write first, must fail) ⚠️

- [X] T029 [P] [US5] Write failing integration tests (tag-attachments block) in tests/integration/company-links.test.ts: POST /api/companies/:id/tags accepts `{ tagId }` XOR `{ name }` (both or neither → 400 "Provide a tagId or a name"; blank name → 400 "A name is required"); attaching a name that case-insensitively matches an existing tag attaches that tag without creating a duplicate record; DELETE /api/companies/:id/tags/:tagId detaches and returns the remaining tags; 404 for missing company, missing tagId, or unattached tag; GET /api/companies/:id includes the attached tags
- [X] T030 [P] [US5] Extend tests/component/company-detail.test.ts with failing assertions: the tags section hosts the shared TagInput (suggesting existing tags case-insensitively, excluding already-attached ones), a selected suggestion appears as a chip, and a chip can be detached

### Implementation for User Story 5

- [X] T031 [US5] Implement company tag attach/detach in src/server/services/companies.ts reusing the tags service's AttachInput resolution, and add POST /api/companies/:id/tags + DELETE /api/companies/:id/tags/:tagId to src/server/routes/companies.ts mirroring the person/task tag routes — T029 goes green
- [X] T032 [US5] Mount the existing TagInput.vue and TagChip.vue in the CompanyDetailPage.vue tags section wired to the company tag endpoints — T030 goes green

**Checkpoint**: US5 complete — companies share the single tag vocabulary; the Tags page count never changes from attaching existing tags.

---

## Phase 8: User Story 6 - Delete a company safely (Priority: P6)

**Goal**: Delete from the detail page behind a confirmation stating linked people/card counts (even 0/0); cancel changes nothing; confirm removes the company and all its links everywhere while people, cards, and tags survive.

**Independent Test**: Seed a company linked to one person, one card, and one tag; cancel a delete, then confirm a delete, checking every surface the company appeared on.

### Tests for User Story 6 (write first, must fail) ⚠️

- [X] T033 [P] [US6] Write failing integration tests (delete block) in tests/integration/companies.test.ts: DELETE /api/companies/:id returns 204 and 404s on a missing id; after deleting a company linked to a person, a card, and a tag, the person still exists with `company: null`, the task still exists with the company absent from `companies`, the tag still exists on GET /api/tags, and the company is gone from GET /api/companies
- [X] T034 [P] [US6] Extend tests/component/company-detail.test.ts with failing assertions: the delete control opens a confirmation naming the linked people and card counts derived from the loaded detail (including "0 people and 0 cards"); cancelling closes the modal with no request made; confirming issues the DELETE and navigates back to /companies

### Implementation for User Story 6

- [X] T035 [US6] Implement `deleteCompany` in src/server/services/companies.ts (FK actions clear assignments and cascade join rows per data-model.md), add DELETE /api/companies/:id to src/server/routes/companies.ts (204/404), and add the TagsPage-pattern confirm modal with counts, cancel, and confirm-then-navigate to src/client/pages/CompanyDetailPage.vue — T033 and T034 go green

  **Note**: drizzle-kit's generated `ALTER TABLE people ADD company_id ...` (migration `0002_long_prism.sql`, landed in Phase 2) omitted the `ON DELETE SET NULL` clause despite the schema specifying `onDelete: 'set null'`, causing `DELETE /api/companies/:id` to fail with a foreign key constraint error whenever a person was assigned. Hand-adjusted the migration to `REFERENCES companies(id) ON DELETE SET NULL` — migration 0002 had not landed on `main`, so this is a same-branch fix, not an edit to an already-shipped migration.

**Checkpoint**: US6 complete — full company lifecycle in the web app.

---

## Phase 9: User Story 7 - Agents get full company parity over MCP (Priority: P7)

**Goal**: Eight new MCP tools (create-company, rename-company, delete-company, list-companies, get-company, set-person-company, add-company-to-task, remove-company-from-task) plus company fields on get-person/get-task, all calling the same services as the HTTP routes so web and MCP state are mutually visible.

**Independent Test**: Drive the full company lifecycle through MCP tool calls with a real SDK client and cross-check each result through the HTTP API in the same app instance.

### Tests for User Story 7 (write first, must fail) ⚠️

- [X] T036 [US7] Write failing integration tests in tests/integration/mcp-company-tools.test.ts using the real SDK `Client` over `StreamableHTTPClientTransport` (mcp-read-tools.test.ts recipe): create-company → list-companies → get-company (id, name, empty people/cards/tags) → rename-company (own-casing recasing allowed) → delete-company lifecycle with text outputs per contracts/mcp-tools.md; validation errors worded identically to HTTP ("A name is required", "That company name is already in use", `Company <id> not found`); set-person-company sets, switches, and clears (null) with `Person <id> not found`/`Company <id> not found` errors; add-company-to-task links (already-linked no-op) and remove-company-from-task unlinks; get-person includes `company: { id, name } | null` and get-task includes `companies: [{ id, name }]`; every MCP mutation is visible through the HTTP API and vice versa within the same app instance

### Implementation for User Story 7

- [X] T037 [US7] Register create-company, rename-company, delete-company, list-companies, and get-company in src/server/mcp/tools.ts with a module-scope `companySummarySchema` raw zod shape, `toolError` messages identical to the HTTP layer, delete text reporting cleared assignment and removed link counts, and get-company returning complete unpaginated people/cards lists with tags flattened to names — all calling src/server/services/companies.ts
- [X] T038 [US7] Register set-person-company, add-company-to-task, and remove-company-from-task in src/server/mcp/tools.ts returning the person/task detail shapes, and extend those shared shapes so get-person (and every tool returning the person shape) carries `company` and get-task (and every tool returning the task detail) carries `companies` — T036 goes green

**Checkpoint**: All seven user stories complete — full MCP parity with the web app.

---

## Phase 10: Polish & Verification Gate

**Purpose**: The constitution's evidence-over-assertion gate — automated checks, browser evidence, MCP evidence, and independent verification before the PR.

- [X] T039 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` and confirm all four pass
- [X] T040 [P] Re-run the migration safety check from quickstart.md: `ls drizzle/` shows exactly one new 0002_*.sql and `git diff main -- drizzle/` shows only additive statements with 0000/0001 untouched
- [X] T041 [P] Run the browser-tester agent against the dev server (API :3018, UI :5118) covering the acceptance scenarios of US1–US6 (including reload-persistence checks) and save screenshot + results evidence to docs/evidence/018-companies/
- [X] T042 [P] Record the passing tests/integration/mcp-company-tools.test.ts output as the US7 (SC-008) evidence in docs/evidence/018-companies/
- [X] T043 Run the verifier agent to independently confirm every acceptance criterion in specs/018-companies/spec.md has a passing automated check and surface-appropriate evidence before opening the PR

  **Note**: First verifier pass returned FAIL on three gaps: (1) US2's "person's record shows their current company" (FR-008) had no automated check and no browser evidence of the populated state — fixed by adding `tests/component/person-detail-page.test.ts` coverage for `data-testid="person-company"` and capturing `us2-04-person-record-shows-company.png`; (2) US7 AS2's "Globex's own MCP detail response lists Sam Rivera among its people and the card among its cards" was untested — fixed by adding a `get-company` populated-detail test to `tests/integration/mcp-company-tools.test.ts` and re-recording the evidence output; (3) the evidence bundle and this file weren't yet committed — fixed by this commit.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (every story reads or writes the new tables/column)
- **User Stories (Phases 3–9)**: All depend on Foundational completion
  - **US1 (P1)**: No dependencies on other stories — the MVP
  - **US2 (P2)**: Needs companies to exist to assign, so US1's service/routes (T010–T011) must be in place; UI-independent of US1's pages beyond the detail page's people section
  - **US3 (P3)**: Needs US1's service/routes; independent of US2
  - **US4 (P4)**: Touches only CompanyDetailPage.vue and its test — needs US1's detail page (T014); richer with US2/US3 data but testable via stubs without them
  - **US5 (P5)**: Needs US1's service/routes/detail page; independent of US2–US4
  - **US6 (P6)**: Needs US1's service/routes/detail page; its cross-surface assertions exercise US2/US3/US5 links, so it is sequenced after them
  - **US7 (P7)**: Mirrors the full UI surface — depends on US1, US2, US3, US5, and US6 services being complete
- **Polish (Phase 10)**: Depends on all user stories being complete

### Within Each User Story

- Test tasks are written first and MUST fail before their implementation tasks run
- Shared types before services, services before routes, routes before UI components
- Story complete (tests green) before moving to the next priority

### Parallel Opportunities

- All test tasks within a story marked [P] (e.g. T005–T008) target different files and can be written concurrently
- Once Foundational completes, US2 and US3 could proceed in parallel after US1's T010–T011 land (they touch disjoint server/client files); US4 and US5 only need US1
- T040, T041, and T042 in Polish are independent evidence tasks

---

## Parallel Example: User Story 1

```bash
# Write all four failing US1 test files concurrently:
Task: "T005 integration tests in tests/integration/companies.test.ts"
Task: "T006 component tests in tests/component/companies-page.test.ts"
Task: "T007 component tests in tests/component/company-detail.test.ts"
Task: "T008 nav assertions in tests/component/app-shell.test.ts"

# Then implement sequentially: T009 (shared types) → T010 (service) → T011 (routes) → T012 (router/nav) → T013–T014 (pages)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (baseline) and Phase 2 (schema + migration — the only migration of the feature)
2. Complete Phase 3: US1 — Companies page, create, detail, rename
3. **STOP and VALIDATE**: run tests/integration/companies.test.ts and the component suite; walk quickstart.md step 1 in the browser
4. US1 alone is a shippable slice: companies exist, are listed, and can be renamed

### Incremental Delivery

1. Setup + Foundational → migration landed, parity test green
2. US1 → companies CRUD-minus-delete in the UI (MVP)
3. US2 → person assignment; US3 → card links (independently testable, could parallelize)
4. US4 → load-more polish; US5 → shared tags
5. US6 → safe delete completing the lifecycle
6. US7 → MCP parity over the finished service surface
7. Polish → gate, evidence, verifier, PR

Each story adds value without breaking previous stories; every checkpoint is a valid stopping point.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Verify each test task fails (red) before starting its implementation task; the Stop hook enforces the lint/typecheck/test/build gate
- Commit after each task or logical group with Conventional Commits
- The single migration (T004) is the only schema change — nothing after Phase 2 touches drizzle/
- Validation messages are shared verbatim between HTTP and MCP layers ("A name is required", "That company name is already in use") — tests assert exact wording
