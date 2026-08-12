# HTTP API Contract: Companies

All endpoints follow the established Fastify conventions: JSON bodies, errors shaped `{ error: { message: string } }` (global handler in `src/server/app.ts`), 201 for creates, 204 + empty body for deletes. Validation messages are shared verbatim with the MCP layer. Types referenced below are defined in [data-model.md](../data-model.md).

## Company CRUD (`src/server/routes/companies.ts`)

### GET `/api/companies?q=<optional substring>`

Lists companies alphabetically by name (`COLLATE NOCASE`). With `q`, filters to case-insensitive substring matches on name (the picker search; mirrors `GET /api/people?q=`). Response 200: `Company[]` — `[{ "id": 1, "name": "Acme Corp" }, ...]`. An empty result is `[]` (the UI renders the empty state; a picker shows "no matches" and never offers creation).

### POST `/api/companies`

Body: `{ "name": string }`. Trims, validates per FR-002.

- 201: the created `Company`.
- 400 `{ error: { message: "A name is required" } }` — empty/whitespace-only name.
- 409 `{ error: { message: "That company name is already in use" } }` — case-insensitive duplicate.

### GET `/api/companies/:id`

- 200: `CompanyDetail` — `{ id, name, people: [{ id, firstName, lastName }] (ordered lastName, firstName NOCASE), cards: [{ id, title, lane }] (ordered title NOCASE), tags: Tag[] }`. Complete lists, no pagination.
- 404 `{ error: { message: "Company not found" } }`.

### PATCH `/api/companies/:id`

Body: `{ "name": string }` — rename only (the sole mutable field).

- 200: the updated `Company`.
- 400 / 409: same validation contract as POST; renaming to a different casing of the company's own name succeeds (uniqueness check excludes `:id`).
- 404: company not found.

### DELETE `/api/companies/:id`

- 204, empty body. Side effects (FK actions): every assigned person's `companyId` becomes null, every `task_companies` and `company_tags` row for this company is removed; no person, card, or tag is deleted.
- 404: company not found.

## Company tags (mirrors person/task tag routes)

### POST `/api/companies/:id/tags`

Body: `{ "tagId": number }` XOR `{ "name": string }` (existing-attach vs create-and-attach, the `AttachInput` pattern from `services/tags.ts`).

- 200: `{ tags: Tag[] }` — the company's full updated tag list.
- 400 "Provide a tagId or a name" — both or neither given; 400 "A name is required" — blank name.
- 404: company (or tagId) not found.
- Attaching a name that case-insensitively matches an existing tag attaches that tag — never creates a duplicate (existing service behavior).

### DELETE `/api/companies/:id/tags/:tagId`

- 200: `{ tags: Tag[] }` — the remaining tags.
- 404: company not found or tag not attached.

## Person assignment (modified `src/server/routes/people.ts`)

### PUT `/api/people/:id`

Gains optional field `companyId: number | null` alongside the existing person fields. Omitted → assignment unchanged; number → set/switch; `null` → clear.

- 200: the updated `Person`, now including `company: Company | null`.
- 400 `{ error: { message: "Company not found" } }` — `companyId` references no existing company; the person is unchanged.

`GET /api/people/:id` (and the pre-populated edit form) includes `company: Company | null`.

## Card links (modified `src/server/routes/tasks.ts`, mirrors task-people routes)

### POST `/api/tasks/:id/companies`

Body: `{ "companyId": number }`.

- 200: the full updated `TaskDetail` (including `companies: Company[]`) — the LinkedPeople idiom, consumed by `LinkedCompanies.vue`.
- 404: task or company not found.
- Linking an already-linked company is a no-op returning the unchanged detail (the composite PK guarantees no duplicate; the picker already excludes linked companies client-side).

### DELETE `/api/tasks/:id/companies/:companyId`

- 200: the full updated `TaskDetail`.
- 404: task not found.

`GET /api/tasks/:id` includes `companies: Company[]` (ordered name NOCASE).

## Consumers

- `CompaniesPage.vue`: GET list, POST create.
- `CompanyDetailPage.vue`: GET detail, PATCH rename, DELETE (confirm modal derives counts from `people.length`/`cards.length`), POST/DELETE tags.
- `CompanyPicker.vue` (in `PersonForm.vue`): GET `?q=` (debounced 300ms), submits via PUT person.
- `LinkedCompanies.vue` (in `TaskDetailPage.vue`): GET `?q=` (debounced, excludes already-linked ids client-side), POST/DELETE task companies.
- `PersonDetailPage.vue`: renders `person.company`.
