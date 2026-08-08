# MCP Tools Contract: Move Task Between Lanes

**Feature**: `008-move-task-between-lanes` | Server: existing `work-helper` MCP (`src/server/mcp/tools.ts`)

**No new tools. No removed tools. No new input parameters.** Placement remains read-only over MCP in this slice; move/reorder write tools stay in the `mcp-tool-expansion` stub (PRD out-of-scope). Auth is unchanged from the mcp-server feature.

## Output schema change (additive)

The shared `taskSummarySchema` gains `position: z.number()` — the task's 0-based slot within its lane. This flows into every tool that emits task summaries:

| Tool | Change |
|---|---|
| `list-board` | Each task in `lanes[].tasks[]` includes `position`; **tasks within each lane are ordered by `(position ASC, id ASC)`** — the same top-to-bottom order the board UI shows (FR-010, SC-005) |
| `get-task` | Structured output includes `position` |
| `create-task` | Structured output includes `position`; the created task appends at the bottom of the first configured lane (FR-008) |
| `search-people`, `get-person`, `add-note` | Unchanged |

## Ordering guarantee (the point of FR-010)

`list-board` derives lane contents through the same `listTasksByLane` service function as `GET /api/board`. There is no MCP-specific ordering logic to drift: whatever arrangement Tyler drags into the board is, by construction, what an authorized agent reads. The integration test arranges a board via `PUT /api/tasks/:id/placement`, then asserts the MCP client's `list-board` result lists each lane's tasks in exactly that order.

## Compatibility

Adding an output field is backward compatible for MCP clients (unknown fields in `structuredContent` are ignorable; the advertised output schema simply becomes richer). Existing clients that relied on `list-board`'s previous incidental id-order will now see manual order — that is the feature, not a regression.
