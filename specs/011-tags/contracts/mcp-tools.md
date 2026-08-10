# MCP Tool Contract: Tags

Only two tools change in this slice (spec assumption: tag write/search tools and tags in other tool responses stay in the `mcp-tool-expansion` stub). Authorization is unchanged — the whole MCP surface already sits behind the mcp-authentik-auth flow, which is what makes a client an "authorized agent" (FR-014).

## `get-person` — extended output

`outputSchema` gains:

```ts
tags: z.array(z.string())
```

Tag **names only** — no colors, no ids (clarified 2026-08-10). Ordered by name case-insensitively, matching the app's chip order. Empty array when the person has no tags.

Example `structuredContent` for a tagged person:

```json
{ "id": 3, "firstName": "Sam", "lastName": "Rivera", "email": null, "phone": null, "extraFields": {}, "tags": ["VIP"] }
```

## `get-task` — extended output

`outputSchema` gains the same field:

```ts
tags: z.array(z.string())
```

Example `structuredContent` fragment for a task tagged "VIP" and "Q3":

```json
{ "id": 7, "title": "Follow up with Sam", "lane": "Todo", "tags": ["Q3", "VIP"] }
```

## Unchanged

`list-board`, `search-people`, `create-task`, `add-note`, `sync-emails`, `list-conversations`, `get-conversation`, `emails-for-person` — no tag data in this slice.
