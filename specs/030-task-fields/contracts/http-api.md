# HTTP API Contracts: task-fields

One new endpoint. One existing endpoint's request body grows four optional keys. Two existing endpoints' response payloads grow four fields (automatically, via the shared `Task` row shape — no handler code change). No endpoint is removed or renamed.

## Changed: `POST /api/tasks`

- **Request body**: `{ title: string; note?: string; dueDate?: string; priority?: 'Low' | 'Medium' | 'High' | 'Urgent'; effort?: 'S' | 'M' | 'L' | 'XL'; description?: string }`. All four new keys are optional; omitting or leaving one blank creates the task with that field unset (FR-003).
- **Success (201)**: the created task row, now including `dueDate`, `priority`, `effort`, `description` (each `null` if omitted).
- **Validation**: `priority`/`effort`, if provided, are checked against `taskPrioritySchema`/`taskEffortSchema` — invalid value → `400 { error: { message: 'Invalid priority' | 'Invalid effort' } }`, task not created. `dueDate`/`description` accept any non-blank string with no format check (`research.md` R2). Existing title-required validation (`400 { error: { message: 'Title is required' } }`) is unchanged.
- **Service**: `createTask(app.db, app.lanes, body?.title, body?.note, undefined, undefined, { dueDate: body?.dueDate, priority: body?.priority, effort: body?.effort, description: body?.description })`.

## New: `PATCH /api/tasks/:id`

- **Request body**: `{ dueDate?: string | null; priority?: 'Low' | 'Medium' | 'High' | 'Urgent' | null; effort?: 'S' | 'M' | 'L' | 'XL' | null; description?: string | null }`. `:id` is the numeric task id. No `title` key — renaming has no UI control in this feature (Assumptions).
- Tri-state per key: **omitted** → that field is left unchanged; **`null`** → that field is cleared to unset; **a value** → that field is set/changed. At least one key may be omitted without error; a body with none of the four keys is a no-op that still returns the current row.
- **Success (200)**: the updated task row, reflecting exactly the fields that were present in the body.
- **Not found (404)**: `{ error: { message: 'Task not found' } }`.
- **Invalid priority/effort (400)**: `{ error: { message: 'Invalid priority' } }` or `{ error: { message: 'Invalid effort' } }` — the task's existing values are left completely unchanged (no partial write), matching FR-012's intent applied defensively to the HTTP surface too.
- **Service**: `updateTask(db, id, { dueDate, priority, effort, description })` in `src/server/services/tasks.ts`, following the existing `archiveTask`/`unarchiveTask` result-union pattern (`{ ok: true, task }` / `{ ok: false, error }`).

## Changed (response shape only): `GET /api/tasks/:id`

Same shape as today, gains `dueDate`, `priority`, `effort`, `description` on the task object — flows automatically from the shared `Task` row (`db.select().from(tasks)` already selects every column; no handler change needed beyond the schema/type edits). `TaskDetail.vue` uses these to render `TaskFields.vue`'s current state.

## Changed (response shape only): `GET /api/board`

Same shape as today (`{ lanes: [{ name, tasks: [...] }] }`), except every task object now includes `dueDate`, `priority`, `effort`, `description` — again automatic, via `listBoardTasksByLane`'s existing `{ ...task, tags, searchText }` spread. `TaskCard.vue` uses `dueDate` to render the badge; `priority`/`effort`/`description` are present in the payload but intentionally unused by the card face (FR-008).

## Explicitly unchanged

- `DELETE /api/tasks/:id`, `POST /api/tasks/:id/archive`, `POST /api/tasks/:id/unarchive`, `PUT /api/tasks/:id/placement`, and every notes/people/companies/tags route — untouched; none of the four new fields interacts with archiving, deletion, lane placement, or any linked entity.
- No route is added for renaming a task's title (Assumptions — no UI control for this feature; renaming stays MCP-only via `update-task`).

## UI consumption contract

- `CreateTaskForm.vue` sends `dueDate`/`priority`/`effort`/`description` in the `POST /api/tasks` body only when the corresponding input has a non-blank value — mirroring the existing `note` field's "only include if trimmed non-empty" behavior.
- `TaskFields.vue` (mounted from `TaskDetail.vue`) calls `PATCH /api/tasks/:id` with exactly one key per user action (e.g., changing the due-date picker sends `{ dueDate: '2026-09-05' }`; clearing it sends `{ dueDate: null }`) and updates its local view of the task in place from the response — no page reload, no re-fetch of the whole task.
- A network/validation error on the `PATCH` call surfaces inline (`role="alert"`), following the existing `laneError`/`tagError`/`archiveError` precedent in `TaskDetail.vue`; the control's displayed value reverts to the last-known-good server value on failure (no optimistic-and-stuck-wrong state).
