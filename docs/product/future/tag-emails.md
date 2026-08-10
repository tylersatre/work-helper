# Future: tag-emails

## One-liner

Extend tags to synced email — the third entity from the brief's "tags across people, emails, and tasks", after the first tags slice covered people and tasks.

## Origin

- **Source:** split from `docs/product/features/tags.md` — the tags feature idea deliberately named people and tasks only; `docs/product/brief.md` lists emails among the tagged entities
- **Deferred because:** synced email has no UI surface until `email-ui` ships (email is MCP-only today), so email tagging would have nothing user-visible to attach to; the tags slice stayed on the two entities with pages
- **Recorded:** 2026-08-10

## Depends on

`tags` shipped (the tag model and vocabulary) and `email-sync` shipped (emails exist to tag). A UI for applying and seeing email tags effectively depends on `email-ui`; MCP-side tagging depends on tag write tools from `mcp-tool-expansion`.

## Notes

- The tags feature decided one shared vocabulary across entity types — extending that same pool to emails (not a separate email-tag list) is the natural continuation.
- Undecided and needs an interview: whether tags attach to conversations or to individual messages (email-sync models both), and whether agents tagging emails via MCP arrives before or with the email UI.
