# Future: task-fields

## One-liner

Native structured fields on a card — due date, priority, effort, possibly a description — in both the web UI and MCP, retiring the current encoding of priority-as-position-in-Up-Next and deadline-as-title-text.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day; `create-task` deliberately scoped out "a description field, due dates, priority, assignees, or any other task metadata beyond title"
- **Deferred because:** Tyler chose to stub the audit's recommendations for future work rather than spec immediately
- **Recorded:** 2026-08-21

## Depends on

None strictly. Interacts with: the `custom-fields` stub (these are native fields with semantics, not the flexible custom-field mechanism — shipping these may shrink what custom-fields needs to cover); `mcp-update-task` (once fields exist, setting them via MCP is the natural companion, and due dates leaving titles reduces that stub's rename pressure); `board-search-filter` (shipped the board tools' text and tag filter arguments that a due-date filter would join); `kanban-card-indicators` and `kanban-lane-sorting` (whether card faces show these fields and whether lanes can sort by them belong to those stubs).

## Notes

- Decided 2026-08-21: these fields land on both surfaces, UI and MCP — no MCP-first exception here.
- Companion from the audit for when fields land: a due-before / due-date filter on the board-listing tool (or a task query tool), making a deadline-watch check cheap instead of a full-board scan.
- Which fields exactly, their types (date, ordered priority scale, effort scale, free-text description), whether they're all optional, and how existing title-encoded deadlines migrate (hand cleanup vs. any assist) are interview questions.
- The audit pairs this with writable tag tools as the two changes that together retire the position-and-title encoding; tag write tools are recorded in `mcp-tool-expansion` and already unblocked.
