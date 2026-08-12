# Data Model: MCP Move Tasks

No schema changes. The feature operates entirely on the existing `tasks` table and the startup-loaded lane configuration. No migration is generated.

## Entities

### Task card (existing `tasks` table — unchanged)

| Field | Type | Notes |
|-------|------|-------|
| `id` | integer PK autoincrement | The task identifier agents pass to `move-task` |
| `title` | text, not null | |
| `lane` | text, not null | Must always be one of the configured lanes; both surfaces write only validated values |
| `position` | integer, not null | **0-based** index within the lane's top-to-bottom order (internal convention, shared with the UI) |
| `createdAt` | integer, not null | epoch ms |

**Invariants** (enforced by `moveTask`/`createTask` transactions, not by schema):

- A task belongs to exactly one lane (single row, single `lane` value) — FR-006.
- Within a lane, positions are the contiguous sequence 0..n-1 after every successful move/create; ordering reads use `ORDER BY position, id` as a tiebreak.
- A failed operation writes nothing (single transaction, validation before first write) — FR-014.

### Lane (config value, not a table — unchanged)

Loaded at startup from `config/lanes.json` via `loadLanesConfig()` into `context.lanes: string[]`. Currently `["To Do", "In Progress", "Waiting", "Done"]`. The first entry is the default landing lane for creation without an explicit lane (FR-010). Lane names are unique, non-empty, order-significant. This feature reads the list; it never modifies lane configuration.

### Position (MCP boundary concept)

| Representation | Convention | Where |
|----------------|-----------|-------|
| MCP tool input/output `position` | **1-based**, 1 = top of lane | `move-task` input, `move-task`/`create-task` structured output as exposed today via `taskSummarySchema` (`position` there is the raw 0-based column — see mapping note below) |
| Service/database `position` | **0-based** | `tasks.position`, `moveTask` `targetIndex` |

**Mapping** (done only in `src/server/mcp/tools.ts`):

- Input: `targetIndex = position - 1`; omitted position → `Number.MAX_SAFE_INTEGER` (service clamp lands it at the bottom).
- Output: the `move-task` response reports the landed position as `task.position + 1` (FR-005). The existing `list-board`/`get-task`/`create-task` response shapes are **not changed** (spec assumption: board-listing and get-task shapes untouched); agents derive 1-based order from array order in `list-board`, which is how FR-003 defines position.

## State transitions

`move-task(taskId, lane, position?)` — one transaction:

1. Task lookup by `id` → missing ⇒ `task-not-found`, no writes.
2. Lane validated against configured lanes → unknown ⇒ `invalid-lane`, no writes.
3. Destination lane's cards (excluding the moving card) snapshotted in order; moving card spliced at `clamp(targetIndex, 0, len)`; all destination positions rewritten 0..n-1.
4. If the source lane differs, its remaining cards are renumbered 0..m-1.
5. Updated task row returned — its `position` is the authoritative landing index.

`create-task(title, note?, lane?)` — one transaction:

1. Title validated (existing `titleSchema`).
2. Target lane = given lane if present (validated against configured lanes → unknown ⇒ `invalid-lane`, no insert) else `lanes[0]`.
3. New row inserted at `max(position) + 1` in the target lane (bottom); optional note inserted with `source: 'mcp'`.
