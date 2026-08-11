# Research: web-mailbox-signin

**Feature**: `013-web-mailbox-signin` | **Date**: 2026-08-11

All unknowns were resolvable from the existing codebase, the product spec's interview record, and the installed dependency set. No external research agents were needed; the one externally-sourced item (MSAL API surface) is recorded with its verification path.

## D1: Mailbox auth abstraction — extract a `MailboxAuth` interface from `graph-auth.ts`

**Decision**: Extend the existing `GraphAuth` object (src/server/services/email/graph-auth.ts) into a `MailboxAuth` interface with four capabilities: `getAccessToken()` (unchanged consumer path for `GraphMailProvider`), `verifyConnection()` (status-time truth: silent token acquisition returning `{ connected: true, account }` or `{ connected: false, reason: 'never-signed-in' | 'expired', detail? }`), `beginSignIn(onCode)` (existing device-code flow, now also resolving the signed-in account's username), and `signOut()` (remove the cached account, persisting the removal through the existing file cache plugin). The real implementation stays in `createGraphAuth`; a `FakeMailboxAuth` implements the same interface for tests and dev browser evidence (D6).

**Rationale**: The spec pins the sign-in mechanics as unchanged (same MSAL public client, scopes, token cache file) — so the feature is new orchestration around the existing auth object, not a new auth path. An interface boundary is what lets automated checks run against a simulated flow (spec assumption) while the CLI script and Graph provider keep using the same real object (FR-012, FR-008).

**Alternatives considered**: A separate new "web auth" service duplicating MSAL setup — rejected: two `PublicClientApplication` instances over one cache file re-introduces the cache-freshness problem the index.ts hoisting comment warns about, and risks the CLI and web flows drifting apart when the spec demands they share one store.

## D2: Pending sign-in attempt — in-memory singleton manager

**Decision**: A `MailboxConnectionManager` service (new, `src/server/services/email/mailbox-connection.ts`), decorated onto the Fastify app like `syncCoordinator`, owns at most one `SignInAttempt`. `connect()` is idempotent: if an attempt is pending it returns that same attempt (FR-004); otherwise it calls `auth.beginSignIn`, captures `{ verificationUri, userCode, expiresAt }` from the device-code callback (the HTTP request awaits a promise resolved by that callback), and lets the long-running acquire promise settle the attempt to succeeded (cleared — connected state then comes from `verifyConnection`) or failed (kept, with the provider's error, until the next `connect()` replaces it). Nothing is persisted; a restart drops the attempt, matching the spec's edge case ("fresh code, not a stale one").

**Rationale**: The spec explicitly scopes the attempt to server memory (Assumptions; Key Entities: "does not survive a server restart"). A singleton mirrors the existing `SyncCoordinator` single-flight pattern already in the codebase. Clearing the succeeded attempt and re-deriving "connected" from the store resolves the code-expiry race edge case by construction: the panel only ever reports what verification against the store says.

**Alternatives considered**: Persisting attempts to SQLite — rejected: spec says memory-only is acceptable and the restart edge case is specified around that. Storing the outcome separately from verification — rejected: creates exactly the "panel says failed but mailbox is connected" divergence the edge case forbids.

## D3: Live panel update without reload — client-side polling of the status endpoint

**Decision**: The panel polls `GET /api/mailbox` (every ~3s) while an attempt is pending, and once on page load. No SSE, no WebSocket.

**Rationale**: The device-code flow is itself server-side polling against Microsoft, so sub-second latency is meaningless; this is a single-user app; and the codebase has no push infrastructure to reuse. Polling satisfies every "without a page reload" criterion (FR-005, US1-3) with zero new moving parts.

**Alternatives considered**: SSE — rejected as new infrastructure (and a second code path to keep alive through the Vite dev proxy) for no observable UX gain at one user. Long-polling the connect request itself until completion — rejected: device codes live ~15 minutes, far beyond sane HTTP timeouts, and it breaks the reload-resume scenario (US1-5).

## D4: Truthful status + distinguishable failure detail — typed not-connected reasons

**Decision**: `verifyConnection()` distinguishes: no cached account → `reason: 'never-signed-in'`; cached account but silent acquisition fails → `reason: 'expired'` with the underlying MSAL error message as `detail`. `getAccessToken()` stops swallowing errors (today's catch-all at graph-auth.ts:65) and throws a typed `MailboxNotConnectedError` carrying the same reason/detail, so sync-run errors satisfy FR-011. "Connected" is only ever asserted after a successful silent acquisition at status time (FR-007).

**Rationale**: FR-007 defines connected as "sync would work right now", which is precisely what `acquireTokenSilent` proves (it exercises the refresh token). FR-011 and US3-4 require never-signed-in vs expired to be distinguishable — impossible while the current code collapses both into one string.

**Alternatives considered**: Cheap status (account-present check only) with a deep-check option — rejected: directly violates FR-007's "present-but-dead never reads as connected". Caching verification results — rejected: single user, one silent call per status poll is well within MSAL's local-cache fast path (network only when the access token needs refreshing).

## D5: Error-copy sweep — all sign-in errors point at the Sync page

**Decision**: Replace every CLI-referencing user-facing string: `SIGN_IN_ERROR` in graph-auth.ts:6, the undefined-provider message in sync-coordinator.ts:55, the 401/403 mid-sync message in graph-provider.ts:137, and the reconnect hint in mcp/tools.ts:218. New copy directs to connecting the mailbox on the Sync page and includes the reason taxonomy from D4 (exact wording is Tyler-adjustable at acceptance per the product spec). The CLI script `scripts/mail-signin.ts` itself keeps working unchanged as the headless fallback (FR-012) — it may still mention the CLI in its own stdout, since that is the CLI.

**Rationale**: FR-010/SC-004 are absolute ("zero user-facing error messages... reference the CLI"). The grep sweep above is the complete current inventory (verified: those four sites plus one test assertion are the only `mail:signin` references in src/tests).

**Alternatives considered**: None substantive — this is mandated directly by the spec.

## D6: Simulated device-code flow for automated checks and browser evidence

**Decision**: Two layers, mirroring the existing `MAIL_PROVIDER=fake` pattern. (1) Unit/integration tests inject a `FakeMailboxAuth` directly into `buildApp` — scriptable per test: resolve a code, then succeed as a named account / fail with a provider error / stay pending, with connected-state persisted to a temp JSON file so "survives restart" is tested by building a second app instance over the same file. (2) For dev servers and `browser-tester` evidence, a dev-only `MAIL_AUTH` env (never in production, same guard as `resolveDevMailProvider`): `MAIL_AUTH=fake` auto-completes a begun sign-in as `tyler@example.com` after ~2 seconds (long enough for the browser to observe the pending panel, short enough for evidence runs) and persists the connected flag to a state file under `./data/`; `MAIL_AUTH=fake-decline` fails the attempt after ~2 seconds with an AADSTS-style decline message. Not-configured state is exercised by simply omitting `MS_CLIENT_ID`/`MS_TENANT_ID` and `MAIL_AUTH`.

**Rationale**: The spec mandates automated checks never talk to real Microsoft. The codebase already established the env-switched-fake pattern for exactly this purpose (index.ts `resolveDevMailProvider`, dev-seed messages) — reusing it keeps one convention. File-backed fake persistence makes the restart criteria (FR-008, FR-009) checkable at both integration and browser level.

**Alternatives considered**: A dev-only control endpoint to trigger outcomes from the browser test — rejected: adds HTTP surface that exists only for tests, and timing-based fakes cover the scenarios deterministically enough (the browser test polls for the end state, it does not race the 2s timer). Mocking MSAL at module level in integration tests — rejected for integration scope (kept only where it already exists, in graph-auth unit tests): the interface seam from D1 is cleaner than `vi.mock` across process boundaries.

## D7: API shape — one status payload, three endpoints

**Decision**: New route file `src/server/routes/mailbox.ts`: `GET /api/mailbox` (status), `POST /api/mailbox/connect`, `POST /api/mailbox/disconnect`. All three return the same `MailboxStatus` payload (contracts/mailbox-api.md): connect ensures an attempt is pending first (starting one only if none is), disconnect removes the account first. Connect on an unconfigured mailbox is a 409; connect while connected returns the connected status without starting an attempt; disconnect is idempotent.

**Rationale**: One payload shape makes the client trivial (every interaction is "render latest status") and makes FR-004's resume-on-reconnect the natural behavior of connect rather than special-case logic. Matches the existing routes' error envelope (`{ error: { message } }`).

**Alternatives considered**: `DELETE /api/mailbox` for disconnect — rejected: the action verb form matches how the panel names the action and keeps all mailbox operations POSTs with uniform bodies. Returning only the attempt from connect — rejected: forces the client to merge two shapes.

## D8: UI placement — `MailboxPanel.vue` component on the existing Sync page

**Decision**: New `src/client/components/MailboxPanel.vue` rendered at the top of `SyncPage.vue`, using the Naive UI primitives already in the page (NButton etc.), `data-testid` hooks per state for the browser-tester, `navigator.clipboard` for the code copy control, and `target="_blank" rel="noreferrer"` for the verification link. Component-level tests use the already-installed `@testing-library/vue`.

**Rationale**: Spec assumption: the panel lives on the existing Email Sync page, no new navigation. The component boundary keeps SyncPage's sync-run logic untouched (small vertical slice) and gives the browser-tester stable selectors, consistent with the page's existing `data-testid` convention.

**Alternatives considered**: Inlining into SyncPage.vue — rejected: the page already carries the sync-form logic; a separate component keeps both testable in isolation.

## MSAL API facts relied on (verification note)

From @azure/msal-node 5.x (already a dependency; typings not greppable in this worktree because node_modules is not yet installed — the SessionStart install will restore it): `AuthenticationResult.account.username` carries the signed-in UPN; `pca.getTokenCache().removeAccount(account)` removes the account and fires the cache plugin's `afterCacheAccess` with `cacheHasChanged`, persisting the removal to the cache file (FR-009's restart survival); the device-code callback's `DeviceCodeResponse` includes `userCode`, `verificationUri`, `expiresIn` (seconds — source for the attempt's `expiresAt`) and `message`. These are stable public APIs; the first failing unit tests against the msal mock (extending the existing pattern in tests/unit/email-graph-auth.test.ts) plus Tyler's real-Microsoft acceptance pass confirm them, and any mismatch surfaces at red-test time, not in review.
