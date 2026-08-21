# Future: kanban-filter-facets

## One-liner

More board filter facets beyond tags — linked person, linked company, has-linked-emails, lane — plus saved filter presets.

## Origin

- **Source:** split from `docs/product/features/board-search-filter.md`
- **Deferred because:** the 2026-08-20 interview chose tags as the single facet for the first filter slice; a card's people and companies are already reachable by name through that slice's text search, which made dedicated facet controls the easiest thing to cut
- **Recorded:** 2026-08-20

## Depends on

`board-search-filter` shipped (the filter bar, the hide-non-matching board behavior, the filter-persistence and drag-while-filtered rules these facets would inherit).

## Notes

- Facets offered in the interview and not chosen: **linked person** (needs only `track-people`, shipped), **linked company** (from `companies`), and a **has linked emails** yes/no toggle (from `card-email-links`). A lane facet was never offered — with lanes always visible on a filtered board it may be redundant.
- Also deferred here: **saved filters/presets**. The shipped slice persists the current filter until cleared but has no way to name and recall one.
- Combination rules the shipped slice established, which new facets should almost certainly follow: multi-select within a facet matches **any** selected value; separate facets combine with **AND**; the active-filter indicator reads "N of M cards".
- Open when picked up: whether each new facet also becomes an argument on the MCP board-listing tool, as the text search and tag filter did in the first slice.
- Deliberately **not** deferred here (permanent non-goals from the interview): fuzzy/ranked matching, boolean or field-prefixed query syntax (`tag:VIP`), and match highlighting on card faces.
