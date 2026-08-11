# Data Model: web-mailbox-signin

**Feature**: `013-web-mailbox-signin` | **Date**: 2026-08-11

No database schema changes. The two entities from the spec map to one persisted store that already exists (the MSAL token cache file) and one in-memory record. Everything below is TypeScript-level shape, not SQL.

## Mailbox connection (persisted — existing store, no new storage)

The single stored sign-in, materialized at read time by `MailboxAuth.verifyConnection()` — never cached as a flag anywhere else (FR-007: connected is proven by a silent token acquisition, per status request).

| Aspect | Value | Source |
|---|---|---|
| Store | MSAL token cache file at `MAIL_TOKEN_CACHE_PATH` (default `./data/mail-token-cache.json`, 0600) | Unchanged from feature 007/012 |
| Configured? | `MS_CLIENT_ID` and `MS_TENANT_ID` both set (dev fake: `MAIL_AUTH` set) | Env at server start |
| Connected? | Silent token acquisition succeeds for the cached account | Verified per status read |
| Account | `AuthenticationResult.account.username` (e.g. `tyler@example.com`) | MSAL cache |

**Verification result** (returned by `verifyConnection()`):

```ts
type ConnectionVerification =
  | { connected: true; account: string }
  | { connected: false; reason: 'never-signed-in' }               // no account in the cache
  | { connected: false; reason: 'expired'; detail: string };      // account present, silent acquisition failed; detail = provider error (FR-011)
```

**Typed sync-time error** — `MailboxNotConnectedError extends Error` with the same `reason`/`detail` fields, thrown by `getAccessToken()` instead of today's swallowed catch-all; its message directs to the Sync page (FR-010) and embeds the reason so never-signed-in and expired stay distinguishable in recorded sync-run errors (FR-011).

## Sign-in attempt (in-memory only — `MailboxConnectionManager`)

At most one exists; a server restart discards it (spec Key Entities / edge case).

```ts
interface SignInAttempt {
  status: 'pending' | 'failed';
  verificationUri: string;    // from DeviceCodeResponse
  userCode: string;           // e.g. "ABC-DEF-123"
  expiresAt: number;          // epoch ms, from DeviceCodeResponse.expiresIn
  error?: string;             // present only when status === 'failed' — Microsoft's error text (US3-1)
}
```

**State transitions**:

| From | Event | To | Notes |
|---|---|---|---|
| (none) | `connect()` | `pending` | Device-code flow started; HTTP response waits for the code callback |
| `pending` | `connect()` again / page reload | `pending` (same attempt) | FR-004 — same code returned, no second flow |
| `pending` | sign-in completes at Microsoft | (cleared) | Connected state is then read from the store via verification — the panel never reports success from the attempt itself, which resolves the near-expiry race edge case |
| `pending` | declined / code expired | `failed` (kept) | Error retained for the panel until replaced (FR-006) |
| `failed` | `connect()` | `pending` (new attempt) | Fresh code |
| any | server restart | (none) | Panel offers Connect with a fresh code |
| `pending` | sync triggered | `pending` (unaffected) | Sync fails with the connect-the-mailbox error; edge case |

**Invariant**: `connected` as shown to the user is always `verifyConnection()`'s answer, never derived from attempt state. Disconnect acts on the store (`signOut()`), not on the attempt.

## MailboxAuth interface (seam for real vs simulated flow)

```ts
interface MailboxAuth {
  getAccessToken(): Promise<string>;                                    // throws MailboxNotConnectedError
  verifyConnection(): Promise<ConnectionVerification>;
  beginSignIn(onCode: (uri: string, code: string, expiresAt: number) => void): Promise<{ account: string }>;  // settles when the flow succeeds/fails
  signOut(): Promise<void>;                                             // removes the account; persists via the cache plugin (FR-009)
}
```

Implementations: `createGraphAuth` (real, MSAL — used by server and the unchanged CLI fallback, FR-012) and `FakeMailboxAuth` (tests + `MAIL_AUTH=fake`/`fake-decline` dev modes, connected flag persisted to a JSON state file so restart criteria are checkable — research D6).

## Relationships

```
env (MS_CLIENT_ID, MS_TENANT_ID)
        │ configured?
        ▼
MailboxAuth ──verifyConnection()──► MailboxStatus (API payload, contracts/mailbox-api.md)
   │  ▲                                   ▲
   │  └── getAccessToken() ◄── GraphMailProvider ◄── SyncCoordinator (error copy updated, FR-010)
   │
   └── beginSignIn()/signOut() ◄── MailboxConnectionManager ──attempt──► MailboxStatus
```
