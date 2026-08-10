# Future: kanban-sort-filter

## One-liner

Sorting and filtering controls on the kanban board — view the board narrowed or ordered by criteria (e.g. filter by linked person, sort a lane by a field) per the brief's kanban concept.

## Origin

- **Source:** `docs/product/brief.md` — the kanban core concept names "dragging cards between lanes, sorting and filtering"; flagged as out of scope in `docs/product/features/move-task-between-lanes.md`
- **Deferred because:** the move slice deliberately pinned manual drag ordering as the board's only order; sort/filter controls are a separate surface with their own rules
- **Recorded:** 2026-08-08

## Depends on

`move-task-between-lanes` shipped (manual card order exists as the board's persistent base order). Filtering by tag additionally depends on the `tags` feature (specced 2026-08-10); filtering by linked person only needs `track-people`, which has shipped.

## Notes

- No interview has specced this — it exists as a backlog marker only, though the tags interview (2026-08-10) explicitly deferred every filter-by-tag control here: both a board filter and a possible tag filter on the People list.
- Key open question when picked up: manual order (from move-task-between-lanes) is persistent board state — is sorting a transient view on top of it, or does it rewrite the manual order? The MCP board-listing tool reflects the manual order, so a transient view would also need to decide what agents see.
- The people list also deliberately has no search/sort/filter controls (per track-people) — a broader filtering effort might span both surfaces, or this stub may stay board-only.
