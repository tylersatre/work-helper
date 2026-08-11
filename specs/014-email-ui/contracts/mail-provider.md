# Contract: Mail provider delta + attachment inline-flag backfill

**Feature**: 014-email-ui | **Date**: 2026-08-11 | Decisions R5/R9 in [research.md](../research.md)

## `MailProvider` interface delta (`src/server/services/email/provider.ts`)

```ts
export interface MailAttachmentMeta {
  name: string;
  contentType: string | null;
  sizeBytes: number;
  isInline: boolean;            // NEW — Graph attachment.isInline; false when Graph omits it
}

export interface MailProvider {
  listFolders(): Promise<MailFolderNode[]>;                                                    // unchanged
  fetchMessages(folder: MailFolderRef, window: MailWindow): AsyncIterable<MailMessage[]>;      // unchanged
  fetchAttachmentMetadata(messageId: string, options?: { allowNotFound?: boolean }): Promise<MailAttachmentMeta[] | null>;
  // CHANGED — null if and only if options.allowNotFound is true and the message no longer exists (Graph 404).
  // Without options (the sync call site), behavior is exactly today's: 404 throws a connection error.
}
```

**GraphMailProvider**: `$select` becomes `name,contentType,size,isInline`; maps `isInline: attachment.isInline === true`; passes `allowNotFound` through to the existing `authorizedFetch` option and returns `null` on its `null`.

**FakeMailProvider**: `SeedAttachment` gains `isInline?: boolean` (default `false`), passed through verbatim; an unknown `messageId` returns `null` under `allowNotFound` (else throws, matching Graph semantics) so backfill tests can exercise the message-gone path.

**Sync ingestion** (`sync.ts`): the attachment insert on both the new-message and refresh paths persists `isInline` into `email_attachments.is_inline`. No other ingestion behavior changes (FR-018).

## Backfill service contract (`src/server/services/email/attachment-backfill.ts`)

One-time job recording `is_inline` for attachment rows stored before this feature (FR-019).

**Constructor inputs**: the app DB, the app's single `MailProvider`, and a logger. Exposes `run(): Promise<void>`, safe to call from any trigger at any time.

| Guarantee | Behavior |
|---|---|
| Single-flight | A `run()` while another is in flight returns immediately without a second pass. |
| Done is durable | If `app_state` key `attachment-inline-backfill` exists, `run()` is a no-op. The marker value is the completion ISO timestamp. |
| Fresh DBs complete instantly | No stored message has attachment rows → write the marker immediately (ingestion records the flag from now on, so there is nothing to backfill). |
| Candidates | Distinct stored messages having `email_attachments` rows, identified by `graph_message_id`. Messages without attachment rows are never fetched. |
| Per-message fetch | `fetchAttachmentMetadata(graphMessageId, { allowNotFound: true })`, sequentially — no concurrency, no batching (matches existing sync style at personal scale). |
| Message gone | `null` result → permanently skipped; its rows keep `is_inline = 0` (fail-open: never hide a possibly-real attachment — spec edge case). Counts as processed toward completion. |
| Row matching | Fetched metadata matches stored rows on `(name, sizeBytes)`; matched rows get `UPDATE email_attachments SET is_inline = <fetched>`; unmatched rows are left untouched. |
| Flags only | The service contains no insert and no delete — stored mail is never re-synced or removed (FR-019). |
| Completion | Marker written only after every candidate was fetched or permanently skipped. |
| Transient failure | Any thrown error (`MailboxNotConnectedError`, network, non-404 HTTP) aborts the run: logged, no marker, partial flag updates kept (idempotent). The next trigger retries from the top. |

**Triggers** (both fire-and-forget, never blocking a request or startup):

1. Server startup, after `app.listen` (`src/server/index.ts`) — effective immediately on deploy because the MSAL token cache persists on disk; silently aborts if the mailbox isn't connected.
2. After every successful sync run (`SyncCoordinator`) — the guaranteed-connected retry path.

**Explicitly out of contract**: no `sync_runs` rows (that table means user-triggered syncs), no MCP/HTTP surface, no progress UI — observability is server logs plus the `app_state` row.

## Test hooks

- Integration tests drive `run()` directly with `FakeMailProvider` seeds and assert flag updates, skip/abort/marker behavior, and idempotent re-runs.
- The sync-trigger wiring is asserted through `POST /api/email-sync/runs` completing and the backfill observably running after it.
- MCP regression: with inline attachments present and the backfill complete, `list-conversations`/`get-conversation`/`emails-for-person` output is unchanged from today (FR-018).
