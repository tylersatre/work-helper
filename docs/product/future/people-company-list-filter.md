# Future: people-company-list-filter

## One-liner

Search and filter controls on the People and Companies lists — find a record by name or narrow to a tag, instead of scanning a fixed-order list.

## Origin

- **Source:** split from `docs/product/features/board-search-filter.md`; previously the "possible People-list tag filter" half of the retired `kanban-sort-filter` stub, deferred there by the tags interview (2026-08-10) and originally flagged out of scope in `docs/product/features/track-people.md`
- **Deferred because:** the 2026-08-20 filter slice was deliberately board-only; extending the same controls to two more list surfaces would have tripled the evidence burden
- **Recorded:** 2026-08-10 (re-scoped 2026-08-20)

## Depends on

`track-people` and `companies` shipped (the lists themselves) and `tags` shipped (the tag vocabulary a facet would filter on). `board-search-filter` shipped would give a filter-bar pattern to copy rather than invent.

## Notes

- `track-people` explicitly gave the People list a fixed order (alphabetical by last name) and no search box — a conscious v1 call, not an oversight. The narrow person-search widget used when linking a person to a card is a separate thing and stays as is.
- The `tags` interview (2026-08-10) deferred a People-list tag filter specifically; that is the single most-requested piece here.
- Natural shape when picked up: reuse `board-search-filter`'s bar — case-insensitive substring search plus a multi-select tag facet matching any selected tag, combined with AND, persisting until cleared.
- Open questions: what the text search covers on a person (name only, or contact entries and extra config fields too), whether the Companies list gets the same treatment in the same slice, and whether the Tags page itself needs a search once the vocabulary grows.
- The Emails page has its own separate stub, `email-search-filter` — a broader cross-surface filtering effort could pick up both at once.
