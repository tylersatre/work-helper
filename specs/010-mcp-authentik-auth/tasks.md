# Tasks: MCP Authentik Auth

**Input**: Design documents from `/specs/010-mcp-authentik-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (oauth-http.md, identity-verification.md, config.md), quickstart.md

**Tests**: Included — TDD is mandatory per the constitution (Principle II): every behavior gets its failing test before the code that makes it pass.

**Organization**: Tasks are grouped by user story. US1 (P1) carries the swap itself — the authorize rewrite physically replaces the password gate, so the collateral updates that keep the suite green (helper rewrite, call-site updates, lockout-test deletion) ride with it. US2–US5 layer hardening, consent semantics, revocation semantics, and retirement proof on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Path Conventions

Single-project layout at repo root: `src/server/`, `tests/unit/`, `tests/integration/`, `tests/deploy/`, `scripts/`, per plan.md.

---

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: The one piece of infrastructure every story's tests consume — a faithful fake of the Authentik userinfo contract.

- [X] T001 Create the stub identity provider test helper in tests/integration/helpers/stub-identity-provider.ts: a real local HTTP server honoring the simulation contract in contracts/identity-verification.md — accepts GET with `Authorization: Bearer <token>`, answers 200 + JSON `{ "preferred_username": "<name>" }` for tokens it currently honors and 401 for everything else, and exposes mint/invalidate methods so tests can create honored tokens and revoke them

---

## Phase 2: Foundational (Config Contract)

**Purpose**: The environment-variable contract every later phase wires against. Self-contained red→green slice (validateEnv has no other in-repo consumers of its checked fields).

- [X] T002 Rewrite tests/unit/env.test.ts for the new required-var matrix per contracts/config.md: in production, missing MCP_TOKEN_SECRET throws an error naming it and pointing at .env.example, missing AUTHENTIK_USERINFO_URL likewise, both present passes, non-production always passes, and CONNECTOR_PASSWORD is neither required nor referenced — tests must FAIL against current env.ts
- [X] T003 Update src/server/env.ts validateEnv to require MCP_TOKEN_SECRET and AUTHENTIK_USERINFO_URL in production (each error naming the specific variable and pointing at .env.example) and drop the CONNECTOR_PASSWORD check, making T002 green
- [X] T004 [P] Update .env.example: document MCP_TOKEN_SECRET (token-signing key material; rotate to revoke every connected client) and AUTHENTIK_USERINFO_URL (the deployment's Authentik userinfo endpoint, e.g. `http://<authentik-server-container>:9000/application/o/userinfo/`), and remove CONNECTOR_PASSWORD

**Checkpoint**: `npm test` green. Note: from here until Phase 6 completes, `npm run test:deploy` is expected red (the containerized app now requires the new vars in production but the deploy harness only provides them in T023) — run the deploy suite at Phase 6/7 checkpoints, not before.

---

## Phase 3: User Story 1 - Connect an MCP client through Authentik sign-in (Priority: P1) 🎯 MVP

**Goal**: The interactive authorize step requires a verified Authentik-originated identity and explicit approval; approving completes the connection through to a successful tools/list. This phase performs the swap: identity verifier, approval tickets, approval page, the authorize rewrite, app wiring, and every collateral test update needed to keep the suite green.

**Independent Test**: Run the full connect flow against an in-process app with the stub identity provider (simulated outpost headers per the spec's assumption): register → authorize with honored assertion → approval page names the username → approve → token exchange → tools/list succeeds.

### Tests for User Story 1 (write first, confirm they FAIL)

- [X] T005 [P] [US1] Write failing unit tests for the identity verifier in tests/unit/mcp-identity.test.ts against a local stub userinfo server (reuse tests/integration/helpers/stub-identity-provider.ts): honored token resolves `{ username }` from preferred_username; absent/empty assertion resolves null with no network call; userinfo 401 (forged/expired/revoked/foreign token) → null; network error (unreachable URL) → null; response slower than the 5 s timeout → null; non-JSON body → null; missing or empty preferred_username → null; verify() never throws in any case
- [X] T006 [P] [US1] Write failing unit tests for the approval-ticket store in tests/unit/mcp-approval-tickets.test.ts: issue returns an unguessable base64url ticket (256-bit); redeem returns the bound { clientId, redirectUri, codeChallenge, state } exactly once; a second redeem of the same ticket fails; redeeming an unknown ticket fails; a ticket expires after its 10-minute TTL (fake timers), matching the codes.ts store pattern
- [X] T007 [P] [US1] Write failing unit tests for the approval page in tests/unit/mcp-approval-page.test.ts (the replacement for the password-page suite): renders the verified username and the client's registered name (falling back to client id), HTML-escapes both, contains exactly one form POSTing to /oauth/authorize whose only flow inputs are a hidden ticket field and an action chosen by approve/deny buttons, carries no OAuth params and no password input; also covers rendering of the 403 rejection page (names Authentik sign-in as the required path) and the generic error page

### Implementation for User Story 1

- [X] T008 [P] [US1] Implement the IdentityVerifier interface and the userinfo-backed verifier in src/server/mcp/auth/identity.ts per contracts/identity-verification.md (GET AUTHENTIK_USERINFO_URL with `Authorization: Bearer <assertion>`, 5 s hard timeout, VerifiedIdentity iff 200 + JSON + non-empty preferred_username, null on every other outcome, never throws) — makes T005 green
- [X] T009 [P] [US1] Implement the one-time TTL approval-ticket store in src/server/mcp/auth/approval-tickets.ts (same pattern as src/server/mcp/auth/codes.ts; 256-bit random base64url id, 10-minute TTL, single-use redeem, binds clientId/redirectUri/codeChallenge/state) — makes T006 green
- [X] T010 [P] [US1] Implement approval, rejection, and error page rendering in src/server/mcp/auth/approval-page.ts — makes T007 green
- [X] T011 [US1] Rewrite tests/integration/helpers/oauth-client.ts for the approval flow: delete submitPassword and connectThroughPasswordGate; add helpers to GET the authorize URL with an X-authentik-jwt header, extract the ticket from the approval page, POST { ticket, action } with the header, and a connectThroughApproval(serverUrl, { assertion }) composing register → authorize → approve → token exchange (NOTE: T011–T015 form one red→green slice — the repo will not compile between T011 and T015; commit at the T015 green checkpoint)
- [X] T012 [US1] Rewrite tests/integration/mcp-connect.test.ts as the failing US1 happy path: app built with mcpTokenSecret and an identity verifier pointed at the stub identity provider (T001); register → authorize GET with an honored X-authentik-jwt returns 200 approval page naming the stub username, with Cache-Control: no-store and no password input anywhere → POST action=approve returns 302 to redirect_uri with a single-use code (+ state) → token exchange succeeds → tools/list succeeds; also keep the existing programmatic-validation cases (unknown client → 400 page, bad response_type/code_challenge → 302 error=invalid_request) passing through the outpost-simulated path, and re-key the unconfigured-gate case: an app built with no token secret answers 503 on every connector endpoint with a message naming MCP_TOKEN_SECRET (this is the failing test for T013's http.ts message change)
- [X] T013 [US1] Rewire the app plumbing: src/server/app.ts replaces the connectorPassword option and decoration with mcpTokenSecret and identityVerifier (mcpKey = deriveKey(mcpTokenSecret) when set; keep the mcpKey-unconfigured gate); src/server/index.ts wires process.env.MCP_TOKEN_SECRET and constructs the userinfo verifier from process.env.AUTHENTIK_USERINFO_URL; src/server/mcp/http.ts sendUnconfigured message names MCP_TOKEN_SECRET instead of CONNECTOR_PASSWORD
- [X] T014 [US1] Rewrite GET and POST /oauth/authorize in src/server/mcp/auth/oauth-routes.ts per contracts/oauth-http.md: param validation first and unchanged (unknown client/redirect → 400 HTML page, no redirect; bad response_type/challenge/method → 302 error=invalid_request); identity second — assertion absent, unverifiable, or verifier unconfigured → 403 rejection page, fail closed, never a password prompt; GET with valid params + verified identity issues an approval ticket and renders the approval page (Cache-Control: no-store); POST re-verifies identity, redeems the ticket (unknown/expired/already-redeemed → 400 error page, no code), and on action=approve issues the single-use authorization code against the ticket's stored params and 302-redirects with code (+ state); remove the password-page/lockout imports, password comparison, and all lockout calls (the deny branch is US3's task T020 — until then non-approve actions get the 400 error page)
- [X] T015 [US1] Update every remaining caller of the deleted password-gate helper to connectThroughApproval with the stub identity provider, and remove the lockout suite: tests/integration/mcp-read-tools.test.ts, tests/integration/mcp-capture-tools.test.ts, tests/integration/email-read-tools.test.ts, tests/integration/email-person-linking.test.ts, tests/integration/email-sync.test.ts, mechanical re-key of tests/integration/mcp-revocation.test.ts setup (restart/rotation semantics deepened in T021), and delete tests/integration/mcp-lockout.test.ts (the surface it tests no longer exists); full `npm test`, lint, typecheck, build green here
- [X] T016 [P] [US1] Create the dev-only simulated outpost scripts/outpost-sim.ts per research R7: serves a stub userinfo endpoint and reverse-proxies to the dev server injecting X-authentik-jwt with a stub token for a configurable username (`--upstream`, `--username`, default tyler; ports per quickstart §2), so browsers and MCP clients can walk the full flow with no Authentik; give it a startup self-check that curls its own userinfo endpoint (stub token → 200 + preferred_username, anything else → 401) and exits non-zero on drift, so evidence runs fail fast if the sim stops matching the contract

**Checkpoint**: US1 fully functional — quickstart §2's simulated walkthrough works end to end; unit + integration suites green.

---

## Phase 4: User Story 2 - Forged identity assertions are rejected (Priority: P2)

**Goal**: No authorization grant is obtainable without a genuinely Authentik-originated assertion — direct-to-app forgeries, missing assertions, expired/foreign tokens, and unconfigured verifiers all land on the same fail-closed rejection.

**Independent Test**: Send authorization requests straight at the app (no outpost simulation) with each attack shape from contracts/identity-verification.md's rejection table and confirm none yields a code.

### Tests for User Story 2 (write first)

- [X] T017 [US2] Write the forged-identity integration suite in tests/integration/mcp-forged-identity.test.ts covering the full rejection table of contracts/identity-verification.md against a registered client with otherwise-valid params: fabricated X-authentik-jwt → 403 with no Location header and no code; no identity headers at all → 403 with a clear error naming Authentik sign-in; `X-authentik-username: tyler` alone (no JWT header) → 403; a stub-minted token invalidated before use (expired/revoked) → 403; a token honored only by a second, foreign stub instance → 403; an app built with no identity verifier configured → 403 even for a token the stub honors; POST /oauth/authorize with a valid ticket but absent/failing assertion → 403 (a ticket alone is never sufficient); and in every case assert no password field and no 423 appears anywhere and no authorization code is obtainable for the attempt; finally cover the spec's Authentik-down edge case: with a client already connected via connectThroughApproval, stop the stub identity provider and assert the client's tool calls keep succeeding while a new authorize attempt gets the 403 rejection (fail-closed authorize never bleeds into the bearer path)

### Implementation for User Story 2

- [X] T018 [US2] Close any gaps T017 exposes in src/server/mcp/auth/oauth-routes.ts or src/server/mcp/auth/identity.ts (verification ordering, unconfigured-verifier fail-close, POST re-verification, rejection status/copy) until the suite is green — expected small: US1's rewrite already implements fail-closed rejection

**Checkpoint**: SC-002 evidence exists — the recorded T017 run shows every bypass attempt rejected.

---

## Phase 5: User Story 3 - Declining approval leaves the client unconnected (Priority: P2)

**Goal**: Deny and abandon both end with no grant: deny redirects with error=access_denied, abandonment expires the ticket, and a ticket can never be redeemed twice.

**Independent Test**: Reach the approval page through the simulated outpost, then decline (or never submit) and confirm the client never obtains a code and remains unconnected.

### Tests for User Story 3 (write first, deny branch FAILS until T020)

- [X] T019 [US3] Extend tests/integration/mcp-connect.test.ts with the consent-refusal scenarios: POST action=deny redeems the ticket and 302-redirects to the ticket's redirect_uri with error=access_denied (+ state) and no code param, and the client cannot complete a token exchange for that attempt; submitting the same ticket a second time (double submit after either approve or deny) gets the 400 error page and never a second code; abandoning after the GET (no POST ever sent) leaves nothing issued — no code exists and /oauth/token has nothing redeemable for that attempt

### Implementation for User Story 3

- [X] T020 [US3] Implement the deny branch in POST /oauth/authorize in src/server/mcp/auth/oauth-routes.ts: redeem the ticket, 302 to the stored redirect_uri with error=access_denied (+ state), never issue a code — makes T019 green

**Checkpoint**: US1 approve, US2 reject, US3 decline/abandon all green together.

---

## Phase 6: User Story 4 - Connections survive restarts; rotating the secret revokes them (Priority: P3)

**Goal**: Token validity is keyed solely to MCP_TOKEN_SECRET — unchanged secret ⇒ tokens survive restarts; rotated secret ⇒ every client is cut off and must redo the full sign-in + approval flow. Proven in-process and against the real Docker image.

**Independent Test**: Connect a client, restart with the secret unchanged (calls keep succeeding), rotate the secret and restart (next call 401, reconnect requires the full flow) — at integration level and in the deploy suite.

### Tests & implementation for User Story 4

- [X] T021 [US4] Deepen tests/integration/mcp-revocation.test.ts around MCP_TOKEN_SECRET (write missing assertions first): rebuilding the app with the same secret (simulated restart) keeps a previously issued token working with zero re-authorization (SC-003); rebuilding with a rotated secret makes the client's next call 401 with the WWW-Authenticate resource_metadata challenge, and a full reconnect via connectThroughApproval then succeeds (SC-004); adjust code only if an assertion fails (none expected — mechanics are unchanged from tokens.ts)
- [X] T022 [P] [US4] Update compose.yaml: replace the `${CONNECTOR_PASSWORD:?...}` startup gate with `${MCP_TOKEN_SECRET:?...}` (same fail-fast mechanism naming the variable) and pass AUTHENTIK_USERINFO_URL through to the app service environment
- [X] T023 [P] [US4] Update tests/deploy/harness.ts: the generated .env writes MCP_TOKEN_SECRET and AUTHENTIK_USERINFO_URL and the connector-password field/plumbing is removed end to end
- [X] T024 [US4] Rework tests/deploy/mcp-connect.test.ts: run the stub identity provider as a throwaway container attached to the work-helper Docker network (trackContainer pattern from tests/deploy/caddy-proxy.test.ts; e.g. node:22-alpine running a self-contained stub script) with the app container's AUTHENTIK_USERINFO_URL pointing at it by container name; connect a real MCP client through the containerized app to a successful tools/list; restart the app container with the secret unchanged and confirm tool calls keep succeeding; rotate MCP_TOKEN_SECRET in .env, recreate, and confirm the next call is 401 and a full reconnect through the approval flow is required; rework tests/deploy/caddy-proxy.test.ts: update its MCP connect setup the same way and delete its password-page and per-IP-lockout-through-Caddy scenarios (password page reachable through Caddy, three wrong passwords → 423, forged X-Forwarded-For lockout cases) — that surface no longer exists under this feature; keep the remaining proxy-header and routing coverage

**Checkpoint**: `npm run test:deploy` green again from here (T022–T024 restored harness/compose coherence) except fresh-deploy assertions updated in T025.

---

## Phase 7: User Story 5 - The shared connector password is fully retired (Priority: P3)

**Goal**: CONNECTOR_PASSWORD, the password page, and the lockout are gone end to end; the app starts and runs everywhere without them, and the deploy gate names MCP_TOKEN_SECRET.

**Independent Test**: Start the app (and the Docker deployment) with no CONNECTOR_PASSWORD configured anywhere and walk the full connect flow; no password entry appears and nothing demands the variable.

### Tests & implementation for User Story 5

- [X] T025 [US5] Update tests/deploy/fresh-deploy.test.ts: `docker compose up` without MCP_TOKEN_SECRET refuses to start with an error naming MCP_TOKEN_SECRET (replacing the CONNECTOR_PASSWORD assertion); a fresh deploy configured with only the new variables — no CONNECTOR_PASSWORD anywhere in .env — starts cleanly and serves
- [X] T026 [US5] Delete the retired surfaces: src/server/mcp/auth/password-page.ts, src/server/mcp/auth/lockout.ts, tests/unit/mcp-password-page.test.ts, tests/unit/mcp-lockout.test.ts (all unreferenced since T014/T015); lint, typecheck, build, full test suite green after deletion
- [X] T027 [US5] Retirement sweep with recorded evidence (SC-005): grep src/, tests/, scripts/, compose.yaml, and .env.example for CONNECTOR_PASSWORD, password-page, and lockout references and fix any stragglers to zero matches (docs/deploy.md is handled by T028); record the clean grep output as evidence

**Checkpoint**: All five stories complete; both suites (`npm test`, `npm run test:deploy`) fully green.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The operator documentation FR-010 requires, browser evidence for UI-facing criteria, and the final independent verification pass.

- [X] T028 [P] Rewrite the Authentik/MCP sections of docs/deploy.md per contracts/config.md (FR-010): the proxy provider's Unauthenticated Paths become exactly `^/mcp`, `^/oauth/register`, `^/oauth/token`, `^/\.well-known/`; the .env table documents MCP_TOKEN_SECRET and AUTHENTIK_USERINFO_URL and drops CONNECTOR_PASSWORD; state that the app container reaches the Authentik server container for userinfo over the shared network; update troubleshooting (MCP client can't connect → check the four-line list; work-helper error page instead of Authentik login → /oauth/authorize left unauthenticated or request bypassed the outpost; remove stale CONNECTOR_PASSWORD rows) add the cutover note that password-flow clients must reconnect, and have the manual-acceptance walkthrough ask Tyler to note the wall-clock time from pasting the MCP URL to the first successful tool call, recording SC-001's under-2-minutes evidence
- [X] T029 [P] Capture browser evidence with the browser-tester agent driving the dev server through scripts/outpost-sim.ts (quickstart §2) into docs/evidence/mcp-authentik-auth/: the approval page naming tyler with no password field (US1/FR-002), the deny outcome redirecting with error=access_denied (US3), and the 403 rejection page on a direct outpost-bypassing hit (US2)
- [X] T030 Run the full quickstart.md validation (`npm test`, `npm run lint && npm run typecheck && npm run build`, `npm run test:deploy`), then dispatch the verifier agent to independently confirm every acceptance criterion has its passing automated check and surface-appropriate evidence before the PR (real-Authentik end-to-end — including SC-001's timing and US1 scenario 4's existing-session skip-login behavior, which is Authentik-session behavior invisible to the app — remains Tyler's manual acceptance per the spec's Assumptions, scripted by the updated docs/deploy.md; the verifier should treat those as manual-acceptance items, not missing automated checks)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: independent of Phase 1 (different files) but complete both before any story
- **US1 (Phase 3)**: depends on T001 (stub provider) and Phase 2; T011–T015 are one atomic red→green slice (repo does not compile mid-slice — commit at T015)
- **US2 (Phase 4)** and **US3 (Phase 5)**: each depends only on US1; independent of each other and parallelizable
- **US4 (Phase 6)**: T021 depends on US1 (T011 helper, T015 re-key); T022/T023 depend only on Phase 2; T024 depends on T022 + T023 + T001
- **US5 (Phase 7)**: T025 depends on T022/T023; T026 depends on T014/T015 (imports removed); T027 depends on T026
- **Polish (Phase 8)**: T028 anytime after Phase 2 (documents the final contract); T029 depends on T016 + US1–US3 behavior; T030 last

### Deploy-suite red window

`npm run test:deploy` is expected red from Phase 2 until T022–T025 land (the app requires the new vars before the harness provides them). The Stop-hook gate (lint/typecheck/test/build) stays green at every phase checkpoint; run the deploy suite explicitly at the Phase 6 and Phase 7 checkpoints.

### Parallel Opportunities

- T005, T006, T007 (US1 unit tests — three new files)
- T008, T009, T010 (US1 units — three new files, each gated only on its own test)
- T016 (outpost-sim) alongside any US1 task after T014
- Phases 4 and 5 (US2/US3) in parallel after US1
- T022 and T023 (compose vs harness) in parallel; T028 in parallel with any post-Phase-2 work

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (T001) + Phase 2 (T002–T004)
2. Phase 3 (T005–T016) — this is the swap; at its checkpoint the feature is demonstrably alive via quickstart §2
3. STOP and validate: simulated end-to-end connect with tools/list succeeding

### Incremental Delivery

1. MVP as above → US2 (forgery armor, SC-002 evidence) → US3 (consent semantics) → US4 (restart/rotation + deploy suite restored) → US5 (retirement proof) → Polish (docs, browser evidence, verifier)
2. Each phase checkpoint leaves `npm test` green; deploy-suite coherence returns at Phase 6 by design
3. Commit per task or logical slice (Conventional Commits); T011–T015 commit together at green
