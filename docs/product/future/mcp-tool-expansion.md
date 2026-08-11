# Future: mcp-tool-expansion

## One-liner

Grow the work-helper MCP beyond the first read + capture slice: linking people, deleting notes, moving tasks, and tool surfaces for entities that ship later (tags, emails).

## Origin

- **Source:** split from `docs/product/features/mcp-server.md`
- **Deferred because:** Tyler chose the "read + capture" tier for the first MCP slice (query tools plus create-task and add-note); everything write-shaped beyond that was split out to keep the slice thin
- **Recorded:** 2026-08-06

## Depends on

`mcp-server` shipped (auth plus the first tool set). Lane-targeting/move tools additionally depend on the `move-task-between-lanes` feature (specced 2026-08-08); tag tools on the `tags` feature (specced 2026-08-10); further email tools on `email-sync`.

## Notes

- Candidate tools, in rough order of usefulness: link/unlink a person on a task; delete a note; move a task between lanes; tag tools; email search. Create/edit people left this stub on 2026-08-11 — the `mcp-people-tools` feature doc covers person creation, name/extra-field edits, email/phone add/remove/set-primary, an unlinked-address discovery tool, and full lists in get-person. Declined in that interview and remaining here: delete-person via MCP (destructive power in agent hands — revisit deliberately), and full email/phone lists in search-people result rows (get-person got them; search rows stay primary-only).
- Email tools were partially pulled forward into `email-sync` (2026-08-07): list-conversations, get-conversation, emails-for-person, and the date-range sync trigger ship there. `email-sync-improvements` (2026-08-10) extends the read tools' responses with the newly captured data (display names, both timestamps, read state, importance, flags, categories, folder, attachment metadata, Outlook link) and keeps sync-emails' explicit-range requirement. Remaining email expansion work here: free-text email search (offered in that interview, not chosen — a UI search on the Emails page is recorded separately in the `email-search-filter` stub, 2026-08-11). The `email-ui` feature (specced 2026-08-11) shipped UI flows for linking an unmatched address to a person and creating a person from an address; their MCP equivalents (plus address management generally) are covered by the `mcp-people-tools` feature doc (2026-08-11).
- Decided in the mcp-server interview: MCP mirrors the UI and gets no powers the UI lacks — so lane moves via MCP wait for the move feature to ship in the UI first. The `move-task-between-lanes` feature doc (2026-08-08) makes the existing board-listing tool reflect each task's lane and the manual within-lane card order; move/reorder write tools stay here and are unblocked once that feature ships.
- Carried over from the deleted mcp-server stub, still unconfirmed by Tyler: MCP-added notes are deletable like any other note. Also binding from task-notes: notes are delete-only — no edit-note tool, ever.
- After `multiple-emails-and-phones`, a person holds multiple email addresses and phone numbers with one primary of each. The `mcp-people-tools` feature doc (2026-08-11) picks up managing those lists via MCP and full lists in get-person; search-people rows deliberately stay primary-only, recorded above as remaining work.
- The `tags` feature (2026-08-10) ships tag read exposure itself: get-person and get-task responses include the entity's tags. Remaining tag work here: write tools (attach/detach a tag, create/rename/recolor/delete tags), tag search or filter exposure, and tags in the search-people and list-board responses — all deliberately unchanged in the tags slice. Per the MCP-mirrors-the-UI decision, tag write tools are unblocked once the tags UI ships.
- Auth was decided in the mcp-server interview and revised by `mcp-authentik-auth` (2026-08-09): the interactive connect step requires signing in through Authentik and explicit approval, tokens are keyed to an operator-set `MCP_TOKEN_SECRET` (rotate to revoke every client), and the earlier shared-password/per-IP-lockout design is retired — new tools inherit the current Authentik-backed flow; nothing new to decide there.
