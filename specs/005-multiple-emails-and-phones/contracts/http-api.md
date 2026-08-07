# HTTP API Contract: Multiple Emails and Phones per Person

All endpoints are JSON over the existing Fastify server. Error bodies follow the app-wide shape `{ "error": { "message": "..." } }`. The two entry types have mirror-image endpoint sets; `:type` below stands for `emails` or `phones` and "the type's conflict message" is "That email is already in use" / "That phone number is already in use" respectively.

## Shared payload shapes

**ContactEntry** (returned inside person payloads and entry mutation responses):

```json
{ "id": 7, "value": "sam.rivera@example.com", "isPrimary": true, "createdAt": 1754500000000 }
```

**Person** (returned by every person endpoint; `email`/`phone` scalar fields are GONE):

```json
{
  "id": 3,
  "firstName": "Sam",
  "lastName": "Rivera",
  "emails": [ { "id": 7, "value": "sam.rivera@example.com", "isPrimary": true, "createdAt": 1754500000000 } ],
  "phones": [ { "id": 4, "value": "555-0100", "isPrimary": true, "createdAt": 1754500000000 } ],
  "extraFields": {},
  "createdAt": 1754500000000
}
```

`emails` and `phones` are always present (possibly empty `[]`) and ordered by `id` ascending.

## New endpoints — entry management (×2 types)

### POST `/api/people/:personId/:type` — add an entry

Request: `{ "value": "sam.p@example.com" }`

| Case | Status | Body |
|---|---|---|
| Added (first entry of type → stored primary; otherwise non-primary) | 201 | `{ "entries": [ ...full refreshed list of that type... ] }` |
| Blank/whitespace value | 400 | `{ "error": { "message": "A value is required" } }` |
| Person not found | 404 | `{ "error": { "message": "Person not found" } }` |
| Value already in use (any person, any entry; email case-insensitive, phone exact) | 409 | `{ "error": { "message": <type's conflict message> } }` |

### PATCH `/api/people/:personId/:type/:entryId` — edit an entry's value

Request: `{ "value": "sam.p@example.com" }`

| Case | Status | Body |
|---|---|---|
| Updated (primary flag untouched) | 200 | `{ "entries": [ ... ] }` |
| Blank/whitespace value | 400 | `{ "error": { "message": "A value is required" } }` |
| Person not found | 404 | `{ "error": { "message": "Person not found" } }` |
| Entry not found on that person | 404 | `{ "error": { "message": "Entry not found" } }` |
| Value collides with any entry other than this one (re-casing itself is allowed) | 409 | `{ "error": { "message": <type's conflict message> } }` |

### PUT `/api/people/:personId/:type/:entryId/primary` — mark an entry primary

No request body.

| Case | Status | Body |
|---|---|---|
| Primary moved (or was already primary — no-op success) | 200 | `{ "entries": [ ... ] }` |
| Person not found | 404 | `{ "error": { "message": "Person not found" } }` |
| Entry not found on that person | 404 | `{ "error": { "message": "Entry not found" } }` |

### DELETE `/api/people/:personId/:type/:entryId` — remove an entry

| Case | Status | Body |
|---|---|---|
| Removed (if it was primary and survivors remain, lowest-id survivor is now primary; removing the last entry is valid) | 200 | `{ "entries": [ ... ] }` |
| Person not found | 404 | `{ "error": { "message": "Person not found" } }` |
| Entry not found on that person | 404 | `{ "error": { "message": "Entry not found" } }` |

Note: this DELETE returns 200 with the refreshed list (not the app's usual 204) because the client must learn which survivor was auto-promoted.

## Changed endpoints

### POST `/api/people` — create person

Request shape unchanged: `{ "firstName", "lastName", "email"?, "phone"?, "extraFields"? }`. A provided email/phone becomes that person's primary entry.

| Case | Status | Body |
|---|---|---|
| Created | 201 | Person (new shape, with `emails`/`phones` arrays) |
| Missing names | 400 | `{ "error": { "message": "First and last name are required" } }` |
| Email already in use (existing behavior) | 409 | `{ "error": { "message": "That email is already in use" } }` |
| **NEW** — phone already in use | 409 | `{ "error": { "message": "That phone number is already in use" } }` |

On any conflict no person row is created. If both values conflict, the email message is returned (email is checked first).

### PUT `/api/people/:id` — update person

Request now carries names and `extraFields` only; `email`/`phone` keys in the body are ignored (stripped), never applied. Responses keep their statuses (200 with new-shape Person / 400 names / 404) — the 409 email-conflict case no longer exists here since the endpoint cannot change contact data.

### GET `/api/people`, GET `/api/people/:id`

Payloads switch to the new Person shape. The list query's `q` substring search matches first name, last name, and **primary** email only (existing reach preserved; searching all addresses is out of scope).

### DELETE `/api/people/:id`

Unchanged (204); entry rows cascade-delete with the person.

## Unchanged endpoints

`/api/person-fields`, all `/api/tasks*`, `/api/board`, and the MCP/OAuth routes are untouched by this feature (see [mcp-tools.md](mcp-tools.md) for the tool-value projection).
