# HTTP API Contracts: Email Drafts

**Feature**: `031-mcp-email-drafts`

Fastify routes, registered in `src/server/app.ts`; request schemas in `src/shared/validation.ts`, payload types in `src/shared/types.ts`. Errors follow the house shape `{ error: { message } }`.

## New: signature endpoints (`src/server/routes/email-signature.ts`)

### `GET /api/email-signature`

Returns the saved signature, or null when none has ever been saved (or it was cleared).

```json
{ "signature": "<p>Tyler Satre</p><p>Example Corp</p>" }
```

```json
{ "signature": null }
```

### `PUT /api/email-signature`

Saves the signature as a single HTML block. A whitespace-only string clears it (subsequent GET returns null). Echoes the saved value on success.

Request: `{ "signature": "<p>Tyler Satre</p><p>Example Corp</p>" }`

Responses: `200` with the echoed `{ signature }`; `400` `{ error: { message } }` when the body doesn't match the schema (`signature` must be a string).

## Changed: email payloads (`src/server/routes/emails.ts`, backed by `queries.ts`)

### `GET /api/emails/conversations` (and `GET /api/people/:personId/email-conversations`)

Each conversation summary gains `hasDraft`:

```json
{ "id": 12, "subject": "Pricing sheet", "messageCount": 1, "latestMessageAt": 1787900000000, "hasUnread": false, "hasAttachments": false, "hasDraft": true, "participants": ["…"] }
```

### `GET /api/emails/conversations/:id`

Each message gains `isDraft`:

```json
{ "id": 34, "subject": "Re: Pricing question", "isDraft": true, "sourceFolder": "Drafts", "bodyText": "…", "participants": ["…"] }
```

Both flags flow from the `email_messages.is_draft` column (rollup: `MAX(is_draft)` per conversation). No other route changes; draft tool writes are visible through these existing endpoints immediately, with no sync run (FR-012) and no new `sync_runs` rows (FR-014 — `GET /api/email-sync/runs` is untouched by draft writes).

## UI contracts (web surfaces)

- **Sync page** (`SyncPage.vue`): new `data-testid="signature-section"` panel — empty state before first save, textarea holding the raw HTML block, save button, error line on failed save; saved value persists across reloads via the GET/PUT pair above.
- **Emails page** (`EmailsPage.vue`): conversation rows with `hasDraft` render a `data-testid="draft-indicator"` "Draft" chip alongside the existing unread/attachment markers.
- **Conversation page** (`EmailConversationPage.vue`): messages with `isDraft` render a `data-testid="message-draft"` "Draft" badge in the `.email-meta-badges` row.
