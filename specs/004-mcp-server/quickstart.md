# Quickstart: MCP Server (004-mcp-server)

Validation guide for the feature — how to run it, prove each story end-to-end, and where the automated evidence comes from. Shapes and endpoint behavior are specified in [contracts/](contracts/) and [data-model.md](data-model.md); implementation steps live in `tasks.md`.

## Prerequisites

- Node ≥ 22, `npm install` done (adds `@modelcontextprotocol/sdk`).
- A connector password in the environment: `CONNECTOR_PASSWORD=correct-horse-battery`.

## Run the server

```sh
CONNECTOR_PASSWORD=correct-horse-battery npm run dev
```

Server on `http://localhost:3000` (web app unchanged). Quick smoke checks:

- `curl http://localhost:3000/.well-known/oauth-authorization-server` → JSON metadata listing the authorize/token/register endpoints.
- `curl -X POST http://localhost:3000/mcp -H 'content-type: application/json' -d '{}'` → `401` with a `WWW-Authenticate` header pointing at the resource metadata (the gate is closed by default — SC-002).
- Without `CONNECTOR_PASSWORD` set → the same endpoints answer `503` connector-not-configured (never passwordless).

## Automated validation (the acceptance evidence)

```sh
npm run lint && npm run typecheck && npm test && npm run build
```

The feature's integration tests (`tests/integration/mcp-*.test.ts`) start the app on an ephemeral port and drive it with the SDK's real client (`Client` + `StreamableHTTPClientTransport`) plus scripted password-page HTTP calls, covering: full connect-through-the-gate then `tools/list` (US1); each read tool against seeded data (US2); create-task/add-note visible via the same DB the web routes serve (US3); per-IP lockout with a second IP unaffected and restart clearing (US4, via `X-Forwarded-For` under `trustProxy`); restart with unchanged vs changed password (US5, by rebuilding the app over the same DB with the same/new password). Expected outcome: all green.

Browser evidence (`docs/evidence/mcp-server/`) comes from the `browser-tester` agent driving the password page itself — success entry, wrong-password error with retry, and the locked state — plus the web app's US3 outcomes: the MCP-created card in the To Do lane, the "via MCP" note label in the task detail view, and both surviving a page reload — against the dev server started as above.

## Manual walk-through of the connect flow (optional, mirrors what a client does)

1. `curl -X POST http://localhost:3000/oauth/register -H 'content-type: application/json' -d '{"redirect_uris":["http://localhost:8976/callback"],"client_name":"probe"}'` → note the returned `client_id`.
2. Open `http://localhost:3000/oauth/authorize?response_type=code&client_id=<id>&redirect_uri=http://localhost:8976/callback&code_challenge=<S256(verifier)>&code_challenge_method=S256&state=xyz` in a browser → the password page.
3. Enter the wrong password twice → error message each time; a third wrong entry → the locked page; restart the server to clear (US4 behavior, seen live).
4. After a restart, enter `correct-horse-battery` → browser redirected to the callback with `?code=...`.
5. `curl -X POST http://localhost:3000/oauth/token -d 'grant_type=authorization_code&code=<code>&code_verifier=<verifier>&client_id=<id>&redirect_uri=http://localhost:8976/callback'` → `{ "access_token": "whmcp_..." }`.
6. `curl -X POST http://localhost:3000/mcp -H 'authorization: Bearer whmcp_...' -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → the six tools from [contracts/mcp-tools.md](contracts/mcp-tools.md).

Alternatively, MCP Inspector (`npx @modelcontextprotocol/inspector`) pointed at `http://localhost:3000/mcp` runs the whole flow interactively, browser leg included.

## Tyler's manual acceptance (Claude Desktop)

1. Deploy behind Caddy with `CONNECTOR_PASSWORD` set (Caddy terminates TLS and forwards client IPs — the lockout's deployment assumption). The app's port must not be reachable except through Caddy (bind it to the internal Docker network or firewall it): `trustProxy: true` trusts any `X-Forwarded-For` it receives, so direct access would let a caller spoof the lockout's per-IP key.
2. Claude Desktop → Settings → Connectors → Add custom connector → URL `https://<host>/mcp`.
3. The browser opens the password page; enter the password; Claude Desktop reports the connector as connected.
4. Ask about the board / a task / a person (US2), then ask it to add a task and a note (US3) and verify both in the web app, noting the "via MCP" label.
5. Revocation check (US5): change `CONNECTOR_PASSWORD`, restart, observe the next call fail and reconnection demand the new password.
