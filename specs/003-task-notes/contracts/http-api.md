# HTTP API Contract: Task Notes

**Branch**: `003-task-notes` | **Date**: 2026-08-06

All endpoints are JSON over HTTP on the existing Fastify app. Errors use the established envelope `{ "error": { "message": string } }`. Types referenced here (`Note`, `TaskDetail`) are defined in [data-model.md](../data-model.md) and `src/shared/types.ts`.

Existing endpoints `GET /api/board`, the people endpoints, and the task–person link endpoints are **unchanged** by this feature. There is deliberately **no update route for notes** — immutability (FR-012) is enforced by the route's absence.

## Task creation (extended)

### POST /api/tasks

Existing endpoint, body extended with an optional first note (FR-001, FR-002, R5).

- **Body**:

  ```json
  { "title": "Prep board deck", "note": "Kickoff call went well" }
  ```

  `note` optional. Absent, `null`, or blank-after-trim `note` → the task is created normally with zero notes (this is a success path, not a validation error). Non-blank `note` → the task and its first note are created in one transaction; the note stores the text exactly as typed, with `source: "ui"` and `createdAt` equal to the task's own `createdAt` (so it reads "just now" immediately — US2-1).
- **201** → the created `Task` (response shape unchanged from the existing contract)
- **400** → `{ "error": { "message": "Title is required" } }` when the title is blank/whitespace-only (existing rule); nothing persisted — no task and no note.

## Task detail (extended)

### GET /api/tasks/:id

Existing endpoint; the response gains the task's notes (FR-003).

- **200** →

  ```json
  {
    "id": 1,
    "title": "Prep board deck",
    "lane": "To Do",
    "createdAt": 1754500000000,
    "people": [ /* Person[], unchanged */ ],
    "notes": [
      { "id": 2, "taskId": 1, "text": "Second note", "source": "ui", "createdAt": 1754500060000 },
      { "id": 1, "taskId": 1, "text": "First note", "source": "mcp", "createdAt": 1754500000000 }
    ]
  }
  ```

  `notes` is always present — `[]` for a task with none (FR-003) — and always ordered newest first: `createdAt` descending, `id` descending as tiebreak (FR-005, R3).
- **404** → `{ "error": { "message": "Task not found" } }`

## Notes

### POST /api/tasks/:id/notes

Add a note to the task from the detail view (FR-004).

- **Body**: `{ "text": "Waiting on budget numbers" }`
- **201** → the created `Note` — server-assigned `id`, `createdAt` (epoch ms at creation), and `source: "ui"` (always; the body may not supply a source — R8). `text` is stored and returned exactly as submitted, untrimmed (R4).
- **400** → `{ "error": { "message": "Note text is required" } }` when `text` is missing, empty, or whitespace-only (FR-010); nothing persisted.
- **404** → `{ "error": { "message": "Task not found" } }`

### DELETE /api/tasks/:id/notes/:noteId

Permanently delete a note, any source (FR-011). Confirmation is a client concern — the endpoint deletes unconditionally.

- **204** → no body; the note is gone, other notes untouched.
- **404** → `{ "error": { "message": "Task not found" } }` for an unknown task; `{ "error": { "message": "Note not found" } }` when the note doesn't exist or belongs to a different task (R6).

## Contract test obligations

Each bullet below must be covered by a failing-first integration test (`app.inject()` against `createDb(':memory:')`, per existing idiom):

1. Add → read round-trip: `POST .../notes` returns 201 with `source: "ui"` and server timestamp; the note appears in `GET /api/tasks/:id` (US1-1, FR-004).
2. Ordering: two notes with distinct timestamps come back newest first; two notes with the *same* `createdAt` come back higher-`id` first (US1-2, FR-005, R3).
3. Raw preservation: text with leading indentation and internal newlines round-trips byte-for-byte untrimmed (R4).
4. Validation: empty and whitespace-only (spaces, tabs, newlines) `text` → 400 with exact message, nothing persisted (US1-4, FR-010).
5. Unknown task on add → 404 "Task not found".
6. Create task with note: one transaction yields a task whose detail shows exactly one note with matching text, `source: "ui"`, and `createdAt` equal to the task's (US2-1, R5).
7. Create task without note (absent and blank-string variants) → task created, `notes: []` (US2-2, FR-002).
8. Delete: 204 removes only the targeted note; the other note and a subsequent `GET` confirm it (US3-1, FR-011).
9. Delete 404s: unknown task; unknown note id; note id belonging to a *different* task (R6).
10. Source uniformity: a seeded `source: "mcp"` note is returned by `GET` and deletable via `DELETE` exactly like a `"ui"` note (US5-1, FR-007, FR-011).
11. No edit surface: the app exposes no `PUT`/`PATCH` route for notes — asserted by injecting one and expecting Fastify's 404/405 (FR-012).
