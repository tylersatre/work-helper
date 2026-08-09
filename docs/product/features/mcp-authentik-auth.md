# Feature: mcp-authentik-auth

## User story

As Tyler, I want connecting an MCP client to work-helper to require signing in through Authentik instead of entering the shared connector password, so that MCP access uses the same SSO identity, policies, and brute-force protection as everything else on my server — I plug `https://work-helper.<domain>/mcp` into Claude Code, sign in with my Authentik account in the browser, and the connection works.

## Background and approach (decided 2026-08-09)

Two approaches were considered. Making Authentik the OAuth authorization server itself (work-helper validates Authentik-issued tokens) gives the cleanest architecture, but the "plug in a URL and it just works" flow requires OAuth dynamic client registration, which Authentik only gained in its 2026.8 release **as an enterprise-licensed feature** ([goauthentik/authentik#8751](https://github.com/goauthentik/authentik/issues/8751), [PR #24225](https://github.com/goauthentik/authentik/pull/24225)) — not available on a home deployment. The chosen approach instead keeps work-helper's existing, tested OAuth machinery (dynamic client registration, PKCE, token minting on `/oauth/*`) and replaces only the interactive step: `/oauth/authorize` is the one part of the MCP connect flow that runs in a real browser, so it moves behind Authentik's proxy authentication, and the server-rendered password page is replaced by a page that trusts the Authentik-asserted identity forwarded by the outpost. Programmatic endpoints (`/oauth/register`, `/oauth/token`, `/mcp`) stay outside Authentik and keep their existing protections (registered clients, PKCE, bearer tokens). Deployment-side, this means the Authentik proxy provider's unauthenticated-path carve-outs narrow so `/oauth/authorize` is protected while the programmatic endpoints stay open — `docs/deploy.md` must be updated as part of this feature.

## Acceptance criteria

- **Given** work-helper deployed behind Authentik per `docs/deploy.md`, with this feature's narrowed unauthenticated paths applied
  **When** I add `https://work-helper.<domain>/mcp` as an MCP server in Claude Code and start connecting, and the browser step opens
  **Then** I see an Authentik login (never a work-helper password page), and after signing in I see a work-helper approval page naming my Authentik username, and approving it completes the connection — a follow-up tools/list call from the client succeeds

- **Given** the approval page reached through Authentik
  **When** I decline the approval (or simply never approve)
  **Then** no authorization code is issued and the MCP client does not connect

- **Given** a client that can reach the app without going through the Authentik outpost (e.g. straight to the app's port)
  **When** it sends a request to `/oauth/authorize` carrying a forged Authentik identity header
  **Then** it is rejected and no authorization code can be obtained that way — the app must verify the identity assertion actually originates from Authentik, not merely that a header is present

- **Given** an MCP client connected under this feature with tool calls succeeding
  **When** the server restarts with its token secret unchanged
  **Then** the client's tool calls keep succeeding without re-authorization

- **Given** an MCP client connected under this feature with tool calls succeeding
  **When** the token secret is changed and the server restarts
  **Then** the client's next tool call is rejected as unauthorized, and reconnecting goes through the Authentik sign-in and approval flow again

- **Given** the deployed app under this feature
  **When** any MCP client connects end to end
  **Then** no shared connector password exists anywhere in the flow, and the app no longer requires `CONNECTOR_PASSWORD` to start

## Out of scope

- Authentik as the OAuth authorization server for MCP (validating Authentik-issued access tokens at `/mcp`) — blocked on enterprise-only dynamic client registration; revisit if that changes or an enterprise license ever makes sense.
- Per-user permissions inside work-helper — who may reach the app at all is Authentik's job (application assignment policies); once through, every identity gets the same access, matching today's single-user model.
- Web UI authentication — already live via the Authentik proxy configuration; this feature touches only the MCP connect flow.
- The password page's per-IP lockout — it exists to protect password guessing, which no longer exists; Authentik's own brute-force protections cover the login step. The lockout code goes away with the password page.
- claude.ai custom connector acceptance — it should work identically (same standard MCP OAuth + dynamic client registration), but Claude Code is the acceptance target; claude.ai is a bonus, verified opportunistically.

## Open questions

- Approval page vs. auto-issue: after Authentik sign-in, should the app still show a one-click "Approve connection" page (recommended — it guards against drive-by authorization requests), or issue the code immediately with no interaction?
- What replaces `CONNECTOR_PASSWORD` as token-signing key material — a required `MCP_TOKEN_SECRET` env var (keeps the "change it to revoke all clients" story) or a server-generated key persisted in `./data/`? Leaning env var for the explicit revocation story.
- How the app verifies the identity assertion came from Authentik (e.g. validating the outpost's signed JWT header against Authentik's JWKS, vs. network-level trust by unpublishing the direct port) — implementation decision for `/speckit-plan`, but the forged-header acceptance criterion above must hold either way.
- Whether automated acceptance runs a real Authentik instance in the deploy test harness (heavy: Authentik needs Postgres + Redis) or simulates the outpost's forwarded-identity request shape, with connecting real Claude Code through real Authentik as Tyler's manual acceptance step — mirroring the Claude Desktop precedent in `mcp-server`.
