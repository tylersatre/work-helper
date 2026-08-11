# API Contract: Mailbox connection endpoints

**Feature**: `013-web-mailbox-signin` | **Date**: 2026-08-11

Three new endpoints under the existing Fastify app (`src/server/routes/mailbox.ts`). All three return the same `MailboxStatus` payload on success, so the client's only job after any call is "render the latest status". Errors use the app-wide envelope `{ "error": { "message": string } }`. All copy shown here is illustrative — exact wording is Tyler-adjustable at acceptance.

## MailboxStatus payload

```ts
type MailboxStatus =
  | { state: 'not-configured'; missing: string[] }        // e.g. ["MS_CLIENT_ID", "MS_TENANT_ID"] — the settings the panel must name (FR-002)
  | { state: 'not-connected';
      reason: 'never-signed-in' | 'expired';              // FR-011 distinguishability
      detail?: string;                                    // provider error when reason === 'expired'
      attempt?: SignInAttempt }                           // present while a connect attempt is pending or after one failed
  | { state: 'connected'; account: string };              // proven by silent token acquisition at request time (FR-007)

type SignInAttempt =
  | { status: 'pending'; verificationUri: string; userCode: string; expiresAt: number }
  | { status: 'failed'; error: string };                  // Microsoft's error text (FR-006)
```

## GET /api/mailbox

Status readout. Performs the verification (silent token acquisition) on every call — this is the endpoint the panel polls (~3s) while an attempt is pending.

- **200** → `MailboxStatus`. Never errors for predictable states — not-configured and dead sign-ins are payloads, not error responses (US2).

## POST /api/mailbox/connect

Ensures a sign-in attempt is pending, then returns the status. Idempotent while pending: a second call (same tab, other tab, or after reload) returns the same attempt and code — it never starts a second device-code flow (FR-004).

- **200** → `MailboxStatus` with `state: 'not-connected'` and `attempt.status: 'pending'` (the normal case: verificationUri + userCode for the panel, FR-003). If the mailbox is already connected, returns the connected status without starting an attempt.
- **409** → `{ error: { message: "Mail is not configured — set MS_CLIENT_ID and MS_TENANT_ID (see .env.example)" } }` when not configured (the UI never offers Connect in this state, FR-002; the 409 covers direct API calls).
- **502** → `{ error: { message: <provider error> } }` when Microsoft rejects the device-code request itself (e.g. wrong tenant — the existing `DEVICE_CODE_REJECTED` path; spec edge case "configuration present but invalid"). No attempt is retained.

## POST /api/mailbox/disconnect

Removes the stored account (persisted through the token cache file, FR-009), clears any failed attempt, then returns the status.

- **200** → `MailboxStatus` with `state: 'not-connected', reason: 'never-signed-in'`. Idempotent: disconnecting an already-disconnected mailbox is a 200 with the same shape.
- **409** → when not configured (same envelope as connect).

## Changed copy in existing surfaces (FR-010 / SC-004)

Not new endpoints, but contract-relevant: the `error` string in sync-run records (`GET/POST /api/email-sync/runs`) and in the `sync-emails` MCP tool result must direct to the Sync page and never mention the CLI. Illustrative final strings:

| Site | New copy |
|---|---|
| Never signed in (sync attempted) | `Mailbox is not connected (never signed in) — connect the mailbox on the Sync page.` |
| Sign-in expired (sync attempted) | `Mailbox sign-in has expired (<provider detail>) — reconnect the mailbox on the Sync page.` |
| Mid-sync 401/403 (graph-provider) | `Mailbox sign-in has expired or is not authorized — reconnect the mailbox on the Sync page.` |
| Mail not configured (sync attempted) | `Mail is not configured — set MS_CLIENT_ID and MS_TENANT_ID (see .env.example).` |
| `sync-emails` MCP tool failure hint | `Could not reach the mailbox (<run error>) — connect the mailbox on the Sync page.` |

The `npm run mail:signin` CLI keeps working against the same store (FR-012); its own stdout is exempt from the sweep (it is the CLI).

## UI contract (panel states → data-testid hooks)

`MailboxPanel.vue` on the Sync page renders exactly one state (FR-001), with stable selectors for the browser-tester, following the page's existing `data-testid` convention:

| State | Must show | testid anchors |
|---|---|---|
| not-configured | "not configured" + the missing setting names; no Connect button | `mailbox-not-configured` |
| not-connected (idle) | "Not connected" + Connect button | `mailbox-not-connected`, `mailbox-connect` |
| pending | verification link (`target="_blank"`), user code, copy control, waiting indicator | `mailbox-pending`, `mailbox-code`, `mailbox-copy-code`, `mailbox-verification-link` |
| failed | Microsoft's error + Connect button again | `mailbox-error`, `mailbox-connect` |
| connected | "Connected as <account>" + Disconnect button | `mailbox-connected`, `mailbox-disconnect` |
