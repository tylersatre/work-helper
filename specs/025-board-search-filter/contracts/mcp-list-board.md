# Contract: MCP tool `list-board`

Existing tool in `src/server/mcp/tools.ts`, gaining two optional filter arguments (FR-017, FR-018). Registered on the official `@modelcontextprotocol/sdk` server, reachable by any client authorized through the existing `mcp-authentik-auth` flow — this feature adds no auth behaviour of its own.

## Description (updated)

> Lists the board's lanes and the tasks in each, in configured lane order. Optionally narrows the board to cards matching a case-insensitive text search (over card title, note text, and linked person/company names) and/or carrying any of the given tags.

## Input schema

```ts
{
  search: z.string().optional(),        // case-insensitive substring; trimmed; whitespace-only = no filter
  tags:   z.array(z.string()).optional() // tag NAMES, matched case-insensitively; a card matches if it carries ANY
}
```

| # | Rule | Requirement |
| --- | --- | --- |
| M1 | `search` omitted, empty, or whitespace-only ⇒ no text filter | FR-004 |
| M2 | `search` matches a card when the trimmed, lowercased value is a substring of the card's title, any note text, or any linked person/company name | FR-002, FR-017 |
| M3 | `tags` omitted or `[]` ⇒ no tag filter | FR-018 |
| M4 | A card matches `tags` when it carries **at least one** named tag; names resolve case-insensitively | FR-006 |
| M5 | A name matching no existing tag contributes no match — not an error | R6 |
| M6 | With both arguments, a card must satisfy **both** conditions | FR-008 |
| M7 | With neither argument, the whole board is returned unchanged from today's behaviour | FR-018 |
| M8 | Results are always grouped under their lane in configured lane order, tasks in board order (`position ASC, id ASC`); lanes with no matches appear with `tasks: []` | FR-018 |
| M9 | Matching uses the same `matchesBoardFilter` used by the UI, so results are identical to the equivalent UI filter | SC-006 |
| M10 | The tool performs no writes | SC-007 |

## Output schema (shape unchanged)

```ts
{ lanes: z.array(z.object({ name: z.string(), tasks: z.array(z.object(taskSummarySchema)) })) }
```

`taskSummarySchema` is unchanged — the `tags`/`searchText` enrichment is an internal matching detail and is **not** added to the MCP output, so existing agent callers see the same task shape.

## Worked examples (spec's seeded board)

| Call | `structuredContent.lanes` (non-empty lanes only) |
| --- | --- |
| `{}` | To Do: `Follow up with Sam`; In Progress: `Write proposal`, `Review budget`; Waiting: `Book venue`; Done: `Prep board deck`, `Send recap` |
| `{ search: "budget" }` | In Progress: `Write proposal`, `Review budget` |
| `{ tags: ["Q3"] }` | In Progress: `Write proposal`; Done: `Prep board deck`, `Send recap` |
| `{ search: "budget", tags: ["Q3"] }` | In Progress: `Write proposal` |
| `{ search: "rivera" }` | To Do: `Follow up with Sam` |
| `{ search: "  budget  " }` | identical to `{ search: "budget" }` |
| `{ search: "   " }` | identical to `{}` |
| `{ tags: ["Prospect"] }` | none — no card carries it |

The text summary line (`content[0].text`) reports the number of matching cards so a human-readable client sees the narrowing too; the authoritative result is `structuredContent`.
