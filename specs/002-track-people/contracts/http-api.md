# HTTP API Contract: Track People

**Branch**: `002-track-people` | **Date**: 2026-08-06

All endpoints are JSON over HTTP on the existing Fastify app. Errors use the established envelope `{ "error": { "message": string } }` (see research.md R8). Types referenced here (`Person`, `TaskDetail`) are defined in [data-model.md](../data-model.md) and `src/shared/types.ts`.

Existing endpoints `GET /api/board` and `POST /api/tasks` are **unchanged** by this feature (FR-016, FR-017).

## Field configuration

### GET /api/person-fields

Extra person fields from `config/person-fields.json`, in config order, for rendering the create/edit form and person record (FR-009).

- **200** → `{ "fields": string[] }` — e.g. `{ "fields": ["Nickname"] }`; `{ "fields": [] }` when no extra fields are configured. Built-in fields are never included — they are fixed (FR-010).

## People

### GET /api/people

The directory, ordered by last name then first name, case-insensitive (FR-001, R7). Doubles as the linked-people search (FR-013, R5).

- **Query**: `q` *(optional)* — trimmed; when non-blank, filters to people whose first name, last name, or email contains `q` case-insensitively (literal substring — `%`/`_` have no special meaning). Absent or blank `q` returns everyone.
- **200** → `Person[]` (same order with or without `q`)

### POST /api/people

Create a person (FR-002).

- **Body**:

  ```json
  {
    "firstName": "Sam",
    "lastName": "Rivera",
    "email": "sam.rivera@example.com",
    "phone": "555-0100",
    "extraFields": { "Nickname": "Sammy" }
  }
  ```

  `email`, `phone`, `extraFields` optional. Blank-after-trim email/phone → stored as null; `extraFields` keys outside the current configuration are stripped, blank values dropped (V2, V4).
- **201** → the created `Person`
- **400** → `{ "error": { "message": "First and last name are required" } }` when first or last name is blank/whitespace-only (V1); nothing persisted.
- **409** → `{ "error": { "message": "That email is already in use" } }` when the non-blank email matches another person's case-insensitively (V3); nothing persisted.

### GET /api/people/:id

The person record (FR-006).

- **200** → `Person`
- **404** → `{ "error": { "message": "Person not found" } }`

### PUT /api/people/:id

Full update with the same body and validation as create (FR-007). The person's own email never conflicts with itself (V3).

- **200** → the updated `Person`
- **400** / **409** → same as create; the stored record is unchanged.
- **404** → `{ "error": { "message": "Person not found" } }`

### DELETE /api/people/:id

Permanent delete; cascades to every task link (FR-008, SC-006).

- **204** → no body; person gone from directory and from all tasks.
- **404** → `{ "error": { "message": "Person not found" } }`

## Task detail & links

### GET /api/tasks/:id

Task detail for the view opened from a kanban card (FR-012).

- **200** →

  ```json
  {
    "id": 1,
    "title": "Follow up with Sam",
    "lane": "To Do",
    "createdAt": 1754500000000,
    "people": [ /* Person[], directory order */ ]
  }
  ```

  (`TaskDetail` = existing `Task` + `people`.)
- **404** → `{ "error": { "message": "Task not found" } }`

### POST /api/tasks/:id/people

Link a person to the task (FR-014). Idempotent: linking an already-linked person changes nothing and still succeeds (R6).

- **Body**: `{ "personId": number }`
- **200** → the updated `TaskDetail`
- **404** → `{ "error": { "message": "Task not found" } }` or `{ "error": { "message": "Person not found" } }`

### DELETE /api/tasks/:id/people/:personId

Remove a linked person from the task; never alters the person (FR-015). Idempotent: removing a not-linked person is a no-op success (R6).

- **200** → the updated `TaskDetail`
- **404** → `{ "error": { "message": "Task not found" } }`

## Contract test obligations

Each bullet below must be covered by a failing-first integration test (`app.inject()` against `createDb(':memory:')`, per existing idiom):

1. Create → list round-trip: created person appears in `GET /api/people` with all fields (US1-1).
2. Ordering: "Alvarez" sorts above "Rivera"; same last name falls back to first name; ordering ignores case (US1-2, R7).
3. Blank names → 400 with exact message, nothing persisted (US1-3).
4. Duplicate email differing only by case → 409 with exact message, nothing persisted (US1-4); two blank-email people coexist; saving a person with their own email unchanged succeeds (edge cases).
5. Get/update round-trip: edit persists; update validation matches create (US2-2, US2-3).
6. Search: case-insensitive substring over first name, last name, email; literal `%`/`_`; blank `q` = full list (US3-2, US3-3, SC-005).
7. Task detail: returns title + empty `people` initially; 404 for unknown task (US3-1).
8. Link/unlink: link appears in detail; double-link yields one entry; unlink removes link but not the person (US3-2, US3-4, FR-014, FR-015).
9. Delete cascade: person linked to two tasks → delete → gone from both task details and from the directory (US4-1, SC-006).
10. Extra fields: configured field value round-trips through create, read, and update; unknown keys stripped (US5-1, SC-007).
11. `GET /api/person-fields` returns the configured labels in order.
