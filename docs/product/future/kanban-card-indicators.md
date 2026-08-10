# Future: kanban-card-indicators

## One-liner

Show at-a-glance indicators on kanban card faces — linked-people chips/avatars, a note count, and tag chips — instead of today's title-only cards.

## Origin

- **Source:** split from `docs/product/features/track-people.md` ("Showing linked people on the kanban card face (chips, avatars, counts)"), `docs/product/features/task-notes.md` (note count badge), and `docs/product/features/tags.md` (tag chips on card faces)
- **Deferred because:** all three slices deliberately left board rendering untouched to stay thin; Tyler chose "no change to the card face" in each interview
- **Recorded:** 2026-08-06

## Depends on

`track-people` shipped (people linked to tasks) and `task-notes` shipped (notes on tasks) — the indicators summarize data those features create. Tag chips additionally depend on the `tags` feature (specced 2026-08-10).

## Notes

Nothing about the visual treatment was decided — chips vs. avatars vs. counts, and which indicators earn card-face space, are open interview questions. All three deferrals were purely about slice thinness, not doubts about the idea. If tag chips come to cards, the tags feature's auto-colored chip rendering (consistent color per tag everywhere) is the natural starting point.
