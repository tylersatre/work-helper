# Contract: Dashboard HTTP API

**Branch**: `029-up-next-dashboard`. New routes live in `src/server/routes/dashboard.ts`, registered in `src/server/app.ts`. Error responses use the app-wide envelope `{ "error": { "message": string } }`. No auth (consistent with all `/api/**`; deployment fronts with Authentik). The saved view has **no MCP surface** (FR-012).

## GET /api/dashboard

Everything the page needs in one response; polled every 45s (research D5).

**Request**: no params.

**Response 200**:

```jsonc
{
  "lanes": ["Up Next", "In Progress", "Waiting", "Done"],          // configured lane order
  "defaultLanes": ["Up Next", "In Progress"],                      // config designation, fallback already applied ([first lane] when absent)
  "quickDoneLane": "Done",                                         // config designation, fallback already applied (last lane when absent)
  "savedView": null,                                               // DashboardSavedView | null — verbatim stored value if valid, null if never saved / invalid blob
  "cards": [                                                       // ALL non-archived cards in ALL configured lanes, ordered lane(config order) then position ASC, id ASC
    {
      "id": 1,
      "title": "Follow up with Sam",
      "lane": "Up Next",
      "position": 0,
      "createdAt": 1756100000000,
      "tags": [{ "id": 3, "name": "VIP", "color": "#e5484d" }],    // name COLLATE NOCASE order
      "searchText": "follow up with sam\nkickoff call went well\nsam rivera\nacme inc",  // filter corpus, never displayed
      "latestNote": { "text": "Kickoff call went well", "createdAt": 1756100000000 },    // newest by createdAt desc, id desc; null when no notes
      "people": [{ "id": 7, "name": "Sam Rivera" }],
      "companies": [{ "id": 2, "name": "Acme Inc" }]
    }
  ]
}
```

**Guarantees**: archived cards never included (FR-004); `savedView` is returned uninterpreted — stale lane names / tag ids are the client's to drop (FR-021, research D4); an absent/corrupt stored blob yields `savedView: null`, never an error.

## PUT /api/dashboard/view

Full replacement of the single saved view. Body = `DashboardSavedView` (schema shared from `src/shared/validation.ts`):

```jsonc
{
  "lanes": ["Up Next", "In Progress", "Waiting"],  // ≥1, unique, non-empty strings (names not checked against config — may legitimately go stale later)
  "tagIds": [3],                                   // unique integers
  "text": "",                                      // any string
  "limit": 7,                                      // integer 1–100
  "show": { "tags": true, "latestNote": true, "links": true, "lane": false }  // all four required booleans
}
```

**Responses**:

- `200` with the saved view echoed back — write succeeded (upsert into `app_state` key `dashboard.view`; last write wins, FR-019).
- `400` `{ error: { message } }` — schema violation (empty `lanes`, non-integer/out-of-range `limit`, missing toggle, wrong types). Nothing written.

## Reused existing contracts (unchanged by this feature)

- **Quick done** → `PUT /api/tasks/:id/placement` with `{ "lane": <quickDoneLane from GET /api/dashboard>, "index": 9007199254740991 }` (`Number.MAX_SAFE_INTEGER` = bottom-of-lane clamp). Existing responses: 200 updated task row; 400 `Invalid index` / `Unknown lane`; 404 `Task not found`. Dashboard behavior on non-ok: inline error + immediate refetch (edge case: concurrent move/archive/delete).
- **Add note** → `POST /api/tasks/:id/notes` with `{ "text": string }`. 201 note row (server sets `source: 'ui'` ⇒ detail view labels it "You"); 400 `Note text is required` (whitespace-only); 404 `Task not found`. Client pre-validates with the same shared `noteTextSchema` and shows the validation message without a request.
- **Detail overlay** → `GET /api/tasks/:id` (and the detail view's own mutation routes) exactly as the routed detail page uses them; the overlay renders the same extracted `TaskDetail` component (research D8).
