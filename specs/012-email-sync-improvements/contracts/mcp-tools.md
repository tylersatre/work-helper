# MCP Tool Contract Changes: Email Sync Improvements

All tools live in `src/server/mcp/tools.ts` on the official SDK. Only deltas are listed; every field not mentioned is unchanged. Additive changes are backward-compatible for existing MCP clients. Design rationale: research.md R7, R8, R10.

## `sync-emails` — interface preserved, behavior extended

**Input schema: unchanged.** `startDate` and `endDate` remain required `YYYY-MM-DD` strings (explicit range — no prefill via MCP), with the shipped validation messages and inclusive server-local-day semantics (FR-014).

**Output schema: one additive field.**

```ts
{
  status: 'complete' | 'interrupted',   // unchanged
  syncedCount: number,                  // unchanged meaning: newly stored messages
  updatedCount: number,                 // NEW: already-stored messages refreshed this run
  error?: string,                       // unchanged
}
```

**Behavior deltas**:

- Runs execute through the shared `SyncCoordinator` with source `mcp`; every executed run (complete or failed) is recorded in run history and appears on the Sync page (FR-007).
- Sync now covers all folders except Junk/Deleted Items/Drafts, captures the full FR-009 metadata, and refreshes already-stored messages — identical to web-triggered runs (FR-014).
- **New rejection**: a call arriving while any sync is active returns a tool error `A sync is already running`; nothing is recorded (FR-006).
- Mailbox-not-connected / unreachable failures keep their existing tool-error responses, but now also record a `failure` run with the error text.

## `get-conversation` — messages carry full metadata

Each entry in `messages[]` gains (additive):

```ts
{
  // existing: id, subject, sentAt, bodyText, sourceFolder, participants
  sentAt: number,                        // now always the sent timestamp (was received-time for Inbox rows)
  receivedAt: number,                    // NEW: ms epoch received timestamp
  sourceFolder: string,                  // CHANGED TYPE: enum 'inbox'|'sent' → folder display name ('Inbox', 'Sent Items', 'Archive', 'Projects', …)
  isRead: boolean,                       // NEW
  importance: 'low' | 'normal' | 'high', // NEW
  flagStatus: 'notFlagged' | 'complete' | 'flagged', // NEW
  categories: string[],                  // NEW
  webLink: string,                       // NEW: open-in-Outlook link ('' for pre-feature rows until refreshed)
  internetMessageId: string,             // NEW
  attachments: { name: string; contentType: string | null; sizeBytes: number }[],  // NEW: metadata only
}
```

`participants[]` entries gain `displayName: string` (`''` when the mailbox had no name for that address on that message) alongside the existing `address`, `role`, `person`.

**Breaking note**: `sourceFolder` widens from a two-value enum to a free string — the only non-additive read-tool change, required by FR-012. Existing values `'inbox'`/`'sent'` become `'Inbox'`/`'Sent Items'` after a dev-store reset or refresh.

## `list-conversations` — indicators + participants

Each entry in `conversations[]` gains (additive):

```ts
{
  // existing: id, subject, messageCount, latestMessageAt
  hasUnread: boolean,        // NEW: any member message with isRead = false
  hasAttachments: boolean,   // NEW: any member message with stored attachment metadata
  participants: { address: string; displayName: string; person: { id: number; name: string } | null }[],  // NEW: distinct addresses across the conversation (see research.md R10)
}
```

## `emails-for-person` — per-message metadata

Each entry in `emails[]` gains the same additive per-message fields as `get-conversation` messages (FR-010: "where a message is returned"): `receivedAt`, `sourceFolder` (display name), `isRead`, `importance`, `flagStatus`, `categories`, `webLink`, `internetMessageId`, `attachments[]`. The existing `addresses[]` entries gain `displayName: string`. Existing fields (`messageId`, `conversationId`, `subject`, `sentAt`, pagination) are unchanged.

## Unchanged tools

`list-board`, `get-task`, `search-people`, `get-person`, `create-task`, `add-note` are untouched.
