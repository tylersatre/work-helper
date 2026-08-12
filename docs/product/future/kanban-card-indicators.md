# Future: kanban-card-indicators

## One-liner

Show at-a-glance indicators on kanban card faces — linked-people chips/avatars, a note count, and tag chips — instead of today's title-only cards.

## Origin

- **Source:** split from `docs/product/features/track-people.md` ("Showing linked people on the kanban card face (chips, avatars, counts)"), `docs/product/features/task-notes.md` (note count badge), `docs/product/features/tags.md` (tag chips on card faces), and `docs/product/features/card-email-links.md` (linked-email indicators on card faces, plus a has-linked-cards indicator on Emails page rows)
- **Deferred because:** all three slices deliberately left board rendering untouched to stay thin; Tyler chose "no change to the card face" in each interview
- **Recorded:** 2026-08-06 (updated 2026-08-12)

## Depends on

`track-people` shipped (people linked to tasks) and `task-notes` shipped (notes on tasks) — the indicators summarize data those features create. Tag chips additionally depend on the `tags` feature (specced 2026-08-10).

## Notes

Nothing about the visual treatment was decided — chips vs. avatars vs. counts, and which indicators earn card-face space, are open interview questions. All the deferrals were purely about slice thinness, not doubts about the idea. If tag chips come to cards, the tags feature's auto-colored chip rendering (consistent color per tag everywhere) is the natural starting point.

The card-email-links interview (2026-08-12) added two candidates: a linked-email indicator on the card face, and the mirrored idea — a has-linked-cards indicator on Emails page list rows (offered as "detail + list indicator" in that interview; Tyler chose conversation-detail-only backlinks for the slice). If row indicators come to the Emails page, they'd sit alongside the existing unread and attachment indicators from email-ui.
