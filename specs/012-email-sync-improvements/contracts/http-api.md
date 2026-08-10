# HTTP API Contract: Email Sync

New route module `src/server/routes/email-sync.ts`, registered in `buildApp`. Error responses follow the app-wide shape `{ "error": { "message": string } }`. All dates are `YYYY-MM-DD` strings interpreted as inclusive server-local days (shipped email-sync semantics). Design rationale: research.md R4, R9.

## Shared view type

```ts
interface SyncRunView {
  id: number;
  ranAt: number;                    // ms epoch — when the run started
  startDate: string;                // 'YYYY-MM-DD'
  endDate: string;                  // 'YYYY-MM-DD'
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;             // non-null exactly when status = 'failure'
}
```

## GET `/api/email-sync/runs`

Lists every recorded run, newest first (`ranAt` DESC, `id` DESC). Never pruned, unpaginated.

**Response `200`**:

```json
{ "runs": [ /* SyncRunView, newest first */ ] }
```

Client-derived prefill (no dedicated endpoint): start = `endDate` of the first run with `status === 'success'`, or 30 days before today when none; end = today.

## POST `/api/email-sync/runs`

Triggers a sync with source `web` and waits for it to finish (busy state is the pending request; no polling).

**Request body**: `{ "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }`

**Responses**:

| Status | When | Body | Run recorded? |
|---|---|---|---|
| `201` | Run executed to completion — **including runs that failed** (unreachable mailbox, not connected, mid-run interruption) | The `SyncRunView` just recorded (check its `status`/`error`) | Yes — exactly one row |
| `400` | Missing/invalid date, or start after end | `{ "error": { "message": "A start date and end date are required" } }` or `{ "error": { "message": "Start date must not be after end date" } }` (inline-able text; exact copy is acceptance-time-adjustable) | No |
| `409` | A sync is already running (this process, either source) | `{ "error": { "message": "A sync is already running" } }` | No |

A failed *sync* is a successful *request* (201): the run happened and was recorded, and the client renders the failure from the returned row. HTTP error codes are reserved for rejected triggers, which record nothing (FR-004, FR-006).
