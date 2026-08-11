# Data Model: Email Sync Improvements

Schema lives in `src/server/db/schema.ts` and is edited in place (dev-phase policy — no migration files; dev DB is reset). Decisions referenced as R# come from [research.md](./research.md).

## New table: `sync_runs`

One row per completed sync run (success or failure); rejected triggers (validation, already-running) never produce a row (R4). Append-only, never pruned.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK autoincrement | |
| `ranAt` | integer (ms epoch) | NOT NULL | When the run started — the "when it ran" shown in history. |
| `startDate` | text | NOT NULL | `YYYY-MM-DD` as requested (inclusive, server-local day). |
| `endDate` | text | NOT NULL | `YYYY-MM-DD` as requested. |
| `source` | text enum `'web' \| 'mcp'` | NOT NULL | Trigger origin. |
| `status` | text enum `'success' \| 'failure'` | NOT NULL | An interrupted run (partial progress then error) is `failure` with its counts. |
| `newCount` | integer | NOT NULL | Messages newly stored by this run (0 on early failure). |
| `updatedCount` | integer | NOT NULL | Already-stored messages refreshed by this run. |
| `error` | text | NULL | Error text; NULL exactly when `status = 'success'`. |

Index: `(ranAt DESC)` ordering is served by `ORDER BY ranAt DESC, id DESC`; at personal scale no index beyond the PK is required, but add `index('sync_runs_ran_at').on(t.ranAt)` for the newest-first listing.

**Derived**: the Sync page prefill = `endDate` of the newest row with `status = 'success'`, else 30 days before today (R9).

## Extended table: `email_messages`

Existing columns `id`, `conversationId`, `graphMessageId`, `subject`, `bodyOriginal`, `bodyContentType`, `bodyText`, `createdAt` are unchanged. Changes:

| Column | Type | Constraints | Change | Notes |
|---|---|---|---|---|
| `sourceFolder` | text | NOT NULL | **enum `'inbox' \| 'sent'` → free text** | Folder `displayName` at last sync: `Inbox`, `Sent Items`, `Archive`, `Projects`, … (R2). Refreshes on re-sync. |
| `sentAt` | integer (ms epoch) | NOT NULL | **redefined** | Now always Graph `sentDateTime` (was received-time for Inbox rows) (R5). Still the ordering key for conversations/cursors. |
| `receivedAt` | integer (ms epoch) | NOT NULL | **new** | Graph `receivedDateTime`. |
| `isRead` | integer boolean | NOT NULL | new | Graph `isRead`; refreshes. |
| `importance` | text enum `'low' \| 'normal' \| 'high'` | NOT NULL DEFAULT `'normal'` | new | Refreshes. |
| `flagStatus` | text enum `'notFlagged' \| 'complete' \| 'flagged'` | NOT NULL DEFAULT `'notFlagged'` | new | Graph `flag.flagStatus`; refreshes. |
| `categories` | text JSON `string[]` | NOT NULL DEFAULT `[]` | new | Outlook category names; refreshes. |
| `webLink` | text | NOT NULL DEFAULT `''` | new | Open-in-Outlook URL; refreshes. |
| `internetMessageId` | text | NOT NULL DEFAULT `''` | new | RFC 2822 id; refreshes (immutable upstream in practice). |

**Immutability rule (snapshot, FR-013/FR-015)**: `subject`, `bodyOriginal`, `bodyContentType`, `bodyText`, `conversationId`, `graphMessageId`, `createdAt`, and the message's `email_participants` rows are written at first sync and never touched again. Every other column above refreshes to mailbox-current state on any run whose range finds the message (R7).

Existing indexes (`graphMessageId` unique — the dedup key; `(conversationId, sentAt)`; `sentAt`) are unchanged.

## New table: `email_attachments`

Attachment **metadata only** — never file contents. Rows are replaced wholesale for a message on each refresh (R7).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer | PK autoincrement | |
| `messageId` | integer | NOT NULL, FK → `email_messages.id` | Index `email_attachments_message_id` on `messageId`. |
| `name` | text | NOT NULL | Attachment filename. |
| `contentType` | text | NULL | MIME type; Graph may omit for some attachment types. |
| `sizeBytes` | integer | NOT NULL | Graph `size`. |

A message "has attachments" (conversation indicator, message-level flag in read tools) is derived from the existence of rows here — no separate boolean column to drift.

## Extended table: `email_participants`

| Column | Type | Constraints | Change | Notes |
|---|---|---|---|---|
| `displayName` | text | NOT NULL DEFAULT `''` | **new** | The `emailAddress.name` seen on *this message* for this participant (R1). Per-participant-per-message, because the same address can carry different display names on different mail; empty when the sender is address-only. Written at first sync and immutable with the rest of the participant snapshot. |

Existing columns (`messageId`, `addressId`, `role`) and the `(messageId, addressId, role)` unique index are unchanged. The shared `email_addresses` table is untouched — display names deliberately do not live there, so person matching stays purely address-based (FR-015).

## Unchanged tables

`email_conversations`, `email_addresses`, `people`, and all task/tag tables are untouched. Conversation-level "unread" and "has attachments" indicators are derived at query time from member messages (R10), not stored.

## Provider model (internal contract, `src/server/services/email/provider.ts`)

Not persisted, but the shape both `GraphMailProvider` and `FakeMailProvider` implement:

```ts
type WellKnownFolder = 'inbox' | 'sentitems' | 'archive' | 'junkemail' | 'deleteditems' | 'drafts';

interface MailFolderNode {
  id: string;            // Graph folder id (fake: any stable string)
  name: string;          // displayName, recorded on messages
  wellKnown: WellKnownFolder | null;  // null for custom folders
  children: MailFolderNode[];
}

interface MailRecipient { address: string; name: string }  // name '' when absent

interface MailMessage {
  // existing: id, conversationId, subject, body, receivedDateTime, sentDateTime,
  //           from, toRecipients, ccRecipients, bccRecipients (recipients gain name)
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  flagStatus: 'notFlagged' | 'complete' | 'flagged';
  categories: string[];
  hasAttachments: boolean;
  webLink: string;
  internetMessageId: string;
}

interface MailAttachmentMeta { name: string; contentType: string | null; sizeBytes: number }

interface MailProvider {
  listFolders(): Promise<MailFolderNode[]>;                       // full tree incl. excluded folders (R2)
  fetchMessages(folder: { id: string; wellKnown: WellKnownFolder | null }, window: MailWindow): AsyncIterable<MailMessage[]>;  // sentitems filters by sentDateTime, others by receivedDateTime (R6)
  fetchAttachmentMetadata(messageId: string): Promise<MailAttachmentMeta[]>;  // called only when hasAttachments (R3)
}
```

The sync service owns folder-exclusion policy (prunes `junkemail`/`deleteditems`/`drafts` subtrees from the tree) and the refresh/immutability rules; providers only fetch.

## State transitions

- **Message**: absent → stored (snapshot + metadata) on first covering sync; stored → stored-with-refreshed-metadata on any later covering sync; never deleted or blanked by sync (mailbox deletions/moves-to-excluded simply stop finding it).
- **Sync run**: triggered → rejected (validation / already-running; no row) *or* completed → exactly one immutable `sync_runs` row (`success` or `failure`).
