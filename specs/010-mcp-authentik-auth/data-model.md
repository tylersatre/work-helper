# Data Model: MCP Authentik Auth

No database schema changes. One persisted entity (`oauth_clients`, unchanged) and three transient/in-memory structures, one of them new. Config values are part of the model because the token entity's lifecycle is defined by one of them.

## Entities

### OAuthClient (persisted — SQLite `oauth_clients`, unchanged)

| Field | Type | Rules |
|---|---|---|
| `clientId` | text, PK | random UUID assigned at registration |
| `clientName` | text, nullable | display name shown on the approval page (falls back to the client id) |
| `redirectUris` | JSON array of text | each must be an absolute URI; `http:` only for loopback hosts (existing rule) |
| `createdAt` | integer (ms epoch) | set at registration |

Created by `POST /oauth/register` (dynamic client registration, unchanged). Read during authorize validation and token exchange. Never deleted by this feature.

### IdentityAssertion → VerifiedIdentity (transient, new)

The raw value of the `X-authentik-jwt` header on an `/oauth/authorize` request. Never trusted as-is; it becomes a `VerifiedIdentity` only by passing verification (research R1).

| Field | Type | Rules |
|---|---|---|
| `username` | string | the `preferred_username` claim from the userinfo response; must be present and non-empty, else the assertion is rejected |

**Validation rule (FR-004)**: an assertion is valid iff a `GET <AUTHENTIK_USERINFO_URL>` with `Authorization: Bearer <assertion>` returns HTTP 200 with a JSON body whose `preferred_username` is a non-empty string, within the verifier's timeout. Absent header, malformed/expired/foreign token (userinfo non-200), network failure, timeout, non-JSON body, or missing claim are all the same outcome: rejected, no grant path exists. A `VerifiedIdentity` lives only for the duration of one request; nothing is persisted.

### ApprovalTicket (in-memory, new — `approval-tickets.ts`, same pattern as `codes.ts`)

Binds the validated+verified authorize GET to the approval POST, so the POST needs no client-supplied OAuth params.

| Field | Type | Rules |
|---|---|---|
| `ticket` (key) | string | 256-bit random, base64url |
| `clientId` | string | from the validated authorize request |
| `redirectUri` | string | validated against the client's registered URIs at GET time |
| `codeChallenge` | string | PKCE S256 challenge from the authorize request |
| `state` | string, optional | echoed on the final redirect |
| `expiresAt` | number (ms epoch) | issued + 10 minutes |

**State transitions**: `issued` → `redeemed` (single use: first `POST` with the ticket consumes it, approve and deny alike) or `expired` (TTL passes; abandoned tabs end here — FR-003). Redeeming an unknown, expired, or already-redeemed ticket fails with an error page and issues nothing. Lost on process restart (in-flight authorizations simply restart; connected clients are unaffected).

### AuthorizationCode (in-memory, unchanged — `codes.ts`)

Single-use, 60-second TTL, stores `{clientId, redirectUri, codeChallenge}`. Issued only at the `approve` transition of an ApprovalTicket; redeemed by `POST /oauth/token` under the existing PKCE checks. Replay of a code fails (spec edge case) — unchanged semantics.

### AccessToken (stateless credential, format unchanged — `tokens.ts`)

`whmcp_<payload>.<hmac>`; payload carries `{jti, iat}`. **Lifecycle rule change**: the HMAC key is `scrypt(MCP_TOKEN_SECRET)` instead of `scrypt(CONNECTOR_PASSWORD)`. Valid across restarts while `MCP_TOKEN_SECRET` is unchanged (FR-006); rotating the secret invalidates every outstanding token at once (FR-007). No token store exists — validity is purely cryptographic.

## Configuration (part of the model's invariants)

| Variable | Required | Consumed by | Meaning |
|---|---|---|---|
| `MCP_TOKEN_SECRET` | yes in production (compose `:?` gate + `validateEnv`); optional elsewhere (absent ⇒ MCP endpoints 503-unconfigured) | `app.mcpKey = deriveKey(...)` | token-signing key material; the rotate-to-revoke lever (FR-009) |
| `AUTHENTIK_USERINFO_URL` | yes in production; optional elsewhere (absent ⇒ authorize rejects fail-closed) | identity verifier | the deployment's Authentik userinfo endpoint, e.g. `http://<authentik-container>:9000/application/o/userinfo/` |
| `CONNECTOR_PASSWORD` | **removed everywhere** (FR-008) | — | gone from env validation, compose, `.env.example`, docs |

## Relationships & flow

```text
MCP client                    browser (through Authentik outpost)                 app state
----------                    -----------------------------------                 ---------
POST /oauth/register  ──────────────────────────────────────────────────────────▶ OAuthClient row
open authorize URL ─────────▶ GET /oauth/authorize + X-authentik-jwt
                              ├─ validate params against OAuthClient
                              ├─ verify assertion (userinfo) ⇒ VerifiedIdentity
                              └─ render approval page ◀──────────────────────────  ApprovalTicket issued
                              POST /oauth/authorize {ticket, action}
                              ├─ verify assertion again ⇒ VerifiedIdentity
                              ├─ redeem ApprovalTicket (single use)
                              ├─ action=deny ⇒ 302 redirect_uri?error=access_denied
                              └─ action=approve ⇒ 302 redirect_uri?code=... ◀────  AuthorizationCode issued
POST /oauth/token {code, verifier} ─────────────────────────────────────────────▶ code redeemed (PKCE) ⇒ AccessToken minted
POST /mcp (Bearer AccessToken) ─────────────────────────────────────────────────▶ verified against deriveKey(MCP_TOKEN_SECRET)
```
