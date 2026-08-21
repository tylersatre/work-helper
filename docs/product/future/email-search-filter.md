# Future: email-search-filter

## One-liner

Search and filter controls on the Emails page — find conversations by text (subject, participants) or facets (e.g. unread, folder, person) instead of paging the newest-first list.

## Origin

- **Source:** split from `docs/product/features/email-ui.md`
- **Deferred because:** Tyler chose a newest-first list with load-more for the first browsing slice; search and filter controls are their own surface with their own rules
- **Recorded:** 2026-08-11

## Depends on

`email-ui` shipped (the Emails page these controls would live on).

## Notes

- Offered in the email-ui interview as either simple text search (over subject and participant names/addresses) or filter controls (e.g. unread only, by folder); neither was chosen — deferred purely for slice thinness, not on the merits. Which of the two shapes (or both) to build is the interview question when picked up.
- MCP-side free-text email search is recorded separately in `mcp-tool-expansion` (offered in the email-sync interview, not chosen); a UI search would likely share whatever query machinery that tool gets.
- Reaffirmed by the 2026-08-21 MCP audit: finding a specific thread ("that thread from Corey about MI setup") is currently a newest-first crawl or a per-person listing — demand is real on both the UI and MCP sides.
- The People list and kanban board also deliberately lack search/filter controls (board filtering is specced as `board-search-filter`; remaining list filtering is recorded in `people-company-list-filter`); a broader cross-surface filtering effort may pick up several of these at once.
