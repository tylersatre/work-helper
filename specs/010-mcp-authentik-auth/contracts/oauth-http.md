# Contract: OAuth & MCP HTTP endpoints

The externally observable HTTP behavior of the MCP connect flow after this feature. Endpoints marked *(unchanged)* are listed because clients depend on them as a set; their behavior is not modified.

Whenever `MCP_TOKEN_SECRET` is unconfigured (non-production dev/test), every endpoint below returns `503` with a JSON error naming the missing configuration — same gate as today, message no longer mentions `CONNECTOR_PASSWORD`.

## GET /.well-known/oauth-protected-resource *(unchanged)*

`200` JSON: `{ resource: "<origin>/mcp", authorization_servers: ["<origin>"], bearer_methods_supported: ["header"] }`.

## GET /.well-known/oauth-authorization-server *(unchanged)*

`200` JSON advertising `authorization_endpoint`, `token_endpoint`, `registration_endpoint` on the request origin; `response_types_supported: ["code"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`.

## POST /oauth/register *(unchanged)*

Dynamic client registration. `201` with `{client_id, client_name, redirect_uris, token_endpoint_auth_method: "none"}`; `400 invalid_client_metadata` on bad input. Reachable headless (Authentik unauthenticated path).

## GET /oauth/authorize *(changed — the interactive step)*

Reached through the Authentik outpost, which attaches `X-authentik-jwt: <access token>` after SSO login. Direct (outpost-bypassing) requests are the attack surface US2 tests.

**Inputs**: query `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, optional `state`; header `X-authentik-jwt`.

**Response order** (param validation first — signing in never weakens existing checks; identity second):

| Condition | Response |
|---|---|
| unknown `client_id`, or `redirect_uri` not registered for it | `400`, HTML rejection page (no redirect — never bounce to an unvetted URI) |
| known client but wrong `response_type` / missing `code_challenge` / method ≠ `S256` | `302` to `redirect_uri` with `error=invalid_request` (+ `state`) |
| identity assertion absent, or fails verification per [identity-verification.md](./identity-verification.md), or verifier unconfigured | `403`, HTML rejection page stating the endpoint must be reached through the deployment's Authentik sign-in; **no password prompt, no code, no redirect** |
| params valid ∧ identity verified | `200`, HTML approval page, `Cache-Control: no-store` |

**Approval page contract**: displays the verified Authentik username (HTML-escaped) and the client's registered name (or id); contains exactly one form POSTing to `/oauth/authorize` whose only flow inputs are a hidden single-use `ticket` and an `action` chosen by two buttons (`approve` / `deny`). No OAuth params ride in the form; no password field exists.

## POST /oauth/authorize *(changed — approval submission)*

Also behind Authentik; carries the same `X-authentik-jwt` header. Body (form-encoded): `ticket`, `action`.

| Condition | Response |
|---|---|
| identity assertion absent or fails verification | `403` HTML rejection page — a valid ticket alone is never sufficient |
| ticket unknown, expired, or already redeemed (double submit, CSRF replay) | `400` HTML rejection page; no code issued |
| `action=deny` (ticket redeemed) | `302` to the ticket's `redirect_uri` with `error=access_denied` (+ `state`); no code ever existed for this attempt |
| `action=approve` (ticket redeemed) | `302` to the ticket's `redirect_uri` with single-use `code` (+ `state`) |

Abandonment (no POST): the ticket expires after its TTL; nothing observable is issued (US3).

## POST /oauth/token *(unchanged)*

`authorization_code` + PKCE `code_verifier` exchange. `200 {access_token, token_type: "bearer"}`; `400 invalid_grant` for unknown/expired/replayed codes, client/redirect mismatch, or verifier mismatch; `400 unsupported_grant_type` otherwise. Reachable headless.

## POST /mcp *(unchanged)*

Bearer-token gate: missing/invalid token ⇒ `401` with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`. Valid token ⇒ MCP Streamable HTTP handling. **Token validity is defined by `MCP_TOKEN_SECRET`**: unchanged across restarts ⇒ tokens keep working (FR-006); rotated ⇒ every prior token yields `401` and reconnecting requires the full Authentik flow (FR-007).

## Removed surfaces (FR-008)

- The password page (`renderPasswordPage`) and any response containing a password input: gone from every path.
- The per-IP lockout: no `423` responses exist anywhere in the flow anymore.
- `CONNECTOR_PASSWORD`: the app starts without it in every environment; production instead requires `MCP_TOKEN_SECRET` and `AUTHENTIK_USERINFO_URL` (see [config.md](./config.md)).
