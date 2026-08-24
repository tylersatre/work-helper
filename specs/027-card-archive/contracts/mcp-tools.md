# Contract: MCP tools for card-archive

All on the existing official-SDK server (`src/server/mcp/tools.ts`), reachable by any client authorized through the existing `mcp-authentik-auth` flow — this feature adds no auth behavior of its own (spec Assumptions, Dependencies).

## Changed: `list-board`

Gains one optional input, `includeArchived` (FR-013).

### Input schema (updated)

```ts
{
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  includeArchived: z.boolean().optional(),   // NEW
}
```

| # | Rule | Requirement |
| --- | --- | --- |
| A1 | `includeArchived` omitted or `false` ⇒ archived cards are excluded entirely, identical to today's behavior | FR-013 |
| A2 | `includeArchived: true` ⇒ archived cards are included, each with `archived: true` in its task summary, grouped under their lane like any other card | FR-013 |
| A3 | The archived gate applies **before** `search`/`tags` matching, exactly like the UI's toggle-before-filter order (`research.md` R2) — with `includeArchived` unset, an archived card can never appear even if it would otherwise match `search`/`tags` | FR-012 (UI parity) |
| A4 | `search`/`tags` matching rules on an included archived card are identical to an active card's — same `matchesBoardFilter` call | US3 |

### Output schema (updated)

`taskSummarySchema` (shared by every task-returning tool) gains `archived: z.boolean()` — see `research.md` R5. `list-board`'s output shape is otherwise unchanged:

```ts
{ lanes: z.array(z.object({ name: z.string(), tasks: z.array(z.object(taskSummarySchema)) })) }
```

### Worked examples

| Call | Result |
| --- | --- |
| `{}` | Active cards only, `archived: false` on each — unchanged from today |
| `{ includeArchived: true }` | Every card, active and archived, each correctly flagged |
| `{ includeArchived: true, search: "sam" }` | Archived and active cards alike, narrowed to those matching "sam" |
| `{ search: "sam" }` (no `includeArchived`) | Only active cards matching "sam" — an archived card titled "Follow up with Sam" is excluded regardless of the text match (A3) |

## New: `archive-card`

- **Description**: "Archives a task, hiding it from the default board view without deleting it. Archiving an already-archived task is a no-op."
- **Input schema**: `{ taskId: z.number().int().positive() }`
- **Output schema**: `taskSummarySchema` (includes `archived: true`)
- **Behavior**: calls `archiveTask(context.db, taskId)`. Not found → `toolError('Task ${taskId} not found')`. Otherwise returns the task summary with a text line like `Archived task "${task.title}".` (or, on the idempotent no-op path, the same success shape — no distinct wording required, since the end state is identical either way per FR-014/US4 and R4).

## New: `unarchive-card`

- **Description**: "Restores an archived task to active state, placing it at the bottom of its lane. Unarchiving an already-active task is a no-op."
- **Input schema**: `{ taskId: z.number().int().positive() }`
- **Output schema**: `taskSummarySchema` (includes `archived: false`, and — on an actual transition — the new bottom-of-lane `position`)
- **Behavior**: calls `unarchiveTask(context.db, taskId)`. Not found → `toolError('Task ${taskId} not found')`. Otherwise returns the task summary with a text line like `Unarchived task "${task.title}".`

## Explicitly unchanged

- `get-task` — its output schema (`taskDetailOutputSchema`) spreads `taskSummarySchema`, so `archived` flows through automatically with no schema edit of its own beyond the shared object; `taskDetailContent()` gains one field, `archived: task.archived` (`research.md` R5).
- `create-task`, `move-task`, `update-task` — each already builds its `structuredContent` from a full task row; each gains `archived: <row>.archived` in that mapping, no behavior change (`research.md` R5).
- No MCP tool for deletion is added or changed — deletion remains UI-only and unavailable to agents (FR-019, unchanged from `delete-card`).
- No bulk archive/unarchive tool is added (FR-016) — `archive-card`/`unarchive-card` each take exactly one `taskId`.
