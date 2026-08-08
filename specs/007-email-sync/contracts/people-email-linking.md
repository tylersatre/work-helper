# Contract: People API — email linking delta

**Feature**: 007-email-sync | **Surface**: existing REST endpoints in `src/server/routes/people.ts`

No endpoint paths, request shapes, or response shapes change. This contract pins the behavior delta that the shared email-address model (research R7, data-model `email_addresses`) introduces behind the existing surface, so the People page keeps working exactly as today (FR-011) with one addition.

## POST `/api/people/:personId/emails` — add email

Request `{ value: string }`, unchanged.

| Case | Today | This feature |
|---|---|---|
| Value is new (no record, any case) | 201, inserted for the person | Unchanged |
| Value exists (case-insensitively) on **another person** | 409 `{ error: { message: "That email is already in use" } }` | Unchanged (FR-012) |
| Value exists (case-insensitively) as an **unlinked** record from synced mail | — (state impossible today) | **201** — the existing record is linked to the person (its id and stored casing kept; primary iff the person had no email). All previously synced mail involving it immediately counts as the person's correspondence — no reingestion (FR-011, SC-004) |
| Missing/blank value | 400 `A value is required` | Unchanged |

## PATCH `/api/people/:personId/emails/:entryId` — edit email value

Unchanged, with one clarified rule: a new value that collides case-insensitively with **any** existing record — linked to anyone **or unlinked** — is a 409 conflict. Editing never merges or silently absorbs an unlinked record; linking is only offered through add.

## PUT `.../primary`, DELETE `.../:entryId` — primary / remove

Response shapes unchanged. Remove semantics under the hood: if the address is referenced by synced mail, the record is unlinked (kept for the snapshot) instead of deleted; either way it disappears from the person and from `GET /api/people/:id`, and primary reassignment behaves as today. Unlinked records never appear in any People API response.

## DELETE `/api/people/:id` — delete person

Unchanged response. Each of the person's email addresses follows the remove rule above (unlink if referenced by synced mail, delete otherwise). Phones are untouched by this feature.

## Non-changes worth stating

- `GET /api/people` search and `GET /api/people/:id` never surface unlinked addresses.
- MCP `search-people` / `get-person` / `get-task` outputs are unchanged (they read via the person's linked emails only).
- Nothing in the People API can create, edit, or delete synced messages, conversations, or participants.
