# Research: MCP Server (004-mcp-server)

**Date**: 2026-08-06 | **Spec**: [spec.md](spec.md)

All Technical Context unknowns resolved. Each decision below records what was chosen, why, and what was rejected.

## D1 — Transport: Streamable HTTP, stateless mode

**Decision**: Expose the MCP server over the Streamable HTTP transport at `POST /mcp`, using the SDK's `StreamableHTTPServerTransport` in stateless mode (`sessionIdGenerator: undefined`), with a fresh `McpServer` + transport instance per request. The transport is bridged into the existing Fastify app via `request.raw` / `reply.raw` (the SDK transport works with plain Node `IncomingMessage`/`ServerResponse`; no Express needed).

**Rationale**: Claude Desktop custom connectors speak Streamable HTTP — this is the only remote transport that satisfies "connect Claude Desktop from anywhere". Stateless mode means the server holds zero per-session state, which is exactly what FR-010 needs: a restart loses nothing because there is nothing to lose; the bearer token *is* the connection. It also keeps the single-process Fastify architecture intact.

**Alternatives considered**: stdio transport (local-only, cannot serve "from anywhere"); the deprecated HTTP+SSE transport (superseded, weaker client support going forward); stateful Streamable HTTP sessions (server-side session state would be destroyed by restarts, violating FR-010, and adds memory bookkeeping the spec explicitly doesn't want).

## D2 — Connection flow: OAuth 2.1 authorization code + PKCE, with the password page as the authorization endpoint

**Decision**: Implement the MCP authorization spec: OAuth 2.1 authorization-code flow with PKCE (S256), Dynamic Client Registration (RFC 7591), Authorization Server Metadata (RFC 8414), and Protected Resource Metadata (RFC 9728), all served by the work-helper server itself (it is both authorization server and resource server on one origin). The authorization endpoint's UI **is** the spec's password page: instead of a login/consent screen it asks for the single connector password. Endpoints are hand-rolled as Fastify routes (the SDK's server-side auth router is Express middleware; the endpoint surface we need is small and must integrate with Fastify and the lockout logic).

**Rationale**: FR-001 demands that any standards-compliant MCP client can connect, and FR-002 demands a browser password page "as part of the client's connection flow" — the OAuth browser step is precisely that hook, and it is the flow Claude Desktop custom connectors actually run (register → open browser at the authorization endpoint → redirect back → token exchange). Any bespoke gate (custom header, cookie handshake) would fail FR-001 because off-the-shelf clients wouldn't know how to complete it.

**Alternatives considered**: static bearer token pasted into client config (no password page, no browser step; Claude Desktop custom connectors don't offer a paste-a-secret path for this); SDK's `mcpAuthRouter` (Express-based, would bolt a second HTTP framework onto Fastify, and its provider abstraction doesn't fit password-derived stateless tokens or per-IP lockout hooks); a separate OAuth provider service (wildly over-scoped for a single shared password).

## D3 — Access tokens: stateless, HMAC-signed with a password-derived key

**Decision**: Access tokens are self-contained strings `whmcp_<base64url(payload)>.<base64url(sig)>` where `payload` is a small JSON blob (random token id, issued-at) and `sig` is HMAC-SHA256 over the payload, keyed by a key derived from `CONNECTOR_PASSWORD` via `node:crypto` scrypt with a fixed application salt. Tokens never expire and are never stored server-side. Verifying a token = recomputing the HMAC with the key derived from the *currently configured* password (constant-time compare). Password comparison on the password page also uses `timingSafeEqual`.

**Rationale**: This single mechanism delivers FR-010, FR-011, and FR-012 with no persistence: restart with the same password derives the same key, so existing tokens keep verifying (clients never re-see the password page); changing the password changes the key, so every outstanding token fails verification at its next use and the client is bounced to re-auth (the documented revocation lever); and any request without a validly signed token is refused. scrypt (memory-hard) makes offline key-guessing from a captured token materially harder than plain SHA-256 derivation. The derived key is computed once at boot.

**Alternatives considered**: random opaque tokens stored in SQLite (survive password changes unless extra invalidation machinery is added — revocation would no longer fall out of the design; also adds persistent "connection" rows the spec's entity model says shouldn't exist); JWTs signed with a random per-boot key (breaks FR-010 — every restart would revoke everyone); reusing the password itself as bearer token (leaks the password to every client config file and log line).

## D4 — Dynamic client registrations: persisted in SQLite

**Decision**: `POST /oauth/register` accepts public-client registrations and stores them in a new `oauth_clients` table (random `client_id`, `redirect_uris` JSON, registered metadata, `created_at`), via a normal drizzle migration. Registrations have no secret (`token_endpoint_auth_method: "none"`) and are not invalidated by password changes.

**Rationale**: Claude Desktop registers once and caches its `client_id`. If registrations lived in memory, every server restart would orphan that cached id and the next reconnect would fail confusingly at the authorize step — undermining FR-010's "restart disturbs nothing" and FR-011's "reconnecting opens the password page, and the new password grants access" (which presumes the existing registration still resolves). A registration grants nothing by itself — only knowledge of the password does — so persisting it is safe and keeps the password as the sole secret.

**Alternatives considered**: in-memory registrations (breaks cached client ids across restarts, per above); stateless signed `client_id` encoding the redirect URIs (clever but nonstandard, couples registration validity to the signing key and thus to the password, creating exactly the confusing re-registration edge cases persistence avoids).

## D5 — Authorization codes: in-memory, single-use, short-lived

**Decision**: Authorization codes live in an in-memory `Map` — code → `{clientId, redirectUri, codeChallenge, expiresAt}` — single-use, 60-second TTL, deleted on redemption. PKCE is mandatory (S256 only).

**Rationale**: A code exists for the seconds between browser redirect and token exchange; persisting it buys nothing. A restart mid-handshake just means the client retries the flow — acceptable and rare. Single-use + PKCE binding is what OAuth 2.1 requires.

**Alternatives considered**: SQLite-backed codes (persistence without a scenario that needs it); signed stateless codes (cannot enforce single-use without a server-side used-set anyway).

## D6 — Per-IP lockout: in-memory map keyed on proxy-forwarded client IP

**Decision**: A lockout tracker (plain in-memory `Map<ip, {consecutiveFailures, locked}>`) records **only password submissions** on the authorization endpoint. Wrong password increments the submitting IP's consecutive-failure count (first two failures re-render the form with an error); the third consecutive failure sets `locked` and every later submission from that IP — correct password included — is refused with a "password entry is locked" message. A correct submission from a not-locked IP resets that IP's count to zero. No expiry, no cap on the map, no clearing except process restart (the map dies with the process — restart-clears falls out for free, FR-009). The Fastify app is built with `trustProxy: true` so `request.ip` reflects `X-Forwarded-For` as supplied by Caddy (the spec's confirmed deployment context); in local dev with no proxy, `request.ip` is the socket address, which is fine.

**Rationale**: Matches FR-006 through FR-009 exactly: per-IP scoping (a stranger's lockout never touches Tyler's IP, no global lockout exists by construction), consecutive-failure semantics (edge case: two wrongs then a right resets), lockout confined to password entry (tool calls authenticate by token and never consult the tracker), restart as the sole clearing mechanism. Trusting the forwarded header is an explicit spec assumption — Caddy overwrites client-supplied values in the confirmed deployment.

**Alternatives considered**: persisting lockouts (FR-009 forbids surviving restarts); a rate-limiting library like `@fastify/rate-limit` (windowed counters, wrong semantics — the spec wants *consecutive-failure* counting with manual-only reset, which is ~30 lines, not a dependency); keying on session/cookie instead of IP (trivially evaded by clearing cookies; spec explicitly says per-IP).

## D7 — Password page: minimal server-rendered HTML, not Vue

**Decision**: The password page is a small server-rendered HTML form (inline CSS, no JavaScript required) emitted directly by the `GET /oauth/authorize` route; `POST /oauth/authorize` re-renders it with error or locked states, or issues the redirect on success. It is not part of the Vue SPA.

**Rationale**: An OAuth authorization page lives inside a browser redirect flow on a bare URL with query parameters — bootstrapping the SPA there would drag the client bundle, router, and API layer into a page with one input and one button, and complicate the automated tests for lockout states. The established "frontend is Vue" rule governs the web app's UI; this page is deliberately standalone connection plumbing, and the spec calls it "the feature's only new UI". browser-tester drives it as a plain page either way.

**Alternatives considered**: serving it from the Vue app (per above — heavyweight, entangles SPA routing with OAuth query-string state); a JSON-only API with client-side rendering (there is no client — the browser is the client).

## D8 — SDK version and Zod compatibility

**Decision**: Add `@modelcontextprotocol/sdk@^1.30.0` (latest as of 2026-08-06, verified against the npm registry) as the only new production dependency. It declares `zod: ^3.25 || ^4.0` — compatible with the project's existing `zod@^4.4.3`, which is used directly for tool input schemas.

**Rationale**: Constitution IV mandates the official SDK and no other MCP framework. Version verified live rather than assumed. No Express is added: the SDK lists Express for its own optional helpers, but `StreamableHTTPServerTransport` operates on raw Node request/response objects.

**Alternatives considered**: none — the constitution pins this choice; only the version needed research.

## D9 — Scripted MCP client for automated acceptance

**Decision**: Integration tests use the SDK's own `Client` + `StreamableHTTPClientTransport` pointed at a real listening server (`app.listen({ port: 0 })` on 127.0.0.1), with a test `OAuthClientProvider` that completes the browser leg programmatically: fetch the authorize URL, POST the password form with `fetch` (setting `X-Forwarded-For` to simulate distinct IPs against `trustProxy`), capture the redirect's `code`, and let the SDK finish the token exchange. Server "restarts" are simulated by closing the Fastify app and building a new one over the same database handle with the same or a changed password — in-memory lockouts/codes vanish (as a real restart guarantees) while SQLite data and stateless tokens carry over. The real Claude Desktop connection remains Tyler's manual acceptance step, per the spec's clarification.

**Rationale**: This makes every acceptance scenario automatable: US1 (full connect + list tools), US4 (lockout from IP A, success from IP B, restart clears), US5 (restart same password → calls keep working; new password → 401 → re-auth demands new password). Using the SDK client proves standards compliance (FR-001) instead of hand-rolled HTTP approximations. `app.inject` cannot host the SDK transport's streaming; a real port is required and cheap.

**Alternatives considered**: raw `fetch` JSON-RPC calls (wouldn't exercise a compliant client's actual connect flow, weaker FR-001 evidence); MCP Inspector via browser-tester (good for evidence screenshots, not a substitute for deterministic vitest integration coverage).

## D10 — Note/task source: thread a `source` parameter through existing services

**Decision**: `createTask` and `addNote` in `src/server/services/tasks.ts` gain a `source: 'ui' | 'mcp'` parameter (defaulting to `'ui'` so existing REST routes are untouched); MCP tool handlers pass `'mcp'`. The `task_notes.source` column and its `'mcp'` enum value already exist (reserved by the task-notes feature) — no schema change. Tools reuse the existing service layer and shared Zod validators (`titleSchema`, `noteTextSchema`) wholesale, which is what makes FR-020 (same live data, no copy/sync) true by construction.

**Rationale**: The services already implement every read and write the six tools need (`listTasksByLane`, `getTaskDetail`, `listPeople`, `getPerson`, `createTask`, `addNote`); the only missing degree of freedom is the note source. Reusing them means MCP and the web app cannot drift — one code path, one database.

**Alternatives considered**: separate MCP-side data access (guaranteed drift, violates FR-020's spirit); a request-context mechanism instead of a parameter (indirection with no second consumer in sight).

## Resolved Technical Context items

| Unknown | Resolution |
|---|---|
| How a "password page" fits a standards-compliant MCP connection | D2 — OAuth 2.1 code+PKCE flow; the authorization endpoint serves the password form |
| How connections survive restart iff password unchanged, with no session store | D3 — stateless HMAC tokens keyed by scrypt(password) |
| Remote transport Claude Desktop supports | D1 — Streamable HTTP, stateless mode |
| Where client registrations live | D4 — SQLite `oauth_clients` table |
| Per-IP lockout mechanics behind Caddy | D6 — in-memory consecutive-failure map over `trustProxy` IPs |
| SDK/Zod v4 compatibility | D8 — SDK ^1.30.0 supports zod ^4.0 (verified 2026-08-06) |
| Automated acceptance without Claude Desktop | D9 — SDK client in vitest + browser-tester on the password page; Claude Desktop is Tyler's manual step |
| MCP note source plumbing | D10 — `source` param on existing services; schema already reserved `'mcp'` |
