# Future: mcp-tool-expansion

## One-liner

Grow the work-helper MCP beyond the first read + capture slice: linking people, deleting notes, moving tasks, and tool surfaces for entities that ship later (tags, emails).

## Origin

- **Source:** split from `docs/product/features/mcp-server.md`
- **Deferred because:** Tyler chose the "read + capture" tier for the first MCP slice (query tools plus create-task and add-note); everything write-shaped beyond that was split out to keep the slice thin
- **Recorded:** 2026-08-06

## Depends on

`mcp-server` shipped (auth plus the first tool set). Lane-targeting/move tools additionally depend on the `move-task-between-lanes` feature (specced 2026-08-08); tag tools on a future tags feature (see the `tags` stub); further email tools on `email-sync`.

## Notes

- Candidate tools, in rough order of usefulness: link/unlink a person on a task; delete a note; create/edit people; move a task between lanes; tag tools; email search.
- Email tools were partially pulled forward into `email-sync` (2026-08-07): list-conversations, get-conversation, emails-for-person, and the date-range sync trigger ship there. Remaining email expansion work here: free-text email search (offered in that interview, not chosen), plus whatever address-management tools emerge from the shared email-address model.
- Decided in the mcp-server interview: MCP mirrors the UI and gets no powers the UI lacks — so lane moves via MCP wait for the move feature to ship in the UI first. The `move-task-between-lanes` feature doc (2026-08-08) makes the existing board-listing tool reflect each task's lane and the manual within-lane card order; move/reorder write tools stay here and are unblocked once that feature ships.
- Carried over from the deleted mcp-server stub, still unconfirmed by Tyler: MCP-added notes are deletable like any other note. Also binding from task-notes: notes are delete-only — no edit-note tool, ever.
- After `multiple-emails-and-phones`, a person holds multiple email addresses and phone numbers with one primary of each — the mcp-server people tools deliberately keep returning only the primary email and phone; exposing the full lists (and managing them) is expansion work for this stub.
- Auth was fully decided in the mcp-server interview (single shared password from the environment, per-IP 3-failure lockout cleared by restart, password change as the revocation kill switch) — new tools inherit it; nothing new to decide there.
