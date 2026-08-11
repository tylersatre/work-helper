# Tasks: web-mailbox-signin

**Input**: Design documents from `/specs/013-web-mailbox-signin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mailbox-api.md, quickstart.md

**Tests**: Included and mandatory — the constitution's Principle II (test-first) applies to every slice: each implementation task is preceded by a task writing its failing tests, and code written before its failing test is discarded. Automated checks never contact real Microsoft — all sign-in scenarios run against `FakeMailboxAuth` / `MAIL_AUTH` fake modes (research.md D6).

**Organization**: Tasks are grouped by user story (US1 connect, US2 status, US3 failure/disconnect/error-copy) so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single repo web app per plan.md: server code in `src/server/`, client in `src/client/`, tests in `tests/unit/` and `tests/integration/`. Dev ports for this branch: API 3013, UI 5113.

---

## Phase 1: Setup

**Purpose**: Confirm the worktree is a clean baseline before any red test is written. No project scaffolding is needed — the feature is an additive slice through the existing app.

- [X] T001 Confirm dependencies are installed (`npm install` if the SessionStart hook has not run) and the baseline gate is green: `npm run lint && npm run typecheck && npm test` from the repo root — any pre-existing failure is surfaced now, not attributed to this feature later

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `MailboxAuth` seam every story depends on — interface extraction over the real MSAL auth, the scriptable fake, and the injection/dev-mode wiring. No user story work can begin until this phase is complete.

**TDD note**: T003 is production code and follows red-first via T002. T004 (`FakeMailboxAuth`) and T005 (wiring) are test infrastructure — they exist to make the Phase 3+ red tests writable and are validated by T006/T007 exercising them; they are the deliberate exception to the red-first ordering, not a violation of it.

- [X] T002 Write failing unit tests for the `MailboxAuth` extensions in `tests/unit/email-graph-auth.test.ts` (extend the existing msal `vi.mock` pattern): `verifyConnection()` returns `{ connected: true, account }` when silent acquisition succeeds; `{ connected: false, reason: 'never-signed-in' }` when no account is cached; `{ connected: false, reason: 'expired', detail }` carrying the MSAL error message when an account exists but silent acquisition fails; `signOut()` calls `getTokenCache().removeAccount` so the cache plugin persists the removal; `beginSignIn(onCode)` invokes the callback with `verificationUri`/`userCode`/`expiresAt` and resolves `{ account }` from `AuthenticationResult.account.username`; `getAccessToken()` throws a typed `MailboxNotConnectedError` carrying the same reason/detail instead of today's swallowed catch-all — run the suite and confirm these tests fail
- [X] T003 Implement the `MailboxAuth` interface in `src/server/services/email/graph-auth.ts`: export the interface and `ConnectionVerification` type per data-model.md, add `MailboxNotConnectedError` (with `reason`/`detail` fields and a message directing to the Sync page), implement `verifyConnection`/`signOut`, extend `beginSignIn` to resolve the account username, rework `getAccessToken` to throw the typed error; keep the MSAL mechanics (public client, scopes, cache file) byte-for-byte unchanged — T002 goes green
- [X] T004 Implement `FakeMailboxAuth` in `src/server/services/email/fake-mailbox-auth.ts`: implements `MailboxAuth`; scriptable per test (resolve a device code, then succeed as a named account / fail with a provider error / stay pending); persists the connected flag + account to a small JSON state file (path injectable) so restart criteria are testable by building a second instance over the same file; supports dev modes — `MAIL_AUTH=fake` auto-completes a begun sign-in as `tyler@example.com` after ~2s, `MAIL_AUTH=fake-decline` fails it after ~2s with an AADSTS-style decline message (research.md D6)
- [X] T005 Wire the seam: `src/server/app.ts` — `buildApp` accepts an injected `MailboxAuth` (test path) and decorates it on the app; `src/server/index.ts` — resolve `MAIL_AUTH=fake|fake-decline` to a `FakeMailboxAuth` with state file under `./data/`, guarded dev-only exactly like `resolveDevMailProvider`, real `createGraphAuth` otherwise; one `PublicClientApplication` per process shared by web flow and `GraphMailProvider` (research.md D1)

**Checkpoint**: `MailboxAuth` seam exists with real + fake implementations, injectable into `buildApp` — user story phases can begin

---

## Phase 3: User Story 1 - Connect the mailbox from the browser (Priority: P1) 🎯 MVP

**Goal**: From a configured-but-never-signed-in server, Tyler clicks Connect on the Sync page, sees the Microsoft verification link + code in the browser, and the panel flips to "Connected as tyler@example.com" without a reload. Connection persists across restarts; a pending attempt is resumed, never duplicated.

**Independent Test**: With `MAIL_AUTH=fake MAIL_PROVIDER=fake npm run dev` and no fake-store file, complete a simulated device-code sign-in entirely through the Sync page and watch the panel reach the connected state (quickstart.md scenarios US1-1..5).

### Tests for User Story 1 (write first, confirm they FAIL)

- [X] T006 [P] [US1] Write failing unit tests for the attempt lifecycle in `tests/unit/mailbox-connection.test.ts`: `connect()` starts a device-code flow and returns a pending `SignInAttempt` with `verificationUri`/`userCode`/`expiresAt` captured from the `onCode` callback; a second `connect()` while pending returns the same attempt and code without calling `beginSignIn` again (FR-004); when the underlying sign-in resolves, the attempt is cleared (connected truth then comes from `verifyConnection`, never from the attempt — data-model.md invariant); when it rejects, the attempt becomes `failed` with the provider's error and is kept; `connect()` after failure starts a fresh attempt; a new manager instance has no attempt (restart edge case); near-expiry race — when the underlying sign-in resolves successfully even at the last moment before code expiry, the attempt is cleared, never left `failed` (the panel then reports whatever `verifyConnection` says, so panel and store can never disagree — spec edge case)
- [X] T007 [P] [US1] Write failing integration tests in `tests/integration/mailbox-api.test.ts` over `buildApp` with an injected `FakeMailboxAuth`: `GET /api/mailbox` on a configured, never-signed-in app returns `{ state: 'not-connected', reason: 'never-signed-in' }`; `POST /api/mailbox/connect` returns 200 with `attempt.status: 'pending'`, `verificationUri`, `userCode` (FR-003); a second connect (same app or after re-`buildApp`-free reload semantics) returns the identical `userCode` (FR-004); after the fake completes the sign-in, `GET /api/mailbox` returns `{ state: 'connected', account: 'tyler@example.com' }` (FR-005/FR-007); restart persistence — a second `buildApp` over the same fake state file still reports connected (FR-008); connect while already connected returns the connected status without starting an attempt (contract)
- [X] T008 [P] [US1] Write failing component tests in `tests/unit/mailbox-panel.test.ts` (@testing-library/vue): given a `not-connected` (idle) status the panel renders "Not connected" and a Connect button (`mailbox-not-connected`, `mailbox-connect`); given a pending attempt it renders the verification link with `target="_blank"` (`mailbox-verification-link`), the user code (`mailbox-code`), a copy control (`mailbox-copy-code`) and a waiting indicator (`mailbox-pending`); given `connected` it renders "Connected as tyler@example.com" (`mailbox-connected`); clicking Connect calls `POST /api/mailbox/connect`; while pending the panel polls `GET /api/mailbox` (~3s) and re-renders on state change (FR-005); plus one page-level assertion that `SyncPage.vue` mounts `MailboxPanel` above the sync form (turned green by T012)

### Implementation for User Story 1

- [X] T009 [US1] Implement `MailboxConnectionManager` in `src/server/services/email/mailbox-connection.ts`: singleton over an injected `MailboxAuth`, at most one `SignInAttempt` (data-model.md state table) — idempotent `connect()` awaiting the `onCode` callback via a promise, success clears the attempt, failure keeps it with the provider error, memory-only — T006 goes green
- [X] T010 [US1] Implement `GET /api/mailbox` and `POST /api/mailbox/connect` in new `src/server/routes/mailbox.ts` returning the `MailboxStatus` payload per contracts/mailbox-api.md (status performs `verifyConnection()` per call; connect ensures-pending then returns status); decorate `MailboxConnectionManager` and register the routes in `src/server/app.ts` — T007's US1 tests go green
- [X] T011 [US1] Implement `src/client/components/MailboxPanel.vue`: renders exactly one state from `MailboxStatus` (FR-001) using Naive UI primitives; Connect action, verification link (`target="_blank" rel="noreferrer"`), user code with `navigator.clipboard` copy control, waiting indicator; fetches status on mount and polls every ~3s while an attempt is pending; `data-testid` anchors per the contracts UI table — T008 goes green
- [X] T012 [US1] Render `MailboxPanel` at the top of `src/client/pages/SyncPage.vue` above the sync form, leaving the page's existing sync-run logic untouched — T008's page-level mount assertion goes green
- [X] T013 [US1] Capture browser evidence for US1 with the `browser-tester` agent against `MAIL_AUTH=fake MAIL_PROVIDER=fake npm run dev` (UI at `http://localhost:5113/`) into `docs/evidence/013-web-mailbox-signin/`: not-connected panel with Connect (US1-1), click Connect → link + code + copy control + waiting indicator without reload (US1-2), reload + Connect again → same code (US1-5), panel flips to "Connected as tyler@example.com" without reload (US1-3); record the T007 restart-persistence test output as the FR-008 evidence (API-surface criterion)

**Checkpoint**: The full connect journey works in a real browser against the simulated flow — MVP deliverable

---

## Phase 4: User Story 2 - See true connection state at a glance (Priority: P2)

**Goal**: The panel always shows the truth: not configured (naming the missing settings, no Connect button), not connected, or connected as the account — where "connected" is proven by a silent token acquisition at status time, so a present-but-dead sign-in never reads as connected.

**Independent Test**: Seed each of the three states (no `MS_*` env; configured never-signed-in; connected; plus dead sign-in) and confirm the panel renders the matching readout (quickstart.md scenarios US2-1..3, SC-003).

### Tests for User Story 2 (write first, confirm they FAIL)

- [X] T014 [P] [US2] Extend `tests/integration/mailbox-api.test.ts` with failing US2 tests: `GET /api/mailbox` on an unconfigured app returns `{ state: 'not-configured', missing: [...] }` naming exactly the unset settings (FR-002); `POST /api/mailbox/connect` on an unconfigured app returns 409 with the app-wide error envelope (contract); a fake seeded with a dead/expired sign-in returns `{ state: 'not-connected', reason: 'expired', detail }` — never `connected` (FR-007, FR-011, SC-003); a fake seeded connected returns `{ state: 'connected', account }`; last-completed-sign-in-wins — mutating the fake store to connected after the app is already running (simulating the legacy CLI signing in out-of-band) makes the next `GET /api/mailbox` report connected, since status is derived from the store per call (spec edge case)
- [X] T015 [P] [US2] Extend `tests/unit/mailbox-panel.test.ts` with failing US2 tests: given `not-configured` the panel names the missing settings and renders no Connect button (`mailbox-not-configured`, FR-002); given `connected` it renders a Disconnect button (`mailbox-disconnect`, US2-2); given `not-connected` with `reason: 'expired'` it renders the not-connected readout, never a connected one (US2-3)

### Implementation for User Story 2

- [X] T016 [US2] Implement configuration detection in `src/server/routes/mailbox.ts` (with whatever helper it needs in `src/server/services/email/graph-auth.ts` / `src/server/index.ts` wiring): status returns `not-configured` with the concrete missing env names (`MS_CLIENT_ID`, `MS_TENANT_ID`; dev fakes count as configured via `MAIL_AUTH`), connect returns the 409 envelope when not configured — T014 goes green
- [X] T017 [US2] Extend `src/client/components/MailboxPanel.vue`: `not-configured` state rendering the missing setting names with no Connect action, and the Disconnect button in the connected state (action itself lands in US3) — T015 goes green
- [X] T018 [US2] Capture browser evidence for US2 with the `browser-tester` agent into `docs/evidence/013-web-mailbox-signin/`: server with no `MS_*`/`MAIL_AUTH` vars → panel names the missing settings and offers no Connect (US2-1); fake store pre-seeded connected → "Connected as tyler@example.com" + Disconnect button (US2-2); fake store seeded with a dead sign-in → panel shows not connected (US2-3)

**Checkpoint**: All three states render truthfully; SC-003's seeded states all agree with sync reachability

---

## Phase 5: User Story 3 - Recover from failure and disconnect (Priority: P3)

**Goal**: Declined/expired attempts surface Microsoft's error and offer Connect again; Disconnect removes the stored account durably; every sign-in-related sync error (web and MCP) points at the Sync page and no user-facing error references the CLI; the CLI script survives as a headless fallback.

**Independent Test**: Run the fake-decline flow through the panel, disconnect a connected mailbox, and grep/exercise every error surface for CLI mentions (quickstart.md US3 scenarios, SC-004).

### Tests for User Story 3 (write first, confirm they FAIL)

- [X] T019 [P] [US3] Extend `tests/integration/mailbox-api.test.ts` with failing US3 tests: when the fake declines/expires the attempt, `GET /api/mailbox` returns `attempt: { status: 'failed', error: <provider text> }` and a subsequent connect starts a fresh attempt with a new code (FR-006); `POST /api/mailbox/disconnect` returns 200 `{ state: 'not-connected', reason: 'never-signed-in' }`, clears any failed attempt, is idempotent, the removal survives a second `buildApp` over the same state file (FR-009), and on an unconfigured app it returns 409 with the app-wide error envelope (contract parity with connect); connect returns 502 with the provider's message when the device-code request itself is rejected (wrong-tenant edge case), retaining no attempt; sync triggered while an attempt is pending fails with the connect-the-mailbox message and leaves the attempt pending (edge case)
- [X] T020 [P] [US3] Extend `tests/unit/mailbox-panel.test.ts` with failing US3 tests: given a failed attempt the panel shows Microsoft's error (`mailbox-error`) and offers Connect again (`mailbox-connect`, FR-006); clicking Disconnect calls `POST /api/mailbox/disconnect` and the panel renders the returned not-connected status (US3-2)
- [X] T021 [P] [US3] Write failing error-copy tests (FR-010/FR-011/SC-004): in `tests/integration/email-sync.test.ts`, invert the existing `mail:signin` assertion (around line 314) — no recorded sync-run error may match `/mail:signin/` or otherwise reference the CLI, and sync attempted while never-signed-in vs expired records the two distinguishable Sync-page messages from contracts/mailbox-api.md; in the MCP tools' existing test suite, assert the `sync-emails` failure hint directs to the Sync page with no CLI mention
- [X] T022 [P] [US3] Extend `tests/unit/email-graph-auth.test.ts` with a failing test that the 401/403 mid-sync path in `src/server/services/email/graph-provider.ts` (or its provider-level suite if one exists — follow the existing test placement for graph-provider) surfaces the reconnect-on-Sync-page copy with no CLI mention (FR-010 mid-sync site)

### Implementation for User Story 3

- [X] T023 [US3] Implement `POST /api/mailbox/disconnect` in `src/server/routes/mailbox.ts`: `signOut()` on the store, clear any failed attempt in `MailboxConnectionManager`, return status; plus the 502 device-code-rejected path on connect — T019 goes green
- [X] T024 [US3] Extend `src/client/components/MailboxPanel.vue`: failed-attempt state (provider error + Connect again) and the Disconnect action wiring — T020 goes green
- [X] T025 [US3] Sweep the four CLI-referencing error sites to Sync-page copy per contracts/mailbox-api.md table (exact wording Tyler-adjustable at acceptance): `SIGN_IN_ERROR` in `src/server/services/email/graph-auth.ts`, the undefined-provider message in `src/server/services/email/sync-coordinator.ts`, the mid-sync 401/403 message in `src/server/services/email/graph-provider.ts`, the reconnect hint in `src/server/mcp/tools.ts` — never-signed-in vs expired stay distinguishable via `MailboxNotConnectedError`'s reason — T021 and T022 go green
- [X] T026 [US3] Verify `scripts/mail-signin.ts` still compiles and signs in against the same token cache (FR-012), adjusting only for the moved auth factory signature if needed; its own stdout is exempt from the CLI-mention sweep
- [X] T027 [US3] Capture browser evidence for US3 with the `browser-tester` agent into `docs/evidence/013-web-mailbox-signin/`: `MAIL_AUTH=fake-decline` → Connect → panel shows Microsoft's error and offers Connect again (US3-1); pre-seeded connected → Disconnect → "Not connected" (US3-2); configured-but-not-connected → trigger a sync from the page → recorded error directs to the Sync page with no CLI mention (US3-3); record T019's disconnect-restart and T021's MCP-hint test output as the FR-009/FR-010 API-surface evidence

**Checkpoint**: Full lifecycle — connect, status, failure, disconnect — plus the error-copy sweep, all evidenced

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The definition-of-done gate across all stories.

- [X] T028 Run the full verification gate from the repo root and record the output: `npm run lint && npm run typecheck && npm test && npm run build`
- [X] T029 Run the `verifier` agent per quickstart.md's definition-of-done gate: re-run the automated checks independently and cross-check every acceptance criterion (US1-1..5, US2-1..3, US3-1..4, FR-001..012, SC-001..004) against the evidence in `docs/evidence/013-web-mailbox-signin/`; fix any gap it finds and re-verify

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on T001 — BLOCKS all user stories. Internal order: T002 (red) → T003 (green) → T004 → T005
- **US1 (Phase 3)**: Depends on Phase 2. Internal order: T006/T007/T008 in parallel (red) → T009 → T010 → T011 → T012 → T013
- **US2 (Phase 4)**: Depends on Phase 2; extends files created in US1 (routes, panel, api tests), so runs after US1 in a single-session flow. Internal order: T014/T015 in parallel (red) → T016 → T017 → T018
- **US3 (Phase 5)**: Depends on Phase 2; extends US1/US2 files. Internal order: T019/T020/T021/T022 in parallel (red) → T023 → T024 → T025 → T026 → T027
- **Polish (Phase 6)**: Depends on all story phases. T028 → T029

### Story Independence Notes

Each story is independently *testable* (its own seeded states and evidence scenarios), but US2 and US3 extend files US1 creates (`routes/mailbox.ts`, `MailboxPanel.vue`, `mailbox-api.test.ts`), so the practical execution order is strictly US1 → US2 → US3. Stopping after any checkpoint leaves a shippable increment.

### Parallel Opportunities

- T006, T007, T008 (US1 red tests — three different test files)
- T014, T015 (US2 red tests — two different test files)
- T019, T020, T021, T022 (US3 red tests — four different test files)

## Parallel Example: User Story 1

```bash
# Write all US1 failing tests together (three different files, no shared state):
Task: "Failing unit tests for attempt lifecycle in tests/unit/mailbox-connection.test.ts"
Task: "Failing integration tests for /api/mailbox endpoints in tests/integration/mailbox-api.test.ts"
Task: "Failing component tests for MailboxPanel states in tests/unit/mailbox-panel.test.ts"
# Then implement sequentially: T009 (manager) → T010 (routes) → T011 (panel) → T012 (page)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline) + Phase 2 (MailboxAuth seam) — the only blocking work
2. Phase 3 (US1): red tests → manager → routes → panel → page → browser evidence
3. **STOP and VALIDATE**: the connect journey works end-to-end in a browser against the simulated flow; this alone removes the CLI friction that motivated the feature

### Incremental Delivery

1. Setup + Foundational → seam ready
2. US1 → connect works in the browser (MVP)
3. US2 → truthful three-state readout incl. not-configured and dead-sign-in truth
4. US3 → failure recovery, disconnect, error-copy sweep, CLI fallback intact
5. Polish → full gate + verifier before the PR

---

## Notes

- Every implementation task cites the test task it turns green — run the tests before implementing and confirm they fail (red → green, constitution Principle II)
- Browser evidence tasks (T013, T018, T027) use the `MAIL_AUTH` fake modes only; Tyler's real-Microsoft acceptance pass happens after the PR, per quickstart.md
- Restart-persistence and MCP-surface criteria are evidenced by recorded automated-check output, not browser screenshots (constitution Principle III's surface-appropriate evidence)
- FR-008's automated evidence is a deliberate pairing: T007's restart test proves persistence semantics over the fake store, and T002's msal-mock tests prove the real implementation delegates to the MSAL cache plugin; real-store restart is additionally exercised in Tyler's manual acceptance pass (quickstart step 3) — the verifier (T029) cites both automated pieces together
- Commit after each task or logical red→green pair, Conventional Commits throughout
