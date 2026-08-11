# Data Model: email-ui

**Feature**: 014-email-ui | **Date**: 2026-08-11 | **Storage**: SQLite via drizzle-orm (`src/server/db/schema.ts`)

Production policy applies (constitution Data & migrations): the schema edit ships with generated migration `drizzle/0001_*.sql` — the first additive migration on top of the immutable `0000_futuristic_sunspot` baseline — containing only `ALTER TABLE ... ADD COLUMN` and `CREATE TABLE`, both data-preserving. Decisions referenced as R# come from [research.md](research.md).

## Schema changes

### Extended table: `email_attachments` (R4, R5)

Existing columns `id`, `message_id`, `name`, `content_type`, `size_bytes` and the `email_attachments_message_id` index are unchanged.

| Column | Type | Constraints | Change | Notes |
|---|---|---|---|---|
| `is_inline` | integer boolean | NOT NULL DEFAULT 0 | **new** | Graph `attachment.isInline`. Written by ingestion on every insert (new message) and delete+reinsert (refresh); flipped to 1 by the backfill for matched historical rows. `0` is the fail-open default — an attachment whose inline status is unknowable stays visible (spec edge case). |

Rows remain replaced wholesale per message on sync refresh, now carrying a fresh `is_inline` — refreshed messages self-heal without the backfill.

### New table: `app_state` (R4, R9)

Generic key-value storage for one-time markers; first consumer is the backfill.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `key` | text | PK | e.g. `attachment-inline-backfill` |
| `value` | text | NOT NULL | For the backfill marker: ISO timestamp of completion; the row's existence is the "done" signal. |

### Unchanged tables

`people`, `email_addresses`, `email_conversations`, `email_messages`, `email_participants`, `sync_runs`, and all task/tag tables are untouched. Conversation-level rollups (`subject` from earliest message, `messageCount`, `latestMessageAt`, `hasUnread`, `hasAttachments`) remain derived at query time, never stored.

## Read model (wire shapes in `src/shared/types.ts`, R11)

Mapped by `routes/emails.ts` from `queries.ts` results; the server-internal query types may carry more (e.g. `isInline`) than the wire shape exposes.

### EmailConversationSummary — `GET /api/emails/conversations` rows (FR-002…FR-006)

| Field | Type | Source / rule |
|---|---|---|
| `id` | number | `email_conversations.id` |
| `subject` | string | Earliest message's subject (existing convention); `''` rendered client-side as the styled "(no subject)" placeholder |
| `messageCount` | number | `COUNT(*)` over the conversation's messages |
| `latestMessageAt` | number (ms epoch) | `MAX(sent_at)`; list order `(latestMessageAt DESC, id DESC)` |
| `hasUnread` | boolean | Any member message with `is_read = 0` |
| `hasAttachments` | boolean | Any member message with a **non-inline** attachment row (`attachmentRollup: 'non-inline'`, R6) |
| `participants` | `{ address, displayName, person: { id, name } \| null }[]` | Existing per-conversation dedupe (prefers non-empty display name, then most recent) |

Page envelope: `{ conversations: EmailConversationSummary[], nextCursor: string | null }` — existing base64 keyset cursor `{ primary: latestMessageAt, id }`.

### EmailConversationDetail — `GET /api/emails/conversations/:id` (FR-007…FR-011)

`{ id, subject, messages: EmailConversationMessage[] }`, messages ordered `(sent_at ASC, id ASC)` — oldest first, all returned (no paging).

EmailConversationMessage:

| Field | Type | Source / rule |
|---|---|---|
| `id`, `subject` | number, string | As stored |
| `sentAt`, `receivedAt` | number (ms epoch) | Both timestamps shown (FR-009) |
| `bodyOriginal` | string | Stored body as delivered; sanitized client-side before render (R2/R3) |
| `bodyContentType` | `'html' \| 'text'` | Selects the render path in `EmailBody.vue` |
| `sourceFolder` | string | Folder display name (e.g. `Inbox`) |
| `isRead` | boolean | Unread marker when false |
| `importance` | `'low' \| 'normal' \| 'high'` | |
| `flagStatus` | `'notFlagged' \| 'complete' \| 'flagged'` | |
| `categories` | string[] | |
| `webLink` | string | Open-in-Outlook link target |
| `attachments` | `{ name, contentType: string \| null, sizeBytes }[]` | **Non-inline rows only** (R6); `isInline` itself never crosses the wire |
| `participants` | `{ address, displayName, role: 'from' \| 'to' \| 'cc' \| 'bcc', person: { id, name } \| null }[]` | `person` null ⇒ unmatched ⇒ the detail view offers link/create controls (FR-012/FR-013) |

`bodyText` is deliberately not exposed — it exists for MCP read tools; the UI renders from the original body.

### PersonEmailConversation — `GET /api/people/:personId/email-conversations` rows (FR-015/FR-016, R8)

| Field | Type | Source / rule |
|---|---|---|
| `conversationId` | number | |
| `subject` | string | Earliest-message subject; `''` → client placeholder |
| `latestMessageAt` | number (ms epoch) | Order `(latestMessageAt DESC, conversationId DESC)` |
| `addresses` | `{ address: string, roles: ('from' \| 'to' \| 'cc' \| 'bcc')[] }[]` | The person's **distinct involved addresses** in this conversation, each with that address's **distinct roles** across all the conversation's messages (clarification 2026-08-11) |

Envelope: `{ conversations: PersonEmailConversation[] }` — all rows; the client shows 5 and reveals the rest via show-all (R8).

## Provider contract delta (`src/server/services/email/provider.ts`, R5/R9)

```ts
interface MailAttachmentMeta { name: string; contentType: string | null; sizeBytes: number; isInline: boolean }  // isInline new

interface MailProvider {
  // unchanged: listFolders, fetchMessages
  fetchAttachmentMetadata(messageId: string, options?: { allowNotFound?: boolean }): Promise<MailAttachmentMeta[] | null>;
  // null only when allowNotFound and the message no longer exists (Graph 404); sync call sites pass no options and keep today's throwing behavior
}
```

`SeedAttachment` (fake provider) gains optional `isInline` defaulting to `false`.

## State transitions

- **Attachment row**: `is_inline = 0` (default, and every pre-migration row) → `1` when ingestion or the backfill observes Graph `isInline = true`. Sync refresh replaces a message's rows wholesale with mailbox-current flags. The backfill only ever `UPDATE`s the flag — it contains no insert or delete path (FR-019).
- **Backfill** (per process lifetime, R9): `idle → running` (startup or post-sync trigger, single-flight) → `done` (marker row written: all candidate messages fetched or permanently skipped; also immediately when no messages have attachment rows) or `aborted` (transport/auth error; no marker; next trigger retries from the top — idempotent). Once the marker exists every trigger is a no-op.
- **Email address**: unchanged from email-sync — `unlinked → linked` now also reachable from the conversation detail view via the existing `addEntry`/`createPerson` services (FR-014); all other transitions untouched.
- **Everything else**: messages/participants/conversations stay insert-only snapshots; no view in this feature writes to the mailbox or to stored mail (FR-017).

## Queries the model must serve (shape only; SQL lives in the implementation)

- **UI conversation list**: existing `listConversations` with `attachmentRollup: 'non-inline'` — the `attach` CTE adds `WHERE a.is_inline = 0`; everything else (ordering, cursor, participants) unchanged (R6).
- **UI conversation detail**: existing `getConversation` with `{ attachments: 'non-inline', includeOriginalBody: true }` — attachment fetch filters `is_inline = 0`; message select additionally returns `body_original`, `body_content_type` (R6).
- **Person's conversations**: new `conversationsForPerson(db, personId)` — join `email_participants → email_addresses (person_id = ?) → email_messages → email_conversations`, group to distinct conversations with per-address distinct-role rollups, order `(MAX(sent_at) DESC, conversation_id DESC)` (R8).
- **Backfill candidates**: distinct `email_messages.id, graph_message_id` having rows in `email_attachments` (R9).
- **MCP paths**: `list-conversations`, `get-conversation`, `emails-for-person` call the same helpers with default options — behavior pinned unchanged by regression tests (FR-018).
