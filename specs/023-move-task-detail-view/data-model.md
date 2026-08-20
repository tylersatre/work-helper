# Data Model: Move Task from Detail View

No new or changed tables, columns, or migrations. This feature adds one derived, non-persisted field to one existing HTTP response, and reuses the existing `Task`/`moveTask()` model unchanged. Decisions referenced from [research.md](research.md).

## Existing entities (unchanged)

- **`tasks` table / `Task`** (`src/server/db/schema.ts`, `src/shared/types.ts`): `{ id, title, lane, position, createdAt }`. `lane` and `position` are exactly what a pill-triggered move updates — through the same `moveTask()` function drag-and-drop and the `move-task` MCP tool already use. No column changes.
- **Lane configuration**: `config/lanes.json` → `loadLanesConfig()` → `app.lanes: string[]` (server) / `context.lanes: string[]` (MCP). Already the single source of lane order; this feature reads it, doesn't change it (D1).

## Modified read model: `TaskDetail` (D1)

`src/shared/types.ts`:

```ts
export interface TaskDetail extends Task {
  people: LinkedPerson[];
  notes: Note[];
  tags: Tag[];
  companies: Company[];
  conversations: LinkedConversationSummary[];
  lanes: string[]; // NEW — configured lane names in display order, e.g. ["To Do", "In Progress", "Waiting", "Done"]
}
```

- **Source**: `app.lanes`, merged into the response by the `GET /api/tasks/:id` route handler (`src/server/routes/tasks.ts`) — `return { ...task, lanes: app.lanes };`. `getTaskDetail()` itself (`src/server/services/tasks.ts`) is unchanged; it has no access to `app.lanes` and doesn't need it — the merge happens at the route layer, exactly where `routes/board.ts` already reads `app.lanes` for `GET /api/board`.
- **Not derived from the database**: `lanes` is the static configured list, not filtered to lanes that currently contain tasks — every configured lane always appears as a pill, including empty ones (spec edge case: "clicking the pill for a lane that is currently empty still moves the card there").
- **Ordering**: same order as `config/lanes.json`, matching FR-001 ("in the same order as the lane configuration").

## Client-side derived state (no storage, no new type)

`TaskDetailPage.vue` derives, per render:

| Value | Derivation |
|---|---|
| Pill list | `task.value.lanes.map(name => ({ name, isCurrent: name === task.value.lane }))` |
| "Current" pill | the single entry where `name === task.value.lane` — always exactly one, since `task.value.lane` is always one of the configured lanes (enforced server-side by `moveTask()`'s `invalid-lane` rejection) |
| Move-request body | `{ lane: targetLaneName, index: Number.MAX_SAFE_INTEGER }` (D2) sent to the existing `PUT /api/tasks/:id/placement` |

No new client-side model type is introduced — pills are rendered directly off `task.value.lanes` and `task.value.lane`.

## Explicitly unchanged

- `Task`, `moveTask()`, `MoveTaskResult` (`src/server/services/tasks.ts`) — same function, same signature, same clamping behavior (D2).
- `PUT /api/tasks/:id/placement` request/response contract (`src/server/routes/tasks.ts`) — no schema change.
- `move-task`, `list-board` MCP tools (`src/server/mcp/tools.ts`) — no change (D7).
- `GET /api/board`, `BoardLane` — unaffected; the kanban card face stays title-only (FR-010).
