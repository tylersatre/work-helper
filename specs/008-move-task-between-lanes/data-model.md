# Data Model: Move Task Between Lanes

**Feature**: `008-move-task-between-lanes` | **Date**: 2026-08-08

## Entities

### Task (extended)

The only schema change in this feature. Existing columns unchanged.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK, autoincrement | unchanged |
| `title` | text | NOT NULL | unchanged |
| `lane` | text | NOT NULL | must be one of the configured lane names; unchanged column, now user-mutable via the placement endpoint |
| `position` | integer | NOT NULL | **new** — 0-based sort key within the task's lane; smaller = closer to the top |
| `created_at` | integer | NOT NULL | unchanged |

No default on `position`: every insert path sets it explicitly (`createTask` computes append-at-bottom), and fresh databases are created from the regenerated baseline, so no legacy rows exist (research.md R2). No index is added — with one user and 4 lanes, every lane scan is trivially small.

### Lane (unchanged, config-only)

Not a table. Lanes remain the ordered list of names from `config/lanes.json` (`To Do`, `In Progress`, `Waiting`, `Done`), loaded by `loadLanesConfig` and injected as `app.lanes` / `McpToolsContext.lanes`. All lanes behave identically (FR-011); this feature adds no lane state.

### Board (derived)

Not stored. The board is derived at read time: for each configured lane, in config order, the tasks whose `lane` equals that name, ordered by `(position ASC, id ASC)`. Both `GET /api/board` and the MCP `list-board` tool derive it through the same `listTasksByLane` service function — that shared path is the mechanism behind SC-005.

## Invariants

- **Exactly one lane** (FR-006): `lane` is a single NOT NULL column, so a task row is structurally incapable of being in two lanes or zero lanes; moves rewrite it in one transaction, so no intermediate state is observable.
- **Deterministic order** (FR-005): reads order by `(position, id)`; the `id` tiebreak guarantees a stable total order even if positions were ever duplicated by a bug.
- **Compact positions after a move**: the move transaction renumbers the destination lane (and, for cross-lane moves, the source lane) to 0..n-1. Compactness is a hygiene property, not a correctness requirement — correctness only needs relative order.
- **Valid lane values**: the placement endpoint rejects lanes not present in the configured list (400). Config changes between sessions are out of scope, matching existing behavior for tasks whose lane disappears from config.

## Operations (state transitions)

### Create task (modified)

Inside the existing `createTask` transaction: `position = max(position) + 1` over tasks in the first configured lane (0 when the lane is empty), then insert. Result: new cards always append at the bottom of the first lane, never disturbing an existing arrangement (FR-008, SC-006). Applies identically to UI (`POST /api/tasks`) and MCP (`create-task`) callers since both call `createTask`.

### Move task (new: `moveTask` service function)

Input: `taskId`, `targetLane`, `targetIndex` — where `targetIndex` is the 0-based slot in the destination lane counted with the moving task excluded (final-index semantics, [contracts/http-api.md](contracts/http-api.md)). All steps in one better-sqlite3 transaction:

1. Load the task by id — not found → `task-not-found`.
2. Validate `targetLane` against the configured lanes — unknown → `invalid-lane`.
3. Read the destination lane's task ids ordered by `(position, id)`, excluding the moving task (relevant when the move is within the same lane).
4. Clamp `targetIndex` to `[0, destination length]` and splice the moving task's id in at that index.
5. Renumber the spliced list: each task's `position` = its list index; set the moving task's `lane = targetLane`.
6. If the source lane differs from the destination, renumber the source lane's remaining tasks 0..n-1.
7. Return the updated task row.

Properties: because `targetIndex` is in moving-card-excluded coordinates, the same splice is exact for cross-lane moves and for within-lane moves in either direction (upward and downward); moving a card onto its own current slot re-derives the identical order (harmless no-op, per spec edge case); the exactly-one-lane invariant holds at every observable point because the whole rewrite commits atomically; better-sqlite3's synchronous single-connection execution serializes concurrent move requests naturally.

### Read board (modified)

`listTasksByLane` changes its ordering from `id ASC` to `(position ASC, id ASC)`. Consumed by `GET /api/board`, MCP `list-board`, and (per-task, unaffected by ordering) `getTaskDetail`.

## Type changes (`src/shared/types.ts`)

`Task` gains `position: number`. `BoardLane`, `BoardView`, `TaskDetail` inherit it structurally. MCP `taskSummarySchema` gains `position: z.number()` (see [contracts/mcp-tools.md](contracts/mcp-tools.md)).
