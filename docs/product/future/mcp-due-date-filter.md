# Future: mcp-due-date-filter

## One-liner

A due-before / due-date filter argument on the board-listing MCP tool (or a dedicated task query tool), so an agent can cheaply ask "what's due soon" instead of scanning the full board.

## Origin

- **Source:** carried over from the `task-fields` future stub's notes, itself from the 2026-08-21 MCP tool-surface audit reviewed with Tyler that day
- **Deferred because:** the audit paired this with the due-date field itself but scoped it as a follow-on once the field existed; `task-fields` (2026-08-26) shipped the field but deliberately left board/MCP filtering out of its slice
- **Recorded:** 2026-08-26

## Depends on

`task-fields` shipped (the due date field exists on tasks and is returned by get-task and the board-listing tool).

## Notes

Nothing about the exact shape was decided. Candidates from the audit: a `due_before` argument on the existing board-listing tool (mirroring `board-search-filter`'s text/tag arguments), or a separate task-query tool scoped to deadline lookups. Whether it should also support "no due date" and "overdue" as filter states, and how it interacts with lane/tag/text filters already on that tool, are interview questions for when this is picked up.
