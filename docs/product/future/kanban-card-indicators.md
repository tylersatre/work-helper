# Future: kanban-card-indicators

## One-liner

Show at-a-glance indicators on kanban card faces — linked-people chips/avatars and a note count — instead of today's title-only cards.

## Origin

- **Source:** split from `docs/product/features/track-people.md` ("Showing linked people on the kanban card face (chips, avatars, counts)") and `docs/product/features/task-notes.md` (note count badge)
- **Deferred because:** both slices deliberately left board rendering untouched to stay thin; Tyler chose "no change to the card face" in both interviews
- **Recorded:** 2026-08-06

## Depends on

`track-people` shipped (people linked to tasks) and `task-notes` shipped (notes on tasks) — the indicators summarize data those features create.

## Notes

Nothing about the visual treatment was decided — chips vs. avatars vs. counts, and which indicators earn card-face space, are open interview questions. Both deferrals were purely about slice thinness, not doubts about the idea.
