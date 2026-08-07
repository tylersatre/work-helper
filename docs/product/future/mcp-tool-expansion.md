# Future: mcp-tool-expansion

## One-liner

Grow the work-helper MCP beyond the first read + capture slice: linking people, deleting notes, moving tasks, and tool surfaces for entities that ship later (tags, emails).

## Origin

- **Source:** split from `docs/product/features/mcp-server.md`
- **Deferred because:** Tyler chose the "read + capture" tier for the first MCP slice (query tools plus create-task and add-note); everything write-shaped beyond that was split out to keep the slice thin
- **Recorded:** 2026-08-06

## Depends on

`mcp-server` shipped (auth plus the first tool set). Lane-targeting/move tools additionally depend on `move-task-between-lanes`; tag tools on a future tags feature (core-brief work, not yet specced or stubbed); email query tools on `email-ingestion`.

## Notes

- Candidate tools, in rough order of usefulness: link/unlink a person on a task; delete a note; create/edit people; move a task between lanes; tag tools; email query tools.
- Decided in the mcp-server interview: MCP mirrors the UI and gets no powers the UI lacks — so lane moves via MCP wait for the move feature to ship in the UI first.
- Carried over from the deleted mcp-server stub, still unconfirmed by Tyler: MCP-added notes are deletable like any other note. Also binding from task-notes: notes are delete-only — no edit-note tool, ever.
- After `multiple-emails-and-phones`, a person holds multiple email addresses and phone numbers with one primary of each — the mcp-server people tools deliberately keep returning only the primary email and phone; exposing the full lists (and managing them) is expansion work for this stub.
- Auth was fully decided in the mcp-server interview (single shared password from the environment, per-IP 3-failure lockout cleared by restart, password change as the revocation kill switch) — new tools inherit it; nothing new to decide there.
