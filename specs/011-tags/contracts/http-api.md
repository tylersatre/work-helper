# HTTP API Contract: Tags

All endpoints follow the existing conventions: JSON bodies, errors as `{ "error": { "message": string } }`, 400 for validation, 404 for missing records, 409 for uniqueness conflicts. Types reference [data-model.md](../data-model.md) (`Tag`, `TagWithCounts`).

## Vocabulary endpoints (new module `src/server/routes/tags.ts`)

### `GET /api/tags`

Returns the whole vocabulary as `TagWithCounts[]`, ordered by `peopleCount + tasksCount` descending, ties by `lower(name)` ascending (FR-009). Empty array when no tags exist. Counts feed the delete-confirmation dialog (research.md R7); the Tags page list does not display them.

```json
[ { "id": 1, "name": "VIP", "color": "#3B82F6", "peopleCount": 1, "tasksCount": 1 } ]
```

### `POST /api/tags`

Creates a tag with an auto-assigned color and no attachments (FR-015). Body: `{ "name": string }`.

- 201 → `Tag` (e.g. `{ "id": 2, "name": "Roadmap", "color": "#22C55E" }`)
- 400 `"A name is required"` — empty/whitespace name (after trim)
- 409 `"That tag name is already in use"` — case-insensitive duplicate

### `PATCH /api/tags/:id`

Renames and/or recolors. Body: `{ "name"?: string, "color"?: string }` (at least one).

- 200 → updated `Tag`
- 400 `"A name is required"` / `"A valid color is required"`
- 400 `"Nothing to update"` — empty body (neither `name` nor `color`)
- 404 `"Tag not found"`
- 409 `"That tag name is already in use"` — duplicate against any *other* tag; recasing the tag's own name succeeds

### `DELETE /api/tags/:id`

Deletes the tag and all its attachments (cascade, FR-012).

- 204, no body
- 404 `"Tag not found"`

## Attachment endpoints (added to `routes/people.ts` and `routes/tasks.ts`)

Symmetric for both record types; `record` below means the person or task addressed by the URL.

### `POST /api/people/:id/tags` and `POST /api/tasks/:id/tags`

Body: exactly one of `{ "tagId": number }` to attach an existing tag, **or** `{ "name": string }` to create-and-attach in one transaction (FR-004). A `name` that case-insensitively matches an existing tag attaches that tag instead of creating anything (research.md R6). Attaching an already-attached tag is a no-op.

- 200 → `{ "tags": Tag[] }` — the record's updated tag list, name-ordered
- 400 `"A name is required"` — name variant with empty/whitespace name
- 400 `"Provide a tagId or a name"` — body with neither or both of `tagId` and `name`
- 404 `"Person not found"` / `"Task not found"` / `"Tag not found"` (unknown `tagId`)

### `DELETE /api/people/:id/tags/:tagId` and `DELETE /api/tasks/:id/tags/:tagId`

Detaches the tag from the record only (FR-007). Detaching a tag that isn't attached is a no-op that still returns the current list.

- 200 → `{ "tags": Tag[] }`
- 404 `"Person not found"` / `"Task not found"`

## Extended existing responses

- `GET /api/people` — each person gains `tags: Tag[]` (people-list row chips, FR-006)
- `GET /api/people/:id` — gains `tags: Tag[]`
- `GET /api/tasks/:id` — gains `tags: Tag[]`

All `tags` arrays are ordered by name case-insensitively so every surface renders identically (SC-002).
