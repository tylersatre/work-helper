# Future: mcp-server

## One-liner

Stand up the work-helper MCP server so AI agents can query and act on people, tasks, tags, and notes as consumers of the same data as the web app.

## Origin

- **Source:** `docs/product/brief.md` — the MCP server is a core concept ("a TypeScript web app that also exposes an MCP server") that has not been specced yet; its tools are listed as out of scope in `create-task.md`, `track-people.md`, and `task-notes.md`
- **Deferred because:** foundational UI slices were sequenced first; core-brief work awaiting its turn, not a scope split from a single feature
- **Recorded:** 2026-08-06

## Depends on

None strictly, but each tool surface presumes its entity has shipped: tasks (`create-task`, shipped), people (`track-people`), task notes (`task-notes`).

## Notes

- Architecture is already decided and binding (brief; constitution Principle IV): built on the official `@modelcontextprotocol/sdk`, no other MCP framework. Agents are consumers only — never the email-ingestion path.
- Decision made in the task-notes interview (2026-08-06): every note records a source, and notes created through MCP tools must carry source "mcp", which the UI displays as a "via MCP" label (UI-added notes show "You"). The schema and display ship with `task-notes`; this feature must write the correct source value.
- Decision made in the task-notes interview: notes are delete-only (never edited) regardless of source — MCP tools should not get an edit-note capability, pending Tyler's confirmation of the assumption that MCP notes are deletable like any other.
- Which tools make the first slice (query vs. create vs. link vs. tag) was never discussed and needs an interview.
