# Phase 0 Research: Companies

No NEEDS CLARIFICATION markers remained in the Technical Context — the stack is fully established by the existing codebase. Research therefore focused on locating the in-repo precedent for each design decision so the feature mirrors proven patterns instead of inventing new ones. Each decision below records what was chosen, why, and what was rejected.

## D1. Company table shape and name uniqueness

**Decision**: New `companies` table — `id` (autoincrement PK), `name` (text, not null), `createdAt` (epoch-ms integer) — with `uniqueIndex('companies_name_unique').on(sql`lower(${t.name})`)` enforcing case-insensitive uniqueness at the database level, plus service-level pre-checks for friendly error messages.

**Rationale**: This is byte-for-byte the `tags` table pattern (`src/server/db/schema.ts:177-186`), which already implements the exact FR-002 semantics: trimmed, non-empty, case-insensitively unique names with rename-to-own-casing allowed (`findTagByNameCaseInsensitive(db, name, excludeId?)` in `src/server/services/tags.ts:26-38`). The DB index is a backstop; the service check produces the 409 message.

**Alternatives considered**: A separate normalized `name_lower` column (rejected — the functional index on `lower(name)` already works in the deployed schema for tags and email addresses); app-level-only uniqueness (rejected — a race or bug could silently corrupt the invariant the whole feature rests on).

## D2. Person→company assignment: nullable FK column on `people`

**Decision**: Add nullable `companyId` column to `people`: `integer('company_id').references(() => companies.id, { onDelete: 'set null' })`.

**Rationale**: The spec fixes "a person belongs to at most one company" (FR-001), which is exactly a nullable FK — a join table would model many-to-many and is explicitly out of scope ("employer model, not many-to-many"). `onDelete: 'set null'` makes company deletion clear every assignment automatically; the precedent is `emailAddresses.personId` (`schema.ts:27`), and `createDb` sets `pragma('foreign_keys = ON')` (`src/server/db/index.ts`), so the action is enforced in every environment including production.

**Alternatives considered**: `person_companies` join table with a uniqueness constraint (rejected — models the wrong cardinality and complicates every read); explicit `UPDATE people SET company_id = NULL` inside the delete service instead of the FK action (rejected as the primary mechanism — the FK action is declarative and matches existing schema style — but the delete test will assert the cleared assignment either way).

## D3. Card↔company links and company↔tag attachments: join tables

**Decision**: `task_companies` (`taskId` + `companyId`, composite PK, both FKs `onDelete: 'cascade'`) mirroring `task_people` (`schema.ts:154-165`), and `company_tags` (`companyId` + `tagId`, composite PK, both cascade) mirroring `person_tags` (`schema.ts:188-199`).

**Rationale**: Both relationships are many-to-many per FR-001/FR-011. The composite PK makes duplicate links structurally impossible (edge case: re-adding an already-linked company). Cascade from `companies` implements FR-012's "removes it from every linked card, detaches its tags" on delete; cascade from `tasks`/`tags` keeps existing delete behavior consistent.

**Alternatives considered**: A generic polymorphic `taggables`/`linkables` table (rejected — the codebase deliberately uses one join table per pair, `person_tags`/`task_tags`, and consistency beats abstraction at this scale).

## D4. Migration strategy

**Decision**: One new migration `drizzle/0002_*.sql` generated via `npx drizzle-kit generate` after editing `schema.ts`: three `CREATE TABLE` statements and one `ALTER TABLE people ADD COLUMN company_id integer REFERENCES companies(id)`. Review the generated SQL before committing; if drizzle-kit emits a table-recreate for the `people` column (SQLite sometimes requires this for constraint changes), hand-adjust to the plain `ADD COLUMN` form, which SQLite permits for a nullable FK column with no default.

**Rationale**: Purely additive — no existing row is touched, so production data is safe by construction (constitution "Data & migrations"). Migrations `0000`/`0001` remain untouched. The existing `tests/integration/migration-upgrade.test.ts` fresh-vs-upgraded parity test will be extended to prove an upgraded production database and a fresh dev database converge on the same schema.

**Alternatives considered**: Multiple migrations (one per table) — rejected, one atomic migration per feature matches the two existing migrations' granularity and simplifies review.

## D5. HTTP API shape and error contract

**Decision**: New `src/server/routes/companies.ts` + `src/server/services/companies.ts` following the tags-feature contract exactly: services return discriminated results (`{ ok: true; ... } | { ok: false; error: 'invalid-name' | 'name-taken' | 'not-found' }`), routes map them to statuses with `{ error: { message } }` bodies — 400 "A name is required", 409 "That company name is already in use", 404 "Company not found", 201 on create, 204 on delete. Person assignment rides the existing `PUT /api/people/:id` (new optional `companyId: number | null` field); card links get `POST /api/tasks/:id/companies` + `DELETE /api/tasks/:id/companies/:companyId` returning the full updated task detail, mirroring the task-people link routes (`routes/tasks.ts:94-116`); company tag attach/detach mirrors the person/task tag routes. Full contract in [contracts/http-api.md](contracts/http-api.md).

**Rationale**: Every shape is copied from a shipped, tested route; the client code and tests for those precedents translate mechanically. Returning the full updated record from link/unlink endpoints is the established idiom (`LinkedPeople.vue` consumes it) and keeps the UI state-sync trivial.

**Alternatives considered**: A dedicated `PATCH /api/people/:id/company` endpoint (rejected — `PUT /api/people/:id` already carries the whole editable person and the edit form submits once); REST-purist `PUT /api/tasks/:id/companies/:companyId` for links (rejected — POST-body form matches the task-people precedent).

## D6. Search endpoints for the two pickers

**Decision**: `GET /api/companies?q=<substring>` performs case-insensitive substring match on name via `instr(lower(name), lower(q))`, returning all companies alphabetically (`COLLATE NOCASE`) when `q` is absent. Both pickers (person edit form, card linked-companies) consume it; exclusion of already-linked/selected companies happens client-side in the component.

**Rationale**: Mirrors `GET /api/people?q=` (`services/people.ts:140-164`) that the task linked-people picker uses — the spec's stated precedent. Client-side exclusion matches `TagInput.vue` (filters already-attached tags out of suggestions) and keeps the endpoint reusable for the Companies list page itself.

**Alternatives considered**: Server-side `excludeTaskId` param (rejected — the client already holds the linked list, and TagInput proves client filtering works); a separate `/api/companies/search` endpoint (rejected — People merges list+search into one endpoint).

## D7. Company detail sections: sorting and load-more

**Decision**: The detail endpoint returns complete people and cards lists — people ordered `lastName COLLATE NOCASE, firstName COLLATE NOCASE` (the People-page expression, `services/people.ts:161`), cards ordered `title COLLATE NOCASE`. The Vue page truncates each section client-side: a per-section `showAll` ref, `visible = showAll ? all : all.slice(0, 25)`, and a load-more button rendered only when more than 25 exist — one activation reveals the full list (SC-005).

**Rationale**: Client-side truncation is the `PersonEmailSection.vue` precedent (`showAll` + slice + "Show all" button) and satisfies the spec assumption that MCP returns unpaginated full lists — one endpoint serves both consumers. At personal-CRM scale (tens of links), shipping the full list is cheaper than a cursor protocol; the email keyset-cursor machinery exists for genuinely large tables and is not needed here.

**Alternatives considered**: Server-side cursor pagination like `GET /api/emails/conversations` (rejected — forces MCP and UI onto different code paths and contradicts the spec assumption of unpaginated MCP detail); incremental +25 reveals (rejected — SC-005 says one activation reveals the remainder).

## D8. MCP tool surface

**Decision**: Eight new tools registered in `src/server/mcp/tools.ts` with the existing `registerTool` + raw-zod-shape pattern: `create-company`, `rename-company`, `delete-company`, `list-companies`, `get-company`, `set-person-company` (nullable `companyId` clears), `add-company-to-task`, `remove-company-from-task`. `get-person` gains `company: { id, name } | null`; `get-task` gains `companies: { id, name }[]`. All failure paths use the `toolError(message)` helper with messages worded identically to the HTTP layer. Full contract in [contracts/mcp-tools.md](contracts/mcp-tools.md).

**Rationale**: Kebab-case verb-noun matches all 16 existing tools. `rename-company` (not `update-company`) because name is the only mutable field and the spec's language is "rename". `set-person-company` with a nullable argument matches the spec assumption that the set tool also clears. Card-link tools say "task" (not "card") because the MCP vocabulary is already task-based (`get-task`, `create-task`). Flattened read-only tag names in `get-company` match `get-person`'s `tags: string[]` precedent — MCP tag writes for companies are out of scope per the spec.

**Alternatives considered**: `update-company` for symmetry with `update-person` (rejected — `update-person` carries many fields; a single-purpose rename is clearer for agents); a combined `link-company` tool with a target-type discriminator (rejected — two explicit tools are easier for agents to discover and validate).

## D9. Frontend structure

**Decision**: Two new pages (`CompaniesPage.vue` list+create modeled on PeoplePage/TagsPage, `CompanyDetailPage.vue` modeled on PersonDetailPage + TagsPage's delete-confirm modal), two new components (`CompanyPicker.vue` — debounced search-select with set/switch/clear for the person form; `LinkedCompanies.vue` — clone of `LinkedPeople.vue` against `/api/companies?q=`), routes `/companies` + `/companies/:id`, a nav link with the existing `activeSection`/`aria-current` mechanism, naive-ui `NEmpty` empty states with `data-testid` hooks, and the established scoped-CSS conventions (`.people-table` recipe for the list, `#1f1f24` bordered rows for detail sections, 720px/640px page shells). `TagInput.vue` + `TagChip.vue` are reused as-is on the company detail page. The company field lives in the shared `PersonForm.vue`, so both create and edit modes offer it (the spec requires edit; create inherits it harmlessly since assignment ≠ inline creation, which stays forbidden — neither picker offers a create option).

**Rationale**: Every element maps to a named precedent, which keeps component tests mechanical translations of existing ones (`tags-page.test.ts`, `task-detail.test.ts`, `person-form.test.ts`, `app-shell.test.ts`). Reusing `TagInput` guarantees FR-011's "same tag input pattern" literally. Note: the memory-referenced `palette.ts`/`.wh-table`/`.wh-card-list` tokens do not exist in this repo — the actual conventions are `src/client/theme.ts` (naive-ui overrides) and per-component scoped CSS, confirmed by inspection; new UI follows the real in-repo recipes (no pure black, card-contained rows) which honor the same design intent.

**Alternatives considered**: A generic `EntityPicker` shared by people/companies (rejected — premature abstraction; `LinkedPeople` searches name+email while companies search name only); showing the company field only in edit mode (rejected — an artificial mode fork in a shared component with no spec requirement to hide it on create).

## D10. Delete confirmation counts

**Decision**: The delete confirmation modal on `CompanyDetailPage.vue` derives its "linked to N people and M cards" counts from the already-loaded detail response (`people.length`, `cards.length`) — no dedicated counts endpoint. The modal follows the `TagsPage.vue` confirm-modal pattern, appearing even at 0/0.

**Rationale**: The detail page necessarily has the full lists in hand (D7), so counts are free and always consistent with what the page displays. TagsPage sets the precedent of stating usage counts in the delete confirmation.

**Alternatives considered**: A `GET /api/companies/:id/counts` endpoint (rejected — redundant data the client already holds).

## D11. Shared validation and types

**Decision**: Add `companyNameSchema = z.string().trim().min(1, 'A name is required')` to `src/shared/validation.ts` (same shape as `tagNameSchema`, kept separate for independent evolution). Extend `src/shared/types.ts` with `Company { id, name }`, `CompanyDetail { id, name, people: PersonSummary[], cards: TaskSummary[], tags: Tag[] }`, `Person.company: Company | null`, and `TaskDetail.companies: Company[]`.

**Rationale**: Shared zod schemas are the established client/server single-source for validation messages; shared types keep the SPA, routes, and tests aligned.

**Alternatives considered**: Reusing `tagNameSchema` directly (rejected — coupling two features' validation invites accidental cross-feature changes).
