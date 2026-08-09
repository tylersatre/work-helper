# Phase 0 Research: MCP Authentik Auth

All NEEDS CLARIFICATION items from the Technical Context and the spec's open planning questions are resolved below.

## R1. How the app verifies an identity assertion genuinely originates from Authentik (FR-004)

**Decision**: Userinfo introspection. The app takes the raw token from the `X-authentik-jwt` request header and presents it as `Authorization: Bearer <token>` to the deployment's Authentik userinfo endpoint (global, `https://<authentik>/application/o/userinfo/`), configured via a new required env var `AUTHENTIK_USERINFO_URL`. A 200 response whose JSON body carries a non-empty `preferred_username` proves the token was minted by that Authentik instance and is still valid; the username is what the approval page displays. Anything else — no header, malformed token, expired token, token signed by anything other than this Authentik, network error, timeout, non-200, missing claim — is one rejection path: no grant, clear error page, never a password fallback.

**Rationale**: Only the deployment's Authentik can answer its own userinfo endpoint for a token it minted, which is exactly the property FR-004 demands ("genuinely originates from the deployment's Authentik instance"). It needs zero new dependencies (one `fetch`), zero shared secrets, and no coupling to Authentik's signing internals. Expiry comes free: authentik access tokens are short-lived and userinfo rejects expired ones.

**Why not JWKS signature verification (the "obvious" approach)**: It is structurally impossible for authentik proxy providers. `ProxyProvider.set_oauth_defaults` in authentik's source hard-codes `self.signing_key = None` on every save ([models.py](https://github.com/goauthentik/authentik/blob/main/authentik/providers/proxy/models.py), verified on current `main`), and with no signing key authentik signs JWTs symmetrically (HS256) with the provider's client secret ([OAuth2 provider docs](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)). The provider's JWKS endpoint (what `X-authentik-meta-jwks` points at) is therefore empty for proxy providers, and upstream JWT validation against it has been reported and closed wontfix ([goauthentik/authentik#5447](https://github.com/goauthentik/authentik/issues/5447)).

**Alternatives considered**:

- Validate `X-authentik-jwt` against the provider's JWKS (`X-authentik-meta-jwks`) — rejected: empty JWKS for proxy providers, per above. Also, trusting a JWKS URL taken from a request header would itself be a forgery vector; the trust anchor must be operator configuration either way.
- Verify HS256 locally with the proxy provider's client secret — rejected: the secret is an authentik-internal value not surfaced for this purpose, `set_oauth_defaults` re-runs on every provider save so the coupling is fragile, and it hands the app a credential it doesn't otherwise need.
- Network-level trust only (don't publish the app port; assume anything reaching the app came through the outpost) — rejected: the spec's User Story 2 independent test explicitly sends requests straight to the app and requires rejection, and FR-004 says header presence is never sufficient. Network isolation remains good deployment hygiene but cannot be the mechanism.

**Accepted nuance (documented, in line with spec scope)**: userinfo accepts any valid access token minted by this Authentik instance, not exclusively tokens of the work-helper proxy provider. Anyone holding such a token is an authenticated user of Tyler's Authentik, and per the spec ("who may connect at all is Authentik's application-assignment policy's job" + single-user model) that is the intended trust boundary. The response's `ak_proxy` claim could later narrow this to proxy-provider tokens if per-provider restriction is ever wanted; deliberately not done now.

## R2. The assertion transport: what the outpost actually sends

**Decision**: Read exactly one request header, `X-authentik-jwt`, on `/oauth/authorize` GET and POST. Ignore the other `X-authentik-*` convenience headers (username, email, uid) for security decisions — the displayed username comes from the verified userinfo response, never from a header.

**Rationale**: The proxy outpost sets `X-authentik-jwt` to the raw OAuth access token of the authenticated session and overwrites any client-supplied value via `headers.Set` (authentik `internal/outpost/proxyv2/application/mode_common.go`), alongside `X-authentik-meta-jwks` and the identity convenience headers ([proxy provider docs](https://docs.goauthentik.io/add-secure-apps/providers/proxy/)). Requests arriving on unauthenticated paths or straight at the app port can carry arbitrary forged headers, which is why no bare header value is ever trusted — only what survives R1's userinfo check.

**Alternatives considered**: trusting `X-authentik-username` directly (rejected — trivially forgeable direct-to-app, the exact attack US2 forbids); consuming Authentik's `Set-Cookie` session (rejected — the outpost terminates the session itself; the app never sees usable session state).

## R3. What replaces `CONNECTOR_PASSWORD` as token-signing key material (FR-008, FR-009)

**Decision**: A new required env var `MCP_TOKEN_SECRET`. `app.mcpKey = deriveKey(MCP_TOKEN_SECRET)` — the existing scrypt derivation and `whmcp_` HMAC token format in `tokens.ts` are untouched. Production startup (`validateEnv`) fails fast without it; `compose.yaml` gains the same `${MCP_TOKEN_SECRET:?...}` gate `CONNECTOR_PASSWORD` has today. Outside production, absence leaves MCP endpoints "unconfigured" (503), exactly as today.

**Rationale**: Matches the spec's leaning (assumption: required operator-set env var, preserving the explicit "change it to revoke every client" story). Keeping the derivation and token format means FR-006 (restart survival) and FR-007 (rotation revokes) hold by construction — they're the same mechanics already proven by `mcp-revocation.test.ts`, just re-keyed.

**Alternatives considered**: server-generated key persisted in `./data/` (rejected in the spec's assumptions — muddies the revocation story); reusing the name `CONNECTOR_PASSWORD` (rejected — FR-008 requires the app to start without it, and the name would misdescribe a value nobody types anywhere).

## R4. Approval flow shape: page, ticket, decline, abandon (FR-002, FR-003)

**Decision**: `GET /oauth/authorize` (params already validated, identity verified per R1) stores the validated flow params server-side in a new one-time **approval ticket** (in-memory TTL store, same pattern as `codes.ts`; 256-bit random id, 10-minute TTL, single-use) and renders an approval page showing the verified username, the client name, and two submit actions. `POST /oauth/authorize` carries only `ticket` + `action`: it re-verifies identity (the POST also flows through the outpost), redeems the ticket, and on `approve` issues the single-use authorization code against the ticket's stored params; on `deny` it 302-redirects to the client's `redirect_uri` with `error=access_denied` (+ `state`). Abandoning the page issues nothing and the ticket expires. Expired, unknown, or already-redeemed tickets get a clear error page and no code.

**Rationale**: The explicit page is a spec assumption (drive-by-request guard). The ticket does three jobs at once: CSRF defense-in-depth (a cross-site form POST cannot present an unpredictable single-use ticket, independent of Authentik's cookie SameSite policy), deterministic double-submit semantics (second submit fails — matching the spec's edge case), and the POST no longer needs to trust or re-validate client-supplied OAuth params since it uses the server-stored copy. `error=access_denied` is the standard OAuth response for a declined authorization and makes the MCP client fail cleanly rather than hang.

**Alternatives considered**: auto-issue the code right after sign-in (rejected by the spec's assumptions); hidden-field round-trip of flow params like the password page did (rejected — re-validates attacker-editable input on POST and gives double-submit two codes); signed cookie CSRF token (rejected — needs a cookie plugin dependency for no added benefit over the ticket).

## R5. Narrowed Authentik unauthenticated paths (FR-001, FR-005, FR-010)

**Decision**: The documented Proxy Provider **Unauthenticated Paths** change from `^/mcp`, `^/oauth/`, `^/\.well-known/` to: `^/mcp`, `^/oauth/register`, `^/oauth/token`, `^/\.well-known/`. `/oauth/authorize` (GET and POST — path rules are method-blind) thereby requires an Authentik session: browsers get the Authentik login redirect (FR-001), and the outpost forwards `X-authentik-jwt` on every request it proxies through. Registration, token exchange, discovery, and `/mcp` stay reachable headless (FR-005). `docs/deploy.md` step 2 of the Authentik section is rewritten accordingly, including its troubleshooting entries.

**Rationale**: Smallest possible diff to the deployed configuration that puts exactly the one browser-interactive endpoint behind SSO. Entries are Golang regexes matched per authentik docs; anchored literal prefixes avoid accidental over-matching (`^/oauth/register` also covers nothing else — the app has no other `/oauth/r...` routes).

**Alternatives considered**: protecting all of `/oauth/` and carving exceptions back out (rejected — inverted logic, easier to get wrong in the admin UI); Forward-auth mode with Caddy (rejected — the deployment already uses Proxy mode end to end; changing modes is out of this feature's scope).

## R6. Test strategy per layer (Constitution II & III; spec assumption on simulating the outpost)

**Decision**:

- **Unit**: the identity verifier against a throwaway local HTTP stub of userinfo (valid token, wrong token, expired-token 401, timeout, non-JSON, missing `preferred_username`); the approval-ticket store (single-use, TTL, param binding); approval-page rendering (username display + HTML escaping, approve/deny forms); `validateEnv` matrix for the two new required vars.
- **Integration**: a `stub-identity-provider.ts` helper — a real local HTTP server issuing/honoring stub tokens through the same userinfo contract — wired into the app via `AUTHENTIK_USERINFO_URL`-equivalent options, so the production verifier code path runs unmodified. `oauth-client.ts` gains `connectThroughApproval(...)` which attaches `X-authentik-jwt` to authorize requests (simulating the outpost per the spec's assumption) and submits the approval form. Covers US1 happy path end to end (register → authorize → approve → token → tools/list), US2 forged/missing/expired assertions direct-to-app, US3 decline + abandon, US4 restart/rotation (re-keyed `mcp-revocation.test.ts`), US5 startup without `CONNECTOR_PASSWORD`.
- **Deploy** (`tests/deploy`): harness `.env` switches to `MCP_TOKEN_SECRET` + `AUTHENTIK_USERINFO_URL`; the stub identity provider runs as a throwaway container attached to the `work-helper` network (the `trackContainer` pattern `caddy-proxy.test.ts` already uses), so the containerized app resolves it like it would resolve `authentik-server`. Proves the real image runs the whole flow with no `CONNECTOR_PASSWORD` anywhere.
- **Browser evidence**: `browser-tester` drives the dev server through `scripts/outpost-sim.ts` (R7) and screenshots the Authentik-less approvable flow: approval page naming the username, decline outcome, and the clear rejection page when no assertion is present (direct hit).
- **Manual acceptance (Tyler)**: real Claude Code against real Authentik per updated `docs/deploy.md` — the one criterion automation intentionally does not cover, mirroring the Claude Desktop precedent in feature 004.

**Rationale**: Runs every line of production verification code against a faithful fake of the one external contract (userinfo over HTTP), keeps the suites Authentik-free (Authentik needs Postgres + Redis — the spec explicitly assumes simulation), and leaves nothing evidence-less: each acceptance scenario maps to a named automated test or a browser-tester screenshot.

**Alternatives considered**: running real Authentik in the deploy harness (rejected — heavy stack, slow CI, and the spec assumption already sanctions simulation); mocking `fetch` inside the verifier (rejected for integration tests — a real HTTP hop exercises URL handling, timeouts, and status paths a mock would fake).

## R7. Dev ergonomics without Authentik

**Decision**: A new dev-only script `scripts/outpost-sim.ts` plays both Authentik roles on localhost: it serves a stub userinfo endpoint and reverse-proxies to the dev server injecting `X-authentik-jwt` with a stub token and a configurable username (default `tyler`) — exactly the request shape the real outpost produces. Run the dev server with `AUTHENTIK_USERINFO_URL` pointed at the sim, browse (or point an MCP client) through the sim's port, and the full sign-in-free flow works locally. Without the env vars set, MCP surfaces stay 503-unconfigured exactly as today's missing-`CONNECTOR_PASSWORD` behavior.

**Rationale**: Gives `browser-tester` a real browser path to the approval page (Playwright page navigation can't attach custom per-request headers agent-side), doubles as the manual dev loop, and keeps the simulation logic in one place shared conceptually with the integration helper.

**Alternatives considered**: a Vite middleware injecting headers (rejected — dev-server-only, doesn't help MCP clients or the deploy suite); requiring a real Authentik for any local run (rejected — hostile dev loop, and CI can't do it).

## R8. Identity claim displayed and required

**Decision**: `preferred_username` from the verified userinfo response is required (reject the assertion if absent) and is what the approval page displays. No identity is persisted anywhere — it exists for the duration of the authorize interaction only.

**Rationale**: Authentik's proxy providers always request the `openid profile email` scopes (`set_oauth_defaults`), so `preferred_username` is always present for genuine outpost tokens; requiring it keeps the contract crisp and fail-closed. Nothing downstream needs the identity (single-user model, per-user permissions out of scope), so storing it would be scope creep.

**Alternatives considered**: falling back through `email`/`sub` when `preferred_username` is missing (rejected — a genuine outpost token always has it, so a fallback only ever launders an unexpected token shape); embedding the username in minted access tokens (rejected — unused by any consumer today).
