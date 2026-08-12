# HTTP API Contract: Calendar Sync

Fastify routes, same conventions as the email sync API (`specs/012-email-sync-improvements/contracts/http-api.md`): JSON bodies, error shape `{ error: { message: string } }` (global handler in `src/server/app.ts`), dates as `YYYY-MM-DD` strings interpreted as inclusive server-local days, timestamps as epoch-ms numbers.

## CalendarSyncRunView

```ts
{
  id: number;
  ranAt: number;              // epoch ms
  startDate: string;          // 'YYYY-MM-DD'
  endDate: string;            // 'YYYY-MM-DD'
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}
```

## GET /api/calendar-sync/runs

Returns the full calendar run history, newest first (`ranAt` desc, `id` desc), never pruned. No pagination (matches the email runs endpoint).

- **200** `{ runs: CalendarSyncRunView[] }` — empty array before any run (drives the "No syncs yet" empty state, FR-003).

## POST /api/calendar-sync/runs

Triggers a calendar sync over the inclusive range, waits for it to finish, and returns the recorded run. The pending request is the client's busy signal (same model as email).

Request body: `{ startDate: string, endDate: string }`.

- **400** `{ error: { message: 'A start date and end date are required' } }` — either date missing. No run executes, no history row (FR-018 parity).
- **400** `{ error: { message: 'Invalid date …' | 'Start date must not be after end date' } }` — malformed date or inverted range (via `computeSyncWindow`, identical to email).
- **409** `{ error: { message: 'A sync is already running' } }` — any sync (email or calendar, web or MCP) is in flight (FR-006). No history row.
- **201** `CalendarSyncRunView` — the run executed and was recorded. **A failed sync still returns 201** with `status: 'failure'` and `error` text (e.g. the disconnected-mailbox guidance ending "connect the mailbox on the Sync page.") — the request succeeded, the sync didn't (FR-013).

## GET /api/sync/status

New shared endpoint (research R8) exposing the global single-flight state so the Sync page can disable both Sync buttons during any sync, including MCP-triggered ones (FR-006, US1 scenario 3). Polled by the page every 3 seconds.

- **200** `{ running: boolean }`

## Unchanged endpoints

`GET/POST /api/email-sync/runs` and `/api/mailbox*` are byte-for-byte unchanged; the email prefill and history behavior on the Sync page must not change (FR-001). The only observable mailbox-adjacent change is that widened OAuth scopes may put an existing connection into the established reconnect-needed state once (research R4).
