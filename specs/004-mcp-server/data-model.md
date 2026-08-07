# Data Model: MCP Server (004-mcp-server)

**Date**: 2026-08-06 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

## New persisted entity

### OAuthClientRegistration — table `oauth_clients` (new, drizzle migration)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `client_id` | text | primary key | Random 128-bit id, `crypto.randomUUID()` or equivalent, generated at registration |
| `client_name` | text | nullable | Display name supplied by the client (e.g. "Claude Desktop"), informational only |
| `redirect_uris` | text (json) | not null | JSON array of exact redirect URIs registered by the client; the authorize and token endpoints validate against these |
| `created_at` | integer | not null | Epoch millis |

Public clients only — no client secret column exists (`token_endpoint_auth_method` is `none`). Registrations survive restarts and password changes by design (research D4); a registration grants no access by itself. No update or delete paths in this slice.

## Stateless / in-memory entities (no schema)

### AccessToken (stateless — never stored)

`whmcp_<base64url(payload)>.<base64url(hmacSha256(payload, key))>` where `payload` = `{ "jti": <random 128-bit>, "iat": <epoch millis> }` and `key` = `scrypt(CONNECTOR_PASSWORD, fixed app salt)`, derived once at boot. No expiry field — tokens live until the password changes (FR-010/FR-011). Validation: recompute HMAC with the current boot's key, `timingSafeEqual` compare. This entity *is* the spec's "Client connection".

### AuthorizationCode (in-memory `Map<string, PendingAuth>`)

`PendingAuth` = `{ clientId, redirectUri, codeChallenge, expiresAt }`. Key is a random 128-bit code. Single-use (deleted on redemption), 60s TTL, S256 PKCE challenge only. Lost on restart — client simply retries the flow.

### LockoutRecord (in-memory `Map<ip, { consecutiveFailures: number, locked: boolean }>`)

Keyed by `request.ip` (Fastify `trustProxy: true`, so behind Caddy this is the forwarded client IP). Written only by password submissions on `POST /oauth/authorize`:

| Event | Transition |
|---|---|
| Wrong password, not locked, failures becomes 1 or 2 | `consecutiveFailures += 1`; form re-renders with error, retry allowed (FR-005) |
| Wrong password, failures becomes 3 | `locked = true`; this and every later submission from the IP refused with the locked message (FR-007) |
| Any submission while `locked` | Refused before password comparison — correct password included (FR-007); counter untouched |
| Correct password, not locked | Entry reset (`consecutiveFailures = 0`) — consecutive semantics (FR-006, edge case "two wrong then right") |
| Server restart | Entire map gone — the only clearing mechanism (FR-009) |

No entry ever affects any other IP (FR-008). Tool calls never consult this map (edge case: lockout never interrupts an established connection).

### ConnectorPassword (environment)

`CONNECTOR_PASSWORD` env var, read at boot into `buildApp` options. Unset or empty → the connector is disabled: all OAuth endpoints and `/mcp` refuse with a clear error; the web app is unaffected (edge case: never passwordless). Compared with `timingSafeEqual`.

## Existing entities (touched, not reshaped)

- **Task / Note / Person / Lane**: no column changes. `task_notes.source` already has enum `('ui','mcp')`; this feature writes `'mcp'` for the first time (FR-017/FR-018).
- **Service signatures**: `createTask(db, lanes, rawTitle, rawNote?, source = 'ui')` and `addNote(db, taskId, rawText, source = 'ui')` gain the trailing `source` param (research D10). Existing REST routes keep defaulting to `'ui'`; MCP tool handlers pass `'mcp'`.

## Validation rules (reused, not duplicated)

| Rule | Enforced by | Used by |
|---|---|---|
| Task title non-empty after trim ("Title is required") | `titleSchema` (`src/shared/validation.ts`) | `create-task` tool (FR-019) |
| Note text non-empty after trim ("Note text is required") | `noteTextSchema` | `add-note` tool (FR-019) |
| Task/person must exist for detail/note operations | services return not-found results → tool error (FR-014/FR-016/FR-018, edge cases) |
| People search: substring match on first/last/email, case-insensitive | `listPeople` (unchanged) | `search-people` tool (FR-015) |
| Redirect URI must exactly match a registered URI | authorize + token endpoints | OAuth flow |
| PKCE S256 verifier must match the code's challenge | token endpoint | OAuth flow |
