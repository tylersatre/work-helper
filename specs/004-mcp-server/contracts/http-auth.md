# Contract: HTTP endpoints — connection, auth, and gate (004-mcp-server)

All endpoints below are new Fastify routes on the existing server (same origin as the web app and `/api`). Absolute URLs in metadata are derived from the incoming request (`X-Forwarded-Proto` + `Host` under `trustProxy: true`), so no base-URL configuration is needed. If `CONNECTOR_PASSWORD` is unset or empty, every endpoint in this contract responds `503` with a JSON error saying the connector is not configured — never passwordless access.

## Discovery

### `GET /.well-known/oauth-protected-resource`

RFC 9728 Protected Resource Metadata. `200` JSON: `{ "resource": "<origin>/mcp", "authorization_servers": ["<origin>"], "bearer_methods_supported": ["header"] }`.

### `GET /.well-known/oauth-authorization-server`

RFC 8414 Authorization Server Metadata. `200` JSON: `{ "issuer": "<origin>", "authorization_endpoint": "<origin>/oauth/authorize", "token_endpoint": "<origin>/oauth/token", "registration_endpoint": "<origin>/oauth/register", "response_types_supported": ["code"], "grant_types_supported": ["authorization_code"], "code_challenge_methods_supported": ["S256"], "token_endpoint_auth_methods_supported": ["none"] }`.

## Registration

### `POST /oauth/register` (RFC 7591, open registration)

Request JSON must include non-empty `redirect_uris: string[]` (each an absolute URI; `http` allowed only for loopback hosts, otherwise `https` — plus custom schemes like `claude://` are accepted as absolute URIs). `client_name` optional. `201` JSON echoes the accepted metadata plus generated `client_id`, `token_endpoint_auth_method: "none"`. Invalid body → `400` `{ "error": "invalid_client_metadata", "error_description": ... }`. Registrations persist in `oauth_clients` (see [data-model.md](../data-model.md)).

## Password page (authorization endpoint)

### `GET /oauth/authorize`

Query params (OAuth 2.1): `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, optional `state`.

- Unknown `client_id` or `redirect_uri` not exactly matching a registered URI → `400` HTML error page (no redirect — per OAuth, never redirect to an unvalidated URI).
- Other invalid params (bad `response_type`, missing/duff PKCE) → `302` to `redirect_uri` with `error=invalid_request` (+ `state`).
- Requesting IP locked → `423` HTML page: heading and message that password entry is locked (no form).
- Otherwise → `200` HTML: the password page. One `<input type="password" name="password">`, one submit button, flow params carried in hidden fields. Served with `Cache-Control: no-store`.

### `POST /oauth/authorize` (form-encoded)

Body: `password` + the same flow params from hidden fields (revalidated identically to GET).

- IP locked (before password comparison): `423` HTML locked page — correct password included (FR-007).
- Wrong password (1st/2nd consecutive failure): `401` HTML page — the form again with a visible error message, retry possible (FR-005). 3rd consecutive failure: transitions the IP to locked and responds with the `423` locked page.
- Correct password (not locked): resets the IP's failure count, mints a single-use 60s authorization code bound to `{client_id, redirect_uri, code_challenge}`, responds `302 Location: <redirect_uri>?code=...&state=...`. The client's callback completes the connection — this redirect is how "the page reports success and the client finishes connecting" (the callback owner, e.g. Claude Desktop, shows its own success page).

## Token exchange

### `POST /oauth/token` (form-encoded or JSON)

`grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, `redirect_uri`.

- Valid, unexpired, unused code + matching `client_id`/`redirect_uri` + `S256(code_verifier) == code_challenge` → `200` `{ "access_token": "whmcp_...", "token_type": "bearer" }`. No `expires_in`, no `refresh_token` — the token lives until the password changes. Code is consumed.
- Any mismatch, replay, or expiry → `400` `{ "error": "invalid_grant", ... }`; wrong `grant_type` → `400` `{ "error": "unsupported_grant_type" }`.

## MCP endpoint

### `POST /mcp`

- `Authorization: Bearer whmcp_...` verifying against the current password-derived key → request body handled by a per-request stateless `StreamableHTTPServerTransport` + `McpServer` (tools in [mcp-tools.md](mcp-tools.md)). JSON-RPC responses per the MCP Streamable HTTP transport.
- Missing, malformed, or non-verifying token (incl. every pre-password-change token) → `401` with header `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"` and empty JSON error body — this header is what sends a compliant client into the authorization flow above (FR-012, US5).

### `GET /mcp`, `DELETE /mcp`

`405 Method Not Allowed` (stateless transport — no server-push stream, no session to delete).

## Lockout interaction guarantees

The lockout tracker is consulted **only** by `GET`/`POST /oauth/authorize`. `/mcp` and `/oauth/token` never touch it: a locked IP with a valid bearer token keeps calling tools (edge case in spec), and lockout state at one IP is invisible to every other IP (FR-008, SC-003).
