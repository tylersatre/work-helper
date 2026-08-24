# HTTP API Contracts: card-archive

Two new endpoints. One existing endpoint's payload grows one field. No endpoint is removed or renamed.

## New: `POST /api/tasks/:id/archive`

- **Request**: no body. `:id` is the numeric task id.
- **Success (200)**: the updated task row, `{ id, title, lane, position, createdAt, archived: true }` — whether this call performed the transition or found the card already archived (idempotent, `data-model.md` — no error either way).
- **Not found (404)**: `{ error: { message: 'Task not found' } }`.
- **Service**: `archiveTask(db, id)` in `src/server/services/tasks.ts`, following the existing `deleteTask`/`updateTaskTitle` result-union pattern.

## New: `POST /api/tasks/:id/unarchive`

- **Request**: no body. `:id` is the numeric task id.
- **Success (200)**: the updated task row, `{ id, title, lane, position, createdAt, archived: false }`. On an actual archived→active transition, `position` reflects the new bottom-of-lane value (`data-model.md`, `research.md` R3); on a no-op (already active), `position` is unchanged (R4).
- **Not found (404)**: `{ error: { message: 'Task not found' } }`.
- **Service**: `unarchiveTask(db, id)` in `src/server/services/tasks.ts`.

## Changed: `GET /api/board`

Same shape as today (`{ lanes: [{ name, tasks: [...] }] }`), except every task object now includes `archived: boolean`, and — this is the behavior change — **lanes now include archived cards, not just active ones**. Filtering archived cards out of the default view is a client concern (`Board.vue`'s `showArchived` toggle), not a server query parameter; see `research.md` R2. This mirrors how `board-search-filter` already ships the full board and filters client-side.

- Before this feature: `tasks` in each lane = active tasks only.
- After this feature: `tasks` in each lane = every task in that lane (active + archived), each flagged `archived`.

## Unchanged: `GET /api/tasks/:id`

Same shape, gains `archived: boolean` on the task (flows automatically from the shared `Task` interface — `data-model.md`). `TaskDetailPage.vue` uses this field to decide which control (archive vs. unarchive) to render (FR-001, FR-007).

## Explicitly unchanged

- `DELETE /api/tasks/:id` and every other existing task route (create, placement, notes, people, companies, tags) — untouched; deletion works identically on an archived or active card (FR-019).
- No query parameter is added to `GET /api/board` (R2) — unlike the MCP `list-board` tool, which does gain an explicit `includeArchived` argument (`contracts/mcp-tools.md`) because it has no client-side filtering step of its own.

## UI consumption contract

- `TaskDetailPage.vue`'s header renders an archive control (`data-testid="archive-card-button"`) when `task.archived === false`, or an unarchive control (`data-testid="unarchive-card-button"`) when `task.archived === true` — never both (FR-001, FR-007).
- Clicking archive calls `POST /api/tasks/:id/archive` with no confirmation step (FR-002) and, on success, navigates to the board (`router.push('/')`), matching `delete-card`'s no-confirmation-needed navigation precedent.
- Clicking unarchive calls `POST /api/tasks/:id/unarchive` with no confirmation step and, on success, updates `task.value.archived = false` in place — the page does **not** navigate away, so the detail view immediately re-renders showing the archive control again (FR-010, US2 scenario 3).
- A network/server error on either call surfaces inline (`role="alert"`), following the existing `laneError`/`tagError`/`deleteError` precedent in this page; the control stays as-is (no optimistic flip) until the request resolves.
- `Board.vue` fetches the full board (now archived-inclusive) exactly as before, and its `visibleLanes` computed adds an archived gate ahead of the existing `matchesBoardFilter` gate (`research.md` R2, R7):

  ```ts
  const archivedGatedLanes = computed(() =>
    board.value.lanes.map((lane) => ({ ...lane, tasks: lane.tasks.filter((task) => showArchived.value || !task.archived) })),
  );
  const totalCount = computed(() => archivedGatedLanes.value.reduce((sum, lane) => sum + lane.tasks.length, 0));
  const visibleLanes = computed(() =>
    archivedGatedLanes.value.map((lane) => ({ ...lane, tasks: lane.tasks.filter((task) => matchesBoardFilter(task, filter.value)) })),
  );
  ```

  This keeps `totalCount`/`visibleCount` (the existing `board-search-filter` "N of M cards" indicator) computed over exactly the set the toggle currently allows — unaffected when `Show archived` is off, inclusive of archived cards when it's on (FR-012, US3).
- `TaskCard.vue` renders a dimmed style and an "Archived" badge (`data-testid="archived-badge"`) when `task.archived === true` (FR-006); no archive/unarchive control is added to the card face (FR-017).
