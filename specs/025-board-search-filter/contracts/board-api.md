# Contract: `GET /api/board`

The board's only listing endpoint, consumed by `Board.vue`. This feature **enriches** the existing response; it adds no query parameters, because filtering happens in the client against the full board (see `research.md` R1).

## Request

`GET /api/board` — no parameters. Unchanged.

## Response `200`

```jsonc
{
  "lanes": [
    {
      "name": "To Do",
      "tasks": [
        {
          "id": 1,
          "title": "Follow up with Sam",
          "lane": "To Do",
          "position": 0,
          "createdAt": 1755648000000,

          // added by this feature:
          "tags": [{ "id": 3, "name": "VIP", "color": "#f59e0b" }],
          "searchText": "follow up with sam\nkickoff call went well\nsam rivera"
        }
      ]
    },
    { "name": "In Progress", "tasks": [] },
    { "name": "Waiting", "tasks": [] },
    { "name": "Done", "tasks": [] }
  ]
}
```

## Guarantees

| # | Guarantee | Requirement |
| --- | --- | --- |
| B1 | Every configured lane is present, in configured order, whether or not it has cards | FR-009 (pre-existing) |
| B2 | Tasks within a lane keep `position ASC, id ASC` order | FR-010, SC-005 |
| B3 | Every task carries `tags`, its attached tags ordered by name (`COLLATE NOCASE`); `[]` when it has none | FR-005, FR-006 |
| B4 | Every task carries `searchText`: its title, every note's text, and every linked person's and company's name, `\n`-joined and **lowercased** | FR-002 |
| B5 | A task with no notes, no links, and no tags still returns a valid `searchText` (its lowercased title) and `tags: []` | edge case "Cards with no notes, tags, or links" |
| B6 | Existing fields (`id`, `title`, `lane`, `position`, `createdAt`) are unchanged in name, type, and value | non-regression |
| B7 | The endpoint performs no writes | SC-007 |

## Unchanged endpoints this feature depends on

- `PUT /api/tasks/:id/placement` — body `{ lane, index }`. A cross-lane drag while filtered calls it with `index` equal to the destination lane's **unfiltered** task count (FR-015). A within-lane drag while filtered issues **no** call at all (FR-016). No change to the endpoint itself.
