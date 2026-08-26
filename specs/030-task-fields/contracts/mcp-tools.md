# Contract: MCP tools for task-fields

All on the existing official-SDK server (`src/server/mcp/tools.ts`), reachable by any client already authorized through the existing `mcp-authentik-auth` flow — this feature introduces no new authentication or authorization mechanism (spec Assumptions).

## Changed: shared `taskSummarySchema`

Every task-returning tool shares this object; it gains four fields (`research.md` R7):

```ts
const taskSummarySchema = {
  id: z.number(),
  title: z.string(),
  lane: z.string(),
  position: z.number(),
  createdAt: z.number(),
  archived: z.boolean(),
  dueDate: z.string().nullable(),       // NEW
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).nullable(), // NEW
  effort: z.enum(['S', 'M', 'L', 'XL']).nullable(),                 // NEW
  description: z.string().nullable(),   // NEW
};
```

Because `taskDetailOutputSchema` spreads `taskSummarySchema`, `get-task`'s output gains all four fields with no schema edit of its own beyond this shared object.

## Changed: `create-task`

### Input schema (updated)

```ts
{
  title: z.string(),
  note: z.string().optional(),
  lane: z.string().optional(),
  dueDate: z.string().optional(),                                    // NEW
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),  // NEW
  effort: z.enum(['S', 'M', 'L', 'XL']).optional(),                  // NEW
  description: z.string().optional(),                                 // NEW
}
```

- An omitted field creates the task with that field unset (`null`), matching FR-003/FR-009.
- An out-of-range `priority`/`effort` (e.g. `"Critical"`) is rejected by the SDK's schema validation before the handler runs — the task is not created (`research.md` R5).

### Output schema (updated)

`taskSummarySchema` (see above). `structuredContent` gains `dueDate: created.dueDate, priority: created.priority, effort: created.effort, description: created.description`, copied straight from the inserted row.

### Worked example

| Call | Result |
| --- | --- |
| `{ title: "Ship report", dueDate: "2026-09-10", priority: "Medium", effort: "M", description: "Quarterly export" }` | Task created with all four fields set; `get-task` and `list-board` both return the same four values (US3 acceptance scenario 2) |
| `{ title: "Draft budget" }` | Task created with all four fields `null` |

## Changed: `update-task`

Previously title-only and MCP-only ("no UI control for this feature" — that remains true for `title`, but not for the four new fields, which do have UI controls via `TaskFields.vue`).

### Input schema (updated)

```ts
{
  taskId: z.number().int().positive(),
  title: z.string().optional(),                                              // CHANGED: was required, now optional
  dueDate: z.string().nullable().optional(),                                 // NEW
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).nullable().optional(), // NEW
  effort: z.enum(['S', 'M', 'L', 'XL']).nullable().optional(),               // NEW
  description: z.string().nullable().optional(),                             // NEW
}
```

| # | Rule | Requirement |
| --- | --- | --- |
| B1 | Any subset of `title`/`dueDate`/`priority`/`effort`/`description` may be provided in one call | FR-010 |
| B2 | A key omitted from the call leaves that field unchanged | FR-010 |
| B3 | `dueDate`/`priority`/`effort`/`description` set to `null` explicitly clears that field | FR-010, Edge Cases |
| B4 | `title` set to an empty/whitespace string is rejected (existing `titleSchema` behavior, unchanged) — the call fails and no field changes, including any other fields also present in that same call | Consistency with existing rename validation |
| B5 | `priority`/`effort` outside the fixed lists are rejected by the SDK's schema validation before the handler runs — no field changes | FR-012 |

### Output schema (updated)

`taskSummarySchema`. `structuredContent` gains the four fields, copied from the updated row.

### Worked examples

| Call | Result |
| --- | --- |
| `{ taskId, priority: "Urgent", effort: "XL", dueDate: "2026-09-10", description: "Updated scope" }` | All four fields change in one call; `title` untouched (US3 acceptance scenario 3) |
| `{ taskId, dueDate: null }` | Only `dueDate` clears; `priority`/`effort`/`description`/`title` untouched (US3 acceptance scenario 3, second call) |
| `{ taskId, priority: "Critical" }` | Rejected with a validation error; `priority` (and everything else) unchanged (US3 acceptance scenario 1) |
| `{ taskId, title: "New name" }` | Renames only, identical to today's behavior |

## Changed: `list-board`

Per-task mapping (`.map(({ id, title, lane, position, createdAt, archived }) => ({ ... }))`) gains the four fields, copied straight from each row — no new input argument, no change to `search`/`tags`/`includeArchived` behavior.

## Changed: `move-task`, `archive-card`, `unarchive-card`

Each already builds its `structuredContent` from a full task row; each gains `dueDate: task.dueDate, priority: task.priority, effort: task.effort, description: task.description` in that mapping — no behavior change to what these tools *do*, purely completing their output shape per `research.md` R7.

## Explicitly unchanged

- `get-task` — no schema edit beyond the shared `taskSummarySchema`; `taskDetailContent()` gains the four fields in its return object.
- No MCP tool for deletion or lane placement changes.
- No due-before/due-date filter or query argument is added to `list-board` or any other tool (Out of Scope — recorded as a future MCP feature idea).
