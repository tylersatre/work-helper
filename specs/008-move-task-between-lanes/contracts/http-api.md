# HTTP API Contract: Move Task Between Lanes

**Feature**: `008-move-task-between-lanes` | Base: existing Fastify app (`src/server/app.ts`)

Task payloads in all endpoints below gain one additive field: `position: number` (0-based slot within the task's lane). No existing field changes shape.

## PUT /api/tasks/:id/placement (new)

Sets a task's board placement: destination lane and 0-based slot within it. This is the only write path for placement — MCP has none in this slice.

**Request body**

```json
{ "lane": "In Progress", "index": 1 }
```

- `lane` (string, required): must exactly match a configured lane name.
- `index` (integer >= 0, required): 0-based slot in the destination lane counted **with the moving card excluded** (final-index semantics): 0 = top, `k` = directly after the k-th remaining card, values past the end are clamped to append. For cross-lane moves this equals the visible slot at drop time; for within-lane moves the client computes the index over the lane's *other* cards (the dragged card's own midpoint is excluded from the drop-index computation), so the server splices at `index` unchanged and the card lands exactly at the indicated slot in both directions — e.g. in a lane showing [A, B, C], dropping A between B and C sends `index: 1` and yields [B, A, C].

**Responses**

- `200` — updated task summary, e.g. `{ "id": 3, "title": "Draft Q3 goals", "lane": "In Progress", "position": 1, "createdAt": 1754680000000 }`. Dropping a card onto its own current slot is a valid no-op and still returns 200.
- `404` — `{ "error": { "message": "Task not found" } }` for an unknown task id.
- `400` — `{ "error": { "message": "Unknown lane" } }` for a lane not in the configured list; `{ "error": { "message": "Invalid index" } }` for a missing, negative, or non-integer index.

**Effects**: atomic — after the transaction, the destination lane's positions are 0..n-1 with the task at the (clamped) requested slot; for cross-lane moves the source lane is also renumbered 0..n-1. The task appears in exactly one lane at all times (FR-006).

## GET /api/board (modified semantics, same shape)

`{ "lanes": [{ "name": string, "tasks": Task[] }] }` — lanes in configured order (unchanged); tasks in each lane now ordered by `(position ASC, id ASC)` instead of `id ASC`, and each task includes `position`. This is the arrangement contract the UI renders and the MCP `list-board` tool mirrors.

## POST /api/tasks (modified semantics, same shape)

Behavior change only: the created task lands at the bottom of the first configured lane (`position = max + 1`, 0 if empty) — FR-008. Response task includes `position`. Same for the MCP `create-task` tool (shared service).

## GET /api/tasks/:id (additive)

Response gains `position`. The client renders `lane` as read-only text on the detail page (FR-009) — no new write surface here.

## Unchanged

All notes, people, and MCP auth endpoints are untouched by this feature.
