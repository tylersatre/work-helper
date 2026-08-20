# HTTP API Contracts: Move Task from Detail View

One existing endpoint gains a field; one existing endpoint is reused with no contract change; the MCP surface is untouched. No new endpoints.

## Modified: `GET /api/tasks/:id`

Response body (`TaskDetail`) gains:

```ts
lanes: string[]
// e.g. ["To Do", "In Progress", "Waiting", "Done"] — configured lane names, in configured order (data-model.md)
```

- Always the full configured lane list (from `app.lanes`), regardless of which lanes currently hold tasks.
- Status codes (200, and the existing 404 `Task not found` shape), all other fields, and the `PUT` endpoint below are unchanged.

## Reused, unchanged: `PUT /api/tasks/:id/placement`

No contract change. Documented here because this is the endpoint the new lane-pill control calls — the same one `Board.vue`'s drag-and-drop already calls.

- **Request body**: `{ lane: string, index: number }` — unchanged Zod validation (`placementIndexSchema = z.number().int().nonnegative()`).
- **Response** (200): the updated task row `{ id, title, lane, position, createdAt }`.
- **Errors**: `404 { error: { message: 'Task not found' } }`; `400 { error: { message: 'Invalid index' } }` or `400 { error: { message: 'Unknown lane' } }`.
- **Pill-triggered call shape**: `{ lane: <clicked lane name>, index: Number.MAX_SAFE_INTEGER }` — the service clamps this to the bottom of the destination lane (research D2), identical to how the `move-task` MCP tool achieves "no position given → bottom of lane."

## Explicitly unchanged

- `GET /api/board`, `BoardLane` — the kanban board's own data source is untouched; the card face stays title-only (FR-010).
- MCP tools `move-task` and `list-board` (`src/server/mcp/tools.ts`) — no new tool, no schema or behavior change (FR-009). `list-board` already reflects any move made via `PUT .../placement` because both paths write through the same `moveTask()` service call — nothing MCP-specific needs to change for User Story 2 to hold.
- Every other task route (`POST /api/tasks`, notes, people, companies, tags) — untouched.

## UI consumption contract

- `TaskDetailPage.vue` renders `task.lanes` directly under the title as a row of pills, in array order (FR-001), replacing the current `<p data-testid="task-lane">Lane: {{ task.lane }}</p>` — no new section header.
- The pill where `name === task.lane` is visually marked current (link-blue-tint styling, research D5) and rendered as a disabled control — it fires no request when interacted with (FR-002).
- Every other pill is an enabled control; clicking it immediately calls `PUT /api/tasks/:id/placement` with the shape above and no confirmation step (FR-003).
- On a successful (`response.ok`) result, `task.value` is updated from the response so the pill row's current marker moves in the same render pass (FR-005); a full page reload re-fetches `GET /api/tasks/:id` and shows the same state, since the move already persisted server-side (FR-006).
- On a failed result, or when a response arrives for a click that has since been superseded by a later click (research D4), the response is not applied to `task.value` — the pill row keeps showing the task's actual last-saved lane — and an inline error message is shown for a failed request, following the existing `tagError`-style `role="alert"` precedent already in this page (research D3; spec edge case 2).
- No confirmation dialog, toast, or move animation is added (spec Assumptions).
