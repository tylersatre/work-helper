# Feature Specification: MCP Authentik Auth

**Feature Branch**: `010-mcp-authentik-auth`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-authentik-auth.md — connecting an MCP client to work-helper should require signing in through Authentik instead of entering the shared connector password, so MCP access uses the same SSO identity, policies, and brute-force protection as everything else on the server."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect an MCP client through Authentik sign-in (Priority: P1)

Tyler adds `https://work-helper.<domain>/mcp` as an MCP server in Claude Code. When the connect flow opens its browser step, he is greeted by his server's Authentik login — never a work-helper password page. After signing in with his Authentik account, work-helper shows an approval page naming his Authentik username; clicking approve completes the connection, and the client can immediately list and call tools.

**Why this priority**: This is the entire point of the feature — MCP access joins the same SSO identity, policies, and brute-force protection as everything else on the server. Without this story there is nothing to ship.

**Independent Test**: Can be fully tested by starting a fresh MCP client connection against a deployment fronted by Authentik and observing the sign-in → approval → connected sequence, ending with a successful tools/list call.

**Acceptance Scenarios**:

1. **Given** work-helper deployed behind Authentik per `docs/deploy.md` with this feature's narrowed unauthenticated paths applied, **When** Tyler adds `https://work-helper.<domain>/mcp` as an MCP server in Claude Code and the browser step opens, **Then** he sees an Authentik login (never a work-helper password page).
2. **Given** Tyler has signed in through that Authentik login, **When** the browser lands back on work-helper, **Then** he sees a work-helper approval page naming his Authentik username.
3. **Given** the approval page is showing, **When** Tyler approves the connection, **Then** the MCP client completes the connection and a follow-up tools/list call from the client succeeds.
4. **Given** Tyler already has an active Authentik session in his browser, **When** he starts connecting a new MCP client, **Then** the login step is satisfied by the existing session and he goes straight to the approval page.

---

### User Story 2 - Forged identity assertions are rejected (Priority: P2)

An attacker (or a misconfigured client) reaches the app directly — for example on the app's own port, bypassing the Authentik layer — and sends an authorization request carrying a fabricated identity header claiming to be Tyler. The app refuses it: an identity assertion only counts when the app can verify it genuinely originated from Authentik, not merely that a header with the right name is present.

**Why this priority**: The security of the whole design rests on this. If a forged header is honored, the Authentik step becomes decorative and anyone with network reach to the app can mint MCP access.

**Independent Test**: Can be fully tested by sending authorization requests straight to the app (bypassing Authentik) with forged identity headers and confirming that no authorization grant can be obtained that way.

**Acceptance Scenarios**:

1. **Given** a client that can reach the app without going through the Authentik outpost, **When** it sends a request to the authorization endpoint carrying a forged Authentik identity header, **Then** the request is rejected and no authorization code is issued.
2. **Given** a request to the authorization endpoint carrying no identity assertion at all (e.g. a misconfigured deployment left the path unprotected), **When** it arrives, **Then** it is rejected with a clear error — the app never falls back to a password prompt or issues a grant.
3. **Given** a request whose identity assertion is expired, malformed, or issued by something other than the deployment's Authentik instance, **When** it arrives at the authorization endpoint, **Then** it is treated the same as a forged one and rejected.

---

### User Story 3 - Declining approval leaves the client unconnected (Priority: P2)

After signing in through Authentik, Tyler sees the approval page but declines it — or simply closes the tab and never approves. The MCP client does not connect, and no authorization grant is ever issued for that attempt. The explicit approval step also means a drive-by authorization request (a link Tyler didn't initiate) can't silently connect a client just because he happens to be signed in.

**Why this priority**: Consent is the guard between "signed in" and "this specific client gets access". It must fail closed.

**Independent Test**: Can be fully tested by reaching the approval page through Authentik and declining (or abandoning) it, then confirming the client never obtains a grant and remains unconnected.

**Acceptance Scenarios**:

1. **Given** the approval page reached through Authentik, **When** Tyler declines the approval, **Then** no authorization code is issued and the MCP client does not connect.
2. **Given** the approval page reached through Authentik, **When** Tyler never interacts with it (abandons the tab), **Then** no authorization code is issued and the MCP client does not connect.

---

### User Story 4 - Connections survive restarts; rotating the secret revokes them (Priority: P3)

A connected MCP client keeps working across server restarts without any re-authorization, as long as the token secret is unchanged. When Tyler deliberately changes the token secret and restarts, every previously connected client is cut off: its next tool call is rejected as unauthorized, and reconnecting requires going through the Authentik sign-in and approval flow again.

**Why this priority**: Preserves the operational story that already exists today — durable connections in normal operation, plus a single explicit lever ("change the secret") to revoke all clients at once.

**Independent Test**: Can be fully tested by connecting a client, restarting the server with the secret unchanged (calls keep succeeding), then changing the secret and restarting (next call rejected, reconnect requires the full sign-in flow).

**Acceptance Scenarios**:

1. **Given** an MCP client connected under this feature with tool calls succeeding, **When** the server restarts with its token secret unchanged, **Then** the client's tool calls keep succeeding without re-authorization.
2. **Given** an MCP client connected under this feature with tool calls succeeding, **When** the token secret is changed and the server restarts, **Then** the client's next tool call is rejected as unauthorized, and reconnecting goes through the Authentik sign-in and approval flow again.

---

### User Story 5 - The shared connector password is fully retired (Priority: P3)

With Authentik guarding the interactive step, the shared connector password has no remaining purpose. The app starts and runs without `CONNECTOR_PASSWORD`, no password page exists anywhere in the connect flow, and the per-IP lockout that existed only to protect password guessing is gone with it.

**Why this priority**: Leaving a dormant shared-password path would undercut the feature's security story; removing it is what makes "no shared secret anywhere in the flow" true.

**Independent Test**: Can be fully tested by starting the app without `CONNECTOR_PASSWORD` configured and walking an MCP client through the full connect flow, confirming no password entry appears anywhere and the app never demands the variable.

**Acceptance Scenarios**:

1. **Given** the deployed app under this feature, **When** any MCP client connects end to end, **Then** no shared connector password exists anywhere in the flow, and the app no longer requires `CONNECTOR_PASSWORD` to start.

---

### Edge Cases

- A visitor reaches the authorization endpoint through Authentik but the authorization request itself is invalid (unknown client, missing or bad code-challenge): the existing programmatic validations still apply and reject it — signing in never weakens the checks that exist today.
- Clients connected under the old password-based flow at the moment this feature deploys: they are revoked at cutover and must reconnect through the new Authentik flow (acceptable — development phase, single user, no real data).
- The approval page is submitted twice, or an issued authorization code is replayed: single-use code semantics are unchanged from today's flow; the second use fails.
- Authentik itself is down or unreachable: the browser step fails visibly at the Authentik layer; the app issues no grants and programmatic endpoints continue serving already-connected clients.
- A different Authentik user (not Tyler) is granted access to the application in Authentik and connects: they get the same full access as any identity — per-user permissions are explicitly out of scope; who may connect at all is Authentik's application-assignment policy's job.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The browser-interactive step of the MCP connect flow MUST require signing in through the deployment's Authentik instance; an unauthenticated visitor is sent to Authentik login and never sees a work-helper password prompt.
- **FR-002**: After Authentik sign-in, the app MUST show an approval page that names the signed-in Authentik identity, and MUST issue an authorization grant only on explicit approval.
- **FR-003**: Declining the approval, or never completing it, MUST result in no authorization grant and no connected client.
- **FR-004**: The app MUST verify that an asserted identity on an authorization request genuinely originates from the deployment's Authentik instance; requests whose assertion is absent, forged, expired, malformed, or from any other issuer MUST be rejected, and no authorization grant may be obtainable that way — mere presence of an identity header is never sufficient.
- **FR-005**: Programmatic endpoints of the connect flow (client registration, token exchange) and the MCP endpoint itself MUST remain reachable without an interactive browser session and MUST keep their existing protections (registered clients, PKCE, bearer tokens).
- **FR-006**: Tokens issued to connected clients MUST remain valid across server restarts while the token secret is unchanged.
- **FR-007**: Changing the token secret MUST invalidate all previously issued tokens: the next tool call from any previously connected client is rejected as unauthorized, and reconnecting requires the full Authentik sign-in and approval flow.
- **FR-008**: The shared connector password MUST be removed end to end: the app starts without `CONNECTOR_PASSWORD`, the server-rendered password page is gone, and the per-IP lockout that protected it is removed with it.
- **FR-009**: Token-signing key material MUST come from a required, operator-set configuration value, preserving the explicit "change it to revoke every client" operational story.
- **FR-010**: `docs/deploy.md` MUST be updated so the documented Authentik configuration protects the authorization step while leaving the programmatic endpoints (registration, token exchange, MCP) outside Authentik, and a deployment following the updated document satisfies this feature's criteria.

### Key Entities

- **Identity assertion**: The statement of who the signed-in user is, produced by Authentik when it fronts the authorization step and forwarded to the app; carries the username shown on the approval page and must be verifiable as genuinely Authentik-originated.
- **Authorization grant**: The single-use permission created only when a verified, signed-in user explicitly approves a specific client's connection request; exchanged by the client for an access token.
- **Client registration**: A connecting MCP client's self-registration record, unchanged from today's flow; identifies the client through the rest of the handshake.
- **Access token**: The credential a connected client presents on MCP calls; validity is tied to the operator-set token secret, so rotating the secret revokes all of them at once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new MCP client connection — from plugging the URL into the client to the first successful tool call — completes in under 2 minutes, with the Authentik account as the only credential entered anywhere.
- **SC-002**: Zero authorization grants are obtainable without a genuine Authentik sign-in: every bypass attempt (direct-to-app requests, forged or missing identity assertions) is rejected in security testing.
- **SC-003**: Connected clients survive server restarts with zero re-authorizations while the token secret is unchanged.
- **SC-004**: Rotating the token secret revokes 100% of previously connected clients on their next call, and each must re-complete the sign-in and approval flow to reconnect.
- **SC-005**: No shared password remains anywhere: the app runs with no shared-password configuration and no password entry field appears in any step of the connect flow.

## Out of Scope

- Authentik as the OAuth authorization server for MCP (validating Authentik-issued access tokens at the MCP endpoint) — blocked on enterprise-only dynamic client registration; revisit if that changes or an enterprise license ever makes sense.
- Per-user permissions inside work-helper — who may reach the app at all is Authentik's job (application assignment policies); once through, every identity gets the same access, matching today's single-user model.
- Web UI authentication — already live via the Authentik proxy configuration; this feature touches only the MCP connect flow.
- The password page's per-IP lockout as a preserved capability — it exists to protect password guessing, which no longer exists; Authentik's own brute-force protections cover the login step, and the lockout code goes away with the password page.
- claude.ai custom connector acceptance — it should work identically (same standard MCP OAuth and dynamic client registration), but Claude Code is the acceptance target; claude.ai is a bonus, verified opportunistically.

## Assumptions

- The explicit approval page stays (rather than auto-issuing a grant immediately after sign-in) — it guards against drive-by authorization requests, matching the recommendation in the feature description.
- The replacement for `CONNECTOR_PASSWORD` as token-signing key material is a required operator-set environment variable rather than a server-generated persisted key, preserving the explicit revoke-by-rotation story — matching the leaning in the feature description; its exact name is a planning decision.
- How the app verifies that an identity assertion genuinely originates from Authentik (e.g. validating a signed assertion against Authentik's published keys vs. network-level isolation of the direct port) is an implementation decision for `/speckit-plan`; the forged-assertion requirement (FR-004) must hold whichever mechanism is chosen.
- Automated acceptance simulates the Authentik outpost's forwarded-identity request shape rather than running a full Authentik stack (which needs its own database and cache services) in the test harness; connecting real Claude Code through real Authentik is Tyler's manual acceptance step — mirroring the Claude Desktop precedent in the `mcp-server` feature.
- The deployment described in `docs/deploy.md` (work-helper fronted by Authentik's proxy) is in place; this feature narrows its unauthenticated-path carve-outs so the authorization step is protected while programmatic endpoints stay open.
- Single-user model: any identity Authentik admits to the application receives the same full access; restricting who gets in is configured in Authentik, not work-helper.
