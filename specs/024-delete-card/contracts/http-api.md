# HTTP API Contracts: Delete Card

One new endpoint. No existing endpoint changes. No MCP tool is added (FR-009).

## New: `DELETE /api/tasks/:id`

Hard-deletes the card and, via existing DB cascades (`data-model.md`), its own links to people/companies/tags/conversations and its notes. Never modifies `people`, `email_conversations`, `companies`, or `tags` rows.

- **Request**: no body. `:id` is the numeric task id.
- **Success (200)**: `{ ok: true }`. (No task body to return — the resource no longer exists.)
- **Not found (404)**: `{ error: { message: 'Task not found' } }` — returned both when `id` never existed and when the card was already deleted (e.g. a stale detail view confirming a second time). This is not treated as a client error to alarm the user over; the client's error handling (below) treats it the same as success.
- **No other status codes** — there is no request body to validate, so there is no 400 path.

### Service contract

`deleteTask(db, id): { ok: true } | { ok: false; error: 'task-not-found' }` in `src/server/services/tasks.ts`, following the existing `deleteNote`/`unlinkPerson` result-union pattern in the same file. Implementation is a single `db.delete(tasks).where(eq(tasks.id, id))` after confirming the row exists, relying on the schema's `onDelete: 'cascade'` foreign keys for child rows — no manual multi-table delete.

## Explicitly unchanged

- `GET /api/board` — after a delete, the next fetch simply omits the deleted card; no contract change (FR-006).
- `GET /api/tasks/:id` — for a deleted id, already returns 404 `Task not found` today; unchanged.
- MCP tools `list-board` and `get-task` (`src/server/mcp/tools.ts`) — no new tool, no schema or behavior change. Both already read the `tasks` table, so a deletion made via the new route is visible to them immediately with no cache to invalidate (FR-008, FR-009).
- Every other task route (create, placement, notes, people, companies, tags) — untouched.

## UI consumption contract

- `TaskDetailPage.vue` renders a delete control in the header area, next to the lane pills (FR-001), e.g. `<button data-testid="delete-card-button">Delete</button>`.
- Clicking it does not call the API — it opens `DeleteCardConfirm.vue`, a modal showing the card's title and a permanence warning (FR-002, FR-003), with Cancel and Delete (confirm) actions.
- Cancel closes the modal with no network call; the detail view is otherwise untouched (FR-004).
- Confirm calls `DELETE /api/tasks/:id`. On a `response.ok` **or** a 404 result, the client navigates to the board (`/`) — both cases mean "the card is not there anymore," which is the state the user wanted and matches the stale-tab edge case. On any other failure (network error, 5xx), the modal stays open and shows an inline error, following the existing `laneError`/`tagError` `role="alert"` precedent in this page, so the user isn't silently kicked back to the board on a real failure.
- No undo affordance, toast with an undo action, or trash view is added anywhere (FR-011).
