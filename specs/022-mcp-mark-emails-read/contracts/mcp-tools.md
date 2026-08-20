# MCP Tool Contract: MCP Mark Emails Read

One new tool, registered on the existing `work-helper` McpServer in `src/server/mcp/tools.ts`, reachable only through the existing mcp-authentik-auth flow (unauthenticated calls are rejected at the transport/auth layer before any tool executes). Failures are returned as MCP tool results with `isError: true` and a plain-text message (the repo's `toolError()` convention), never as protocol errors; whole-call failures carry **no** `structuredContent` and therefore no per-message outcomes.

## Tool: `set-email-read-state` (new)

**Description**: Marks up to 50 synced email messages read or unread. Writes each change to the connected Outlook mailbox first, then updates work-helper's stored state, and reports an outcome per message. Individual message ids only (from `get-conversation` `messages[].id` or `emails-for-person` `emails[].messageId`) — to mark a whole thread, fetch it with `get-conversation` and pass its message ids. This is the only mailbox-modifying tool in work-helper, and read/unread state is the only thing it changes.

### Input schema

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `messageIds` | number[] | yes | declared `z.array(z.number().int().positive())`; handler enforces 1–50 entries with the spec's wording (see errors). Ids are internal `email_messages.id` values. Duplicates allowed (second occurrence reports `already-in-state`). |
| `state` | string | yes | declared `z.string()`; handler enforces `read` or `unread` with the spec's wording |

### Success result

- `structuredContent`:

  ```
  {
    state: 'read' | 'unread',           // the requested state, echoed
    outcomes: [                          // one entry per requested id, in input order
      {
        messageId: number,
        status: 'marked' | 'already-in-state' | 'not-found' | 'failed',
        reason?: string                  // present iff status = 'failed', e.g. "The mailbox no longer has this message"
      }
    ],
    markedCount: number,
    alreadyCount: number,
    notFoundCount: number,
    failedCount: number
  }
  ```

- `content` text: a one-sentence summary built from the counts, e.g. `Marked 2 messages read (1 already read).` / `Marked 1 message unread.` / `Marked 1 message read (1 not found, 1 failed).`
- The call as a whole succeeds (`isError` absent) whenever validation and the write-access preflight pass — even if every per-message outcome is `not-found` or `failed`. Callers inspect `outcomes`.

### Whole-call error results (`isError: true`, no outcomes, nothing changed anywhere)

| Condition | Message |
|-----------|---------|
| more than 50 ids | `At most 50 messages per call` |
| empty `messageIds` | `At least one message id is required` |
| `state` not `read`/`unread` | `State must be read or unread` |
| malformed input (non-numeric id, wrong types) | SDK-level zod rejection at the tool boundary (before the handler runs) |
| mailbox never signed in / not configured | `The mailbox is not connected — connect the mailbox on the Sync page.` |
| mailbox sign-in expired | `The mailbox sign-in has expired (<detail>) — reconnect the mailbox on the Sync page.` |
| sign-in predates this feature (no mail-write permission) | `The mailbox sign-in predates read-state changes and lacks permission to change mail — add delegated Mail.ReadWrite to the Entra app registration, then reconnect the mailbox on the Sync page to grant it.` |

### Per-message outcome semantics

| `status` | Meaning | Mailbox | Store |
|----------|---------|---------|-------|
| `marked` | mailbox accepted the change, store updated | changed | changed (only `is_read`) |
| `already-in-state` | stored state already equals the request | untouched (no request made) | untouched |
| `not-found` | no synced message with this id | untouched | untouched |
| `failed` | mailbox couldn't take the write (message deleted from mailbox, or a mailbox rejection); `reason` says why | untouched | untouched |

### Behavioral guarantees

- FR-003: per message, the mailbox is written first; the store updates only after the mailbox accepted — all within the call, with no sync run created (FR-011) and no `sync_runs` row.
- FR-006: outcomes are independent; a `failed`/`not-found` id never undoes or blocks another id's success. Nothing is transactional across the list.
- FR-007: only read/unread state changes — flag, categories, folder, subject, body, and times are untouched on every path.
- FR-008: connection/permission failures are detected before any per-message work; the three error sentences above keep the states distinguishable.
- FR-009: immediately after a successful call, `get-conversation` shows the new `isRead` per message and `list-conversations` the recomputed `hasUnread` — both derive from the same stored column the tool wrote.

## Changed contract surface outside MCP (implementation seams, not agent-facing)

- `MailProvider` (`src/server/services/email/provider.ts`) gains `verifyWriteAccess(): Promise<void>` and `setMessageReadState(graphMessageId: string, isRead: boolean): Promise<'updated' | 'not-found'>`; both `GraphMailProvider` and `FakeMailProvider` implement them (research R3/R8).
- `MailboxAuth` (`src/server/services/email/graph-auth.ts`) gains `getWriteAccessToken(): Promise<string>`; device-code sign-in requests `Mail.ReadWrite` in addition to today's scopes (research R2). Existing read paths keep today's scopes — pre-feature sign-ins keep syncing.

## Unchanged surfaces (explicitly out of contract)

- `get-conversation`, `list-conversations`, `emails-for-person` response shapes are untouched — they already expose `isRead`/`hasUnread` and the message ids this tool consumes.
- REST API and web UI: no new endpoints, no UI controls; the Emails page and conversation detail reflect the stored state exactly as today.
- Sync: `sync-emails`/`sync-calendar` tools, `SyncCoordinator`, and `ingestMessage`'s read-state refresh are byte-identical.
