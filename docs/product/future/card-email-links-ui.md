# Future: card-email-links-ui

## One-liner

In-app controls for card↔email links — a search/add section on the card detail, create-card and link-existing-card controls on the conversation detail, and remove controls on both — on top of the MCP-only linking that card-email-links ships.

## Origin

- **Source:** split from `docs/product/features/card-email-links.md`
- **Deferred because:** Tyler descoped the UI write controls during doc review — MCP linking is all he needs for now (agents make the links; the web app just shows them read-only)
- **Recorded:** 2026-08-12

## Depends on

`card-email-links` shipped (the link model, MCP tools, and the read-only linked sections these controls would live in).

## Notes

The 2026-08-12 interview settled the UI shape before the descope, so these are answered questions, not open ones:

- Card side: the linked-emails section gains a search box — case-insensitive substring match on conversation subject, result rows showing subject, participants, and latest-message date.
- Conversation side: two controls — create-card (opens the create form with the title prefilled from the subject, editable, normal title validation; the new card lands in the first configured lane already linked) and link-existing-card (case-insensitive substring match on card title, result rows showing title and lane).
- Already-linked entries are excluded from picker results so the same pair can't be linked twice.
- Removal works from either side with no confirmation prompt — a link is lightweight metadata, matching how removing a linked person or company works.
