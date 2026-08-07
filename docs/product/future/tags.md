# Future: tags

## One-liner

Tags as a first-class model — flexible labels attachable to people, emails, and tasks, per the brief's core concepts.

## Origin

- **Source:** `docs/product/brief.md` — "tags and custom fields" are a core concept not yet specced; explicitly flagged by Tyler during the `multiple-emails-and-phones` interview as something that should become a model
- **Deferred because:** the multiple-emails-and-phones slice was kept to contact details only; tags are a separate entity with their own UI and rules, too big to ride along
- **Recorded:** 2026-08-07

## Depends on

None strictly — people and tasks exist to tag today. Tagging emails additionally depends on `email-ingestion`. MCP tag tools (see `mcp-tool-expansion`) depend on this shipping first.

## Notes

Nothing product-level has been decided — Tyler only confirmed tags belong in the data model. Open questions for the future `/new-feature` interview: which entities get tags first (people, tasks, or both); free-form creation vs. a managed tag list; color/appearance; filtering by tag (note the people list and kanban currently have no filter controls at all); whether the custom-fields half of the brief's "tags and custom fields" is part of the same feature or separate (person custom fields already partially exist via the track-people field config).
