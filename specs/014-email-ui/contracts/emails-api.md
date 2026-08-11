# Contract: Email UI HTTP API

**Feature**: 014-email-ui | **Date**: 2026-08-11 | Shapes defined in [data-model.md](../data-model.md); decisions in [research.md](../research.md)

All endpoints follow the app-wide conventions: JSON bodies, errors as `{ error: { message: string } }` from the global handler, no auth (single-user app behind the home-server boundary), registered without prefix in `src/server/app.ts`. The three read endpoints are new (`src/server/routes/emails.ts`); the two write flows reuse existing endpoints unchanged (R7).

## New: `GET /api/emails/conversations`

Conversation list for the Emails page (FR-002…FR-006).

**Query parameters**: `limit` — optional integer 1–100, default **25** (the spec-pinned page size); `cursor` — optional opaque cursor from a previous response.

**200 response**:

```json
{
  "conversations": [
    {
      "id": 12,
      "subject": "Quote attached",
      "messageCount": 1,
      "latestMessageAt": 1786093260000,
      "hasUnread": true,
      "hasAttachments": true,
      "participants": [
        { "address": "sam.rivera@example.com", "displayName": "Sam Rivera", "person": { "id": 3, "name": "Sam Rivera" } },
        { "address": "tyler@example.com", "displayName": "Tyler Satre", "person": null }
      ]
    }
  ],
  "nextCursor": "eyJwcmltYXJ5IjoxNzg2MDkzMjYwMDAwLCJpZCI6MTJ9"
}
```

**Semantics**: ordered `(latestMessageAt DESC, id DESC)`; `nextCursor` is `null` when nothing more exists (drives the load-more control's absence, FR-005); `hasAttachments` counts **non-inline** attachments only (FR-004); an empty store returns `{ "conversations": [], "nextCursor": null }` (drives the empty state, FR-006); `subject` may be `""` — the client renders the "(no subject)" placeholder.

**Errors**: `400` `Invalid cursor` — malformed `cursor`; `400` `Invalid limit` — non-integer or out-of-range `limit`.

## New: `GET /api/emails/conversations/:id`

Full conversation detail (FR-007…FR-011).

**200 response** (abridged to one message; `messages` is ordered oldest-first and complete):

```json
{
  "id": 12,
  "subject": "Quote attached",
  "messages": [
    {
      "id": 40,
      "subject": "Quote attached",
      "sentAt": 1786093200000,
      "receivedAt": 1786093260000,
      "bodyOriginal": "<p>Quote is <b>attached</b>.</p>",
      "bodyContentType": "html",
      "sourceFolder": "Inbox",
      "isRead": false,
      "importance": "high",
      "flagStatus": "flagged",
      "categories": ["Orange category"],
      "webLink": "https://outlook.office365.com/owa/?ItemID=...",
      "attachments": [{ "name": "quote.pdf", "contentType": "application/pdf", "sizeBytes": 53248 }],
      "participants": [
        { "address": "sam.rivera@example.com", "displayName": "Sam Rivera", "role": "from", "person": { "id": 3, "name": "Sam Rivera" } },
        { "address": "tyler@example.com", "displayName": "Tyler Satre", "role": "to", "person": null }
      ]
    }
  ]
}
```

**Semantics**: `bodyOriginal` is the stored body exactly as delivered — the client sanitizes before render (R2/R3); `attachments` excludes inline rows (FR-010) — a message whose only attachments are inline has `attachments: []`; `participants.person: null` marks an unmatched address, for which the client shows the link/create controls (FR-012/FR-013); `displayName` may be `""` (client shows the bare address).

**Errors**: `404` `Conversation not found` — unknown or non-numeric id.

## New: `GET /api/people/:personId/email-conversations`

The person record's email section (FR-015/FR-016). Path deliberately avoids `/api/people/:personId/emails`, which already means "email address contact entries" (R7).

**200 response**:

```json
{
  "conversations": [
    {
      "conversationId": 12,
      "subject": "Quote attached",
      "latestMessageAt": 1786093260000,
      "addresses": [{ "address": "sam.rivera@example.com", "roles": ["from"] }]
    },
    {
      "conversationId": 7,
      "subject": "Pricing question",
      "latestMessageAt": 1786028400000,
      "addresses": [
        { "address": "sam.rivera@example.com", "roles": ["from", "to"] },
        { "address": "sam.personal@example.com", "roles": ["cc"] }
      ]
    }
  ]
}
```

**Semantics**: all of the person's conversations, ordered `(latestMessageAt DESC, conversationId DESC)` — the client shows 5 and reveals the rest with show-all (R8); `addresses` lists the person's distinct involved addresses in that conversation, each with its distinct roles across the conversation's messages (clarification 2026-08-11); a person with no synced mail returns `{ "conversations": [] }` (drives the section's empty state).

**Errors**: `404` `Person not found`.

## Reused (unchanged): link an unmatched address — `POST /api/people/:personId/emails`

The detail view's link control submits `{ "value": "<the participant address string>" }` after the user picks a person from the search. The existing `addEntry` service implements FR-014's shared rules: an existing unlinked `email_addresses` row is linked in place (preserving stored casing and participant references), primary is set iff the person had no email.

**Responses**: `201` `{ entries }` — linked; `409` `That email is already in use` — the address is linked to someone (e.g. raced from another tab; surfaced as the control's error text); `404` `Person not found`.

## Reused (unchanged): create a person from an address — `POST /api/people`

The detail view's create-person control opens `PersonForm` (create mode) with `initialValues` prefilled — `firstName`/`lastName` from a two-word display-name split, blank otherwise; `email` = the address — and submits the form's normal payload. The existing `createPerson` service links the pre-existing unlinked address row instead of inserting a duplicate.

**Responses**: `201` person record; `400` `First and last name are required` — normal validation (single-word/missing display-name edge case); `409` `That email is already in use` — address raced into a link.

## Reused (unchanged): person search — `GET /api/people?q=`

The link control's search, identical to the task-linking widget (spec assumption): case-insensitive substring over first name, last name, and primary email; returns full person records ordered by last then first name; the control renders "First Last — primary email" rows.

## MCP invariance (FR-018)

No MCP tool changes. `list-conversations`, `get-conversation`, and `emails-for-person` keep byte-identical output shapes and semantics — including counting inline attachments in `hasAttachments` and attachment lists — pinned by regression tests over a store containing inline attachments (R6).
