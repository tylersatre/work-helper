# MCP Tool Contracts: MCP Move Tasks

Both tools are registered on the existing `work-helper` McpServer in `src/server/mcp/tools.ts` and are reachable only through the existing mcp-authentik-auth flow (FR-013 — unauthenticated calls are rejected at the transport/auth layer before any tool executes). Domain failures are returned as MCP tool results with `isError: true` and a plain-text message (the repo's `toolError()` convention), never as protocol errors.

## Tool: `move-task` (new)

**Description**: Moves an existing task card to a configured lane, optionally at a 1-based position (1 = top). Without a position the card lands at the bottom of the destination lane. Supports within-lane reordering.

### Input schema

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `taskId` | number | yes | `z.number().int().positive()` — id of the card to move |
| `lane` | string | yes | destination lane name; validated against configured lanes |
| `position` | number | no | `z.number().int().min(1)` — 1-based target position; values past the end clamp to the bottom; omitted ⇒ bottom |

### Success result

- `structuredContent`: the moved task summary plus the landing position —
  `{ id, title, lane, position, createdAt, landedPosition }` where `id/title/lane/position/createdAt` follow the existing `taskSummarySchema` (`position` is the raw 0-based stored value, consistent with `list-board`/`get-task`) and `landedPosition` is the **1-based** position the card actually landed at (FR-005). `landedPosition === position (input)` when no clamping occurred; smaller when clamped.
- `content` text: `Moved task "<title>" to lane "<lane>" at position <landedPosition>.`

### Error results (`isError: true`, board unchanged)

| Condition | Message |
|-----------|---------|
| `taskId` matches no task | `Task <taskId> not found` |
| `lane` not a configured lane | `Unknown lane "<lane>". Valid lanes: To Do, In Progress, Waiting, Done` (list built from live config) |
| `position` is 0, negative, or non-integer; or any field has the wrong type | Zod validation failure at the tool boundary (SDK-level invalid-params rejection before the handler runs) |

### Behavioral guarantees

- FR-002: omitted `position` ⇒ bottom of destination lane (including when destination = current lane).
- FR-004: `lane` equal to the card's current lane reorders within the lane under the same rules; moving a card to its current position is a successful no-op reporting its unchanged 1-based position.
- FR-005: `position` past the end ⇒ clamps to bottom, call succeeds, `landedPosition` tells the truth.
- FR-006: after the call the card exists in exactly one lane; all other cards keep their relative order.
- FR-014: any error ⇒ zero writes (single transaction).

## Tool: `create-task` (extended — backward compatible)

**Description** (updated): Creates a task at the bottom of the given lane (or the first configured lane when no lane is given), optionally with an initial note.

### Input schema

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `title` | string | yes | existing `titleSchema` validation (unchanged) |
| `note` | string | no | unchanged — stored with `source: 'mcp'` |
| `lane` | string | no | **new** — target lane name; validated against configured lanes; omitted ⇒ first configured lane (today's behavior, byte-identical) |

### Success result

- `structuredContent`: unchanged shape — `{ id, title, lane, position, createdAt }` (`taskSummarySchema`); `lane` reflects the lane the card was created in.
- `content` text: unchanged pattern — `Created task "<title>" in lane "<lane>".`

### Error results (`isError: true`, no card created)

| Condition | Message |
|-----------|---------|
| `lane` not a configured lane | `Unknown lane "<lane>". Valid lanes: To Do, In Progress, Waiting, Done` (list built from live config) |
| invalid/empty title | existing behavior unchanged (first Zod issue message) |

### Behavioral guarantees

- FR-009: with `lane`, the card is created at the bottom of that lane (no position parameter by design).
- FR-010: without `lane`, behavior is unchanged from today.
- FR-011/FR-014: invalid lane ⇒ error naming valid lanes, zero rows written.

## Unchanged surfaces (explicitly out of contract)

- `list-board` and `get-task` response shapes are untouched; 1-based position semantics for agents are defined by `list-board`'s array order (FR-003).
- REST API (`PUT /api/tasks/:id/placement`, `POST /api/tasks`) and the web UI create flow are untouched.
