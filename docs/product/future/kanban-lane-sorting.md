# Future: kanban-lane-sorting

## One-liner

Sorting controls on the kanban board — order a lane's cards by a field (e.g. title, age, tag) instead of only by manual drag order.

## Origin

- **Source:** split from `docs/product/features/board-search-filter.md`; previously half of the retired `kanban-sort-filter` stub, itself traced to `docs/product/brief.md` ("dragging cards between lanes, sorting and filtering") and flagged out of scope in `docs/product/features/move-task-between-lanes.md`
- **Deferred because:** the board-search-filter interview (2026-08-20) deliberately took the filter half only; sorting brings its own unresolved conflict with persistent manual order and would have doubled the slice
- **Recorded:** 2026-08-08 (re-scoped 2026-08-20)

## Depends on

`move-task-between-lanes` shipped (manual card order exists as the board's persistent base order). Nothing in `board-search-filter` blocks it, though the two share the same filter/sort bar surface.

## Notes

- The key open question, unchanged since 2026-08-08: manual order is persistent board state — is a sort a transient view layered on top of it, or does it rewrite the stored manual order? The MCP board-listing tool reflects manual order, so a transient view also has to decide what agents see.
- `board-search-filter` set a useful precedent for that question: while a filter is active, cross-lane drags append to the bottom of the destination lane and within-lane reordering is disabled — i.e. the persistent manual order is protected rather than silently rewritten when the view no longer matches it. Sorting should probably follow the same instinct.
- Which fields are worth sorting by was never discussed. Cards currently carry title, lane, manual position, notes (with timestamps), tags, linked people, linked companies, and linked email conversations; `task-fields` (2026-08-26) added due date, priority, and effort fields (plus a description) — natural sort-by candidates now that they exist. There is still no created-date shown anywhere in the UI.
- The filter bar from `board-search-filter` (search input, tag selector, active-filter indicator, clear control) is the natural place to hang a sort control.
