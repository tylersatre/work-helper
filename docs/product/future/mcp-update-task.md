# Future: mcp-update-task

## One-liner

An `update-task` MCP tool that renames a card's title after creation, so slipped deadlines encoded in title text and typos stop being permanent.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day; `create-task` deliberately scoped out all post-creation editing ("title, description, or anything else")
- **Deferred because:** Tyler chose to stub the audit's recommendations for future work rather than spec immediately
- **Recorded:** 2026-08-21

## Depends on

None — `create-task` and `get-task` shipped. Interacts with the `task-fields` stub: once native due/priority/effort fields exist, deadlines leave titles and the rename pressure drops, but doesn't disappear (typos and re-scoped work remain).

## Notes

- Decided 2026-08-21: this is a sanctioned exception to the MCP-mirrors-the-UI rule — the MCP gets title rename first, with no requirement that a UI rename ship before or alongside it (precedent: create-task's MCP-only lane parameter). A UI title edit can still follow later as its own idea.
- Title-only rename is the audit's "solves 90% of it" scope. Whether update-task later grows to set the `task-fields` fields is that stub's concern, not a reason to widen this one.
- Pain being solved: deadlines live in title text ("(due Aug 30)"), so a slipped date means a permanently wrong title, and the only workaround — create a new card, move it, re-link everything — destroys note history and the card id.
- Interview questions: whitespace/empty-title rejection presumably mirrors create-task's rule; whether a rename is worth an automatic audit note (an automatic "moved via MCP" note was declined in the mcp-move-tasks interview — the same call likely applies).
