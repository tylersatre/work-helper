# Tasks: MCP Server

**Input**: Design documents from `/specs/004-mcp-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-auth.md, contracts/mcp-tools.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires a failing test before the code that makes it pass. Every test task MUST be written and observed failing before its corresponding implementation task begins.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US5); Setup/Foundational/Polish tasks carry no story label
- Every task names its exact file path(s)

## Path Conventions

Single-package web app at repository root: server code in `src/server/`, shared validation in `src/shared/`, tests in `tests/unit/` and `tests/integration/`, drizzle migrations in `drizzle/`. All new MCP code lives under `src/server/mcp/` with auth isolated in `src/server/mcp/auth/` (plan.md Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring in the one new dependency everything else builds on.

- [X] T001 Install `@modelcontextprotocol/sdk@^1.30.0` as a production dependency (`npm install @modelcontextprotocol/sdk`), confirming it resolves against the existing `zod@^4.4` per research D8 — updates `package.json` and `package-lock.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and app-wiring touch-points every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add the `oauth_clients` table (`client_id` text PK, `client_name` text nullable, `redirect_uris` text/json not null, `created_at` integer not null — per data-model.md) to `src/server/db/schema.ts` and generate the drizzle migration in `drizzle/` (`npx drizzle-kit generate`)
- [X] T003 [P] Add a `connectorPassword?: string` option and `trustProxy: true` to `buildApp` in `src/server/app.ts`, and read `CONNECTOR_PASSWORD` from the environment into that option in `src/server/index.ts` (no routes yet — wiring only, existing tests stay green)

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Connect a client through the password gate (Priority: P1) 🎯 MVP

**Goal**: A standards-compliant MCP client pointed at `/mcp` is sent through the OAuth 2.1 code+PKCE flow (contracts/http-auth.md), completes the browser password page, and finishes connecting — `tools/list` succeeds with a bearer token, and nothing is reachable without one.

**Independent Test**: Scripted SDK client (`Client` + `StreamableHTTPClientTransport`) starts connecting, the test OAuth helper completes the password page over plain HTTP, and a follow-up `tools/list` succeeds; an unauthenticated `POST /mcp` gets `401` + `WWW-Authenticate`; with no `CONNECTOR_PASSWORD` configured everything answers `503`.

### Tests for User Story 1 (write first — must fail before implementation) ⚠️

- [X] T004 [P] [US1] Failing unit test for stateless tokens in `tests/unit/mcp-tokens.test.ts`: scrypt key derivation is deterministic per password, minted `whmcp_<payload>.<sig>` tokens verify against the same password's key, fail against a different password's key, and fail on any payload/signature tampering (timing-safe compare), per research D3 and data-model AccessToken
- [X] T005 [P] [US1] Failing unit test for the password page renderer in `tests/unit/mcp-password-page.test.ts`: form state renders one `<input type="password" name="password">`, a submit button, and all flow params as hidden fields; error state re-renders the form with a visible error message (locked state is added in US4)
- [X] T006 [P] [US1] Scripted OAuth test helper in `tests/integration/helpers/oauth-client.ts`: a test `OAuthClientProvider` (research D9) that registers via `POST /oauth/register`, fetches the authorize URL, POSTs the password form with `fetch` (supporting an `X-Forwarded-For` override for later IP-simulation tests), captures the redirect `code`, and lets the SDK finish the token exchange
- [X] T007 [US1] Failing integration test in `tests/integration/mcp-connect.test.ts` (uses T006, real server on `app.listen({ port: 0 })`): full connect through the gate then `tools/list` succeeds (US1-AS1); wrong password shows the error page then the correct password on retry completes the connection (US1-AS2); `POST /mcp` without a token → `401` with `WWW-Authenticate: Bearer resource_metadata=...` (US1-AS3, FR-012); both discovery documents match contracts/http-auth.md; unset `CONNECTOR_PASSWORD` → `503` on every connector endpoint (edge case: never passwordless)

### Implementation for User Story 1

- [X] T008 [P] [US1] Implement `src/server/mcp/auth/tokens.ts`: scrypt key derivation from the connector password with a fixed app salt (once at boot), `mintToken()` producing `whmcp_<base64url(payload)>.<base64url(hmacSha256)>` with `{jti, iat}` payload, and `verifyToken()` recomputing the HMAC with `timingSafeEqual` — makes T004 pass
- [X] T009 [P] [US1] Implement `src/server/mcp/auth/clients.ts`: register (validate `redirect_uris` per contract — absolute URIs, `http` only for loopback, custom schemes allowed; generate random `client_id`) and look up rows in `oauth_clients` via drizzle
- [X] T010 [P] [US1] Implement `src/server/mcp/auth/codes.ts`: in-memory `Map` of single-use authorization codes → `{clientId, redirectUri, codeChallenge, expiresAt}`, 60s TTL, S256 only, deleted on redemption (research D5)
- [X] T011 [P] [US1] Implement `src/server/mcp/auth/password-page.ts`: server-rendered HTML (inline CSS, no JS) for the form and error states with flow params in hidden fields, served with `Cache-Control: no-store` — makes T005 pass
- [X] T012 [P] [US1] Implement `src/server/mcp/tools.ts`: a `createMcpServer()` factory returning a fresh `McpServer` per request with the tool-registration seam in place (read tools arrive in US2, capture tools in US3)
- [X] T013 [US1] Implement `src/server/mcp/auth/oauth-routes.ts` (uses T008–T011): `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-authorization-server` with origin-derived URLs, `POST /oauth/register` (201 / 400 `invalid_client_metadata`), `GET /oauth/authorize` (validate client + exact redirect URI → 400 HTML without redirect; other bad params → 302 `error=invalid_request`; else the password page), `POST /oauth/authorize` (timing-safe password check → 401 error page on wrong, mint code + 302 redirect with `code` and `state` on correct), `POST /oauth/token` (PKCE S256 verification, single-use code redemption → `{access_token, token_type: "bearer"}`, else 400 `invalid_grant` / `unsupported_grant_type`), all answering `503` when no password is configured — per contracts/http-auth.md
- [X] T014 [US1] Implement `src/server/mcp/routes.ts` (uses T008, T012): `POST /mcp` verifying the bearer token then bridging `request.raw`/`reply.raw` into a per-request stateless `StreamableHTTPServerTransport` (`sessionIdGenerator: undefined`, research D1); missing/invalid token → `401` + `WWW-Authenticate` header + empty JSON body; `GET`/`DELETE /mcp` → `405`; `503` when no password configured
- [X] T015 [US1] Register the OAuth routes (T013) and MCP route (T014) in `buildApp` in `src/server/app.ts`, then run `npm test` and confirm T004, T005, and T007 all pass and existing tests stay green

**Checkpoint**: US1 fully functional — a compliant MCP client can connect through the password gate and list tools; nothing reachable without the gate.

---

## Phase 4: User Story 2 - Ask about the board, tasks, and people (Priority: P2)

**Goal**: Four read tools — `list-board`, `get-task`, `search-people`, `get-person` — answer from the web app's live data via the existing service layer (FR-013–FR-016, FR-020).

**Independent Test**: Seed known lanes/tasks/notes/people, connect an authorized scripted client, call each read tool, and compare responses field-for-field against the seeded data and contracts/mcp-tools.md shapes.

### Tests for User Story 2 (write first — must fail before implementation) ⚠️

- [X] T016 [US2] Failing integration test in `tests/integration/mcp-read-tools.test.ts` (authorized client via T006 helper, seeded data per US2 acceptance scenarios): `list-board` returns all four configured lanes in order with "Follow up with Sam" in To Do and "Draft Q3 goals" in In Progress (US2-AS1); `get-task` returns title, lane, notes newest-first with text/timestamp/`source: "ui"`, and linked person "Sam Rivera" (US2-AS2); `search-people` for "sam" returns Sam Rivera (name + email) and not Ana Alvarez, and a no-match query returns `{people: []}` as success; `get-person` returns firstName/lastName/email/phone and `extraFields: {"Nickname": "Sammy"}` (US2-AS3); unknown ids → tool errors `Task <id> not found` / `Person <id> not found` (edge cases)

### Implementation for User Story 2

- [X] T017 [US2] Implement the `list-board` and `get-task` tools in `src/server/mcp/tools.ts` calling the existing task services (`src/server/services/tasks.ts`), returning `structuredContent` exactly per contracts/mcp-tools.md plus a text summary; unknown task → tool error (`isError: true`), not a protocol error
- [X] T018 [US2] Implement the `search-people` and `get-person` tools in `src/server/mcp/tools.ts` calling the existing people services (`src/server/services/people.ts`), matching the web app's search semantics and the contract shapes (`name` as `"First Last"`, `extraFields` only for fields with values); then confirm T016 passes

**Checkpoint**: US1 and US2 work — an authorized assistant can answer board, task, and people questions from live data.

---

## Phase 5: User Story 3 - Capture tasks and notes from a conversation (Priority: P3)

**Goal**: `create-task` and `add-note` tools write through the existing services with `source: 'mcp'`, so captures appear in the web app immediately, labeled "via MCP", and survive reload (FR-017–FR-019, SC-004).

**Independent Test**: Authorized scripted client creates a task with an initial note and adds a note to an existing task; the same server's web API (the routes the UI reads) shows the new card in the first configured lane and the notes with `source: "mcp"`; whitespace-only inputs are rejected with the exact validation messages and write nothing.

### Tests for User Story 3 (write first — must fail before implementation) ⚠️

- [X] T019 [US3] Failing integration test in `tests/integration/mcp-capture-tools.test.ts` (authorized client via T006 helper): `create-task` with title "Book venue" and note "Requested during planning chat" → task in the first configured lane, initial note `source: "mcp"`, both visible through the same app's web API routes (US3-AS1, FR-020); `add-note` on a task with an existing `"ui"` note → new note is newest, `source: "mcp"`, existing note untouched (US3-AS2); whitespace-only title → tool error containing `Title is required` and no task created (US3-AS3); whitespace-only text → tool error containing `Note text is required` and no note created; `add-note` on an unknown task → `Task <id> not found` and nothing changes; `create-task` without a note → card in first lane with empty notes (edge cases)

### Implementation for User Story 3

- [X] T020 [US3] Add a trailing `source: 'ui' | 'mcp' = 'ui'` parameter to `createTask` and `addNote` in `src/server/services/tasks.ts` (research D10 — the `task_notes.source` column and `'mcp'` enum value already exist); existing REST routes keep the default and all existing tests stay green
- [X] T021 [US3] Implement the `create-task` and `add-note` tools in `src/server/mcp/tools.ts` passing `source: 'mcp'`, reusing `titleSchema` and `noteTextSchema` from `src/shared/validation.ts` for input validation, returning `structuredContent` per contracts/mcp-tools.md; then confirm T019 passes

**Checkpoint**: US1–US3 work — the connector is a working inbox, with MCP-sourced captures visible in the web app.

---

## Phase 6: User Story 4 - Lock out password guessing, per IP (Priority: P4)

**Goal**: Three consecutive wrong password submissions from one IP lock that IP out of password entry (correct password included) until a restart; no other IP is ever affected; established connections never consult the lockout (FR-006–FR-009).

**Independent Test**: Script wrong submissions from IP A (via `X-Forwarded-For` under `trustProxy`) until locked, verify refusal with the correct password from A, verify success from IP B, rebuild the app over the same DB (simulated restart) and verify A works again.

### Tests for User Story 4 (write first — must fail before implementation) ⚠️

- [X] T022 [P] [US4] Failing unit test for the lockout tracker in `tests/unit/mcp-lockout.test.ts` covering every transition in data-model.md: failures 1 and 2 allow retry, failure 3 sets locked, submissions while locked are refused before password comparison and don't touch the counter, a correct submission resets the count to zero (two-wrong-then-right edge case), state is strictly per-IP; and extend `tests/unit/mcp-password-page.test.ts` with the locked-state rendering (heading + locked message, no form)
- [X] T023 [P] [US4] Failing integration test in `tests/integration/mcp-lockout.test.ts` (T006 helper with `X-Forwarded-For`): three wrong passwords from IP A → first two show retryable errors, third answers `423` locked; correct password from A still `423` (US4-AS1); correct password from IP B succeeds while A is locked (FR-008); restart simulation (rebuild app, same DB and password) → A's correct password succeeds (US4-AS2, FR-009); two wrongs then a correct from a fresh IP succeeds and resets its count; a locked IP's previously issued bearer token still calls tools (lockout never touches `/mcp`)

### Implementation for User Story 4

- [X] T024 [US4] Implement `src/server/mcp/auth/lockout.ts`: in-memory `Map<ip, {consecutiveFailures, locked}>` with `recordFailure(ip)`, `recordSuccess(ip)`, `isLocked(ip)` per research D6 — no expiry, no cap, dies with the process — makes the T022 tracker tests pass
- [X] T025 [US4] Add the locked-state rendering to `src/server/mcp/auth/password-page.ts` and wire the tracker into `GET`/`POST /oauth/authorize` in `src/server/mcp/auth/oauth-routes.ts`: locked IP → `423` HTML locked page before any password comparison, third consecutive failure transitions to locked, success resets the count; `/mcp` and `/oauth/token` never consult the tracker (contracts/http-auth.md lockout guarantees); then confirm T022 and T023 pass

**Checkpoint**: US1–US4 work — the gate is hardened against guessing without ever risking a global lockout.

---

## Phase 7: User Story 5 - Revoke access by changing the password (Priority: P5)

**Goal**: Restart with the same password disturbs nothing (tokens keep verifying, no password page); changing the password and restarting cuts off every existing token at its next call and only the new password grants access (FR-010, FR-011).

**Independent Test**: Connect a scripted client, rebuild the app over the same DB with the password unchanged (tool calls keep succeeding with the old token), then rebuild with a new password (next call `401`, reconnection demands the new password, the old one is refused).

### Tests for User Story 5 (write first — must fail before implementation) ⚠️

- [X] T026 [US5] Failing integration test in `tests/integration/mcp-revocation.test.ts` (T006 helper, restart = rebuild app over the same DB per research D9): connect and verify tool calls succeed; restart with the same password → the same token's tool calls keep succeeding and the password page never reappears (US5-AS1, using the client's persisted registration); restart with a changed password → next tool call `401` + `WWW-Authenticate` (US5-AS2); reconnecting opens the password page where the old password is refused (retryable error) and the new password completes the connection; two clients connected with the same password are both cut off by one change (edge case)

### Implementation for User Story 5

- [X] T027 [US5] Make T026 pass end-to-end: verify the stateless-token design (T008) and persisted registrations (T002/T009) deliver restart-survival and password-change revocation with no code beyond what exists, fixing any gaps the test surfaces in `src/server/mcp/auth/tokens.ts` or `src/server/mcp/auth/oauth-routes.ts` (e.g. key derivation reading a stale password, registration lookups failing after rebuild)

**Checkpoint**: All five user stories work — connect, read, capture, lockout, and revocation all proven by automated tests.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and the evidence the definition of done requires.

- [X] T028 [P] Run the quickstart smoke checks against a dev server started with `CONNECTOR_PASSWORD` set (quickstart.md): `curl` the two discovery documents, unauthenticated `POST /mcp` → `401` + `WWW-Authenticate`, and (restarted without the env var) `503` connector-not-configured on the same endpoints
- [X] T029 Run the full verification gate `npm run lint && npm run typecheck && npm test && npm run build` and confirm everything is green
- [X] T030 [P] Collect browser evidence with the `browser-tester` agent against the dev server into `docs/evidence/mcp-server/`: password page success entry (redirect to callback), wrong-password error with retry, and the locked state after three failures, plus the US3 web-app outcomes — the MCP-created "Book venue" card in the To Do lane, the "via MCP" note label in the task detail view, and both still present after a page reload (quickstart.md evidence map; constitution Principle III browser evidence for US3-AS1/AS2)
- [X] T031 Run the `verifier` agent to independently confirm every acceptance scenario in spec.md (US1–US5) against the integration tests and browser evidence; Claude Desktop connection remains Tyler's manual acceptance step per the spec clarification, during which SC-001's under-a-minute connect budget is also confirmed (quickstart.md "Tyler's manual acceptance")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: T002 and T003 are independent of T001 and of each other — all three can run in parallel; all must finish before any user story.
- **US1 (Phase 3)**: Depends on Phases 1–2. Blocks the *testing* of every later story (they all connect through the gate), so implement it first.
- **US2 (Phase 4)** and **US3 (Phase 5)**: Each depends on US1 (authorized connection) but not on the other; both extend `src/server/mcp/tools.ts`, so run their implementation tasks sequentially or on separate branches.
- **US4 (Phase 6)**: Depends on US1 (authorize endpoints exist); independent of US2/US3.
- **US5 (Phase 7)**: Depends on US1 (tokens, registrations); its test also exercises tool calls, so run it after US2 gives it a real tool to call (T017's `list-board`).
- **Polish (Phase 8)**: Depends on all user stories being complete; T028 and T030 can run in parallel, T029 before T031.

### Within Each User Story

- Test tasks MUST be written and observed failing before their implementation tasks (constitution Principle II — code written before its failing test is discarded).
- Auth building blocks (tokens/clients/codes/password-page) before routes; routes before app wiring; app wiring before the story's tests can go green.

### Parallel Opportunities

- Phase 2: T002 ∥ T003 (schema vs app wiring).
- US1 tests: T004 ∥ T005 ∥ T006 (three different files); T007 follows T006.
- US1 implementation: T008 ∥ T009 ∥ T010 ∥ T011 ∥ T012 (five separate new files), then T013 → T014 → T015.
- US4 tests: T022 ∥ T023.
- Polish: T028 ∥ T030.
- Not parallel: T017/T018/T021 (all edit `src/server/mcp/tools.ts`), T013/T025 (both edit `oauth-routes.ts`).

---

## Parallel Example: User Story 1

```bash
# Write the three independent test surfaces together (all must fail first):
Task: "Failing unit test for stateless tokens in tests/unit/mcp-tokens.test.ts"
Task: "Failing unit test for the password page renderer in tests/unit/mcp-password-page.test.ts"
Task: "Scripted OAuth test helper in tests/integration/helpers/oauth-client.ts"

# Then build the five independent auth/tool modules together:
Task: "Implement src/server/mcp/auth/tokens.ts"
Task: "Implement src/server/mcp/auth/clients.ts"
Task: "Implement src/server/mcp/auth/codes.ts"
Task: "Implement src/server/mcp/auth/password-page.ts"
Task: "Implement src/server/mcp/tools.ts factory"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (T001) → Phase 2 (T002–T003).
2. Phase 3 complete (T004–T015): failing tests first, then modules, routes, wiring.
3. **STOP and VALIDATE**: `npm test` green, scripted client connects through the gate and lists tools, unauthenticated calls refused. That alone is a deployable, password-gated MCP endpoint.

### Incremental Delivery

1. US1 → gate + connection proven (MVP).
2. US2 → read tools; the connector answers real questions.
3. US3 → capture tools; the connector is a working inbox.
4. US4 → lockout hardening for public-internet exposure.
5. US5 → revocation semantics proven (mostly test work — the design already carries it).
6. Polish → smoke checks, full gate, browser evidence, verifier confirmation.

Each story lands as its own commit group on `004-mcp-server`; the whole feature ships as one PR per the constitution's small-vertical-slice rule.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- Verify each test task fails before starting its implementation task; commit after each task or logical group (Conventional Commits).
- US2/US3/US4 all reuse the T006 helper — keep its IP-override and password-override options in mind when writing it.
- The six tools' exact error strings (`Task <id> not found`, `Person <id> not found`, `Title is required`, `Note text is required`) are contract-pinned — tests should assert them verbatim (contracts/mcp-tools.md).
- Claude Desktop connection is deliberately NOT automated anywhere above — it is Tyler's manual acceptance step (spec clarification, 2026-08-06).
