# Implementation Plan: web-mailbox-signin

**Branch**: `013-web-mailbox-signin` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-web-mailbox-signin/spec.md`

## Summary

Move Outlook mailbox sign-in from the CLI to a panel on the existing Email Sync page: a device-code Connect flow shown in the browser, a truthful three-state status readout (not configured / not connected / connected-as, verified by silent token acquisition), Disconnect, and a sweep replacing every CLI-referencing sign-in error with copy that points at the Sync page. Technically: extract a `MailboxAuth` interface from the existing MSAL `graph-auth.ts` (adding verify/sign-out/account-name — mechanics otherwise unchanged), add an in-memory single-attempt `MailboxConnectionManager`, expose three `/api/mailbox` endpoints all returning one `MailboxStatus` shape, and a polling `MailboxPanel.vue`. Automated checks run against a `FakeMailboxAuth` (test-injected, plus dev-only `MAIL_AUTH=fake|fake-decline` env modes for browser evidence, mirroring the established `MAIL_PROVIDER=fake` pattern); the CLI script survives as a headless fallback over the same token cache file. Full decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥22 (ESM throughout)

**Primary Dependencies**: Fastify 5 (API), @azure/msal-node 5.5 (device-code flow + token cache — already in use, no new mechanics), Vue 3.5 + Naive UI + vue-router (client), Vite 8 (dev server/proxy), zod (available for payload validation)

**Storage**: No DB changes. Persisted sign-in stays in the existing MSAL token cache file (`MAIL_TOKEN_CACHE_PATH`, default `./data/mail-token-cache.json`, 0600); pending sign-in attempt is server-memory only; fake auth persists a small JSON state file for restart-criteria tests

**Testing**: Vitest 4 (unit + integration over `buildApp` with injected `FakeMailboxAuth`; existing msal `vi.mock` pattern for graph-auth unit tests), @testing-library/vue for `MailboxPanel.vue`, `browser-tester` agent (Playwright MCP) against `npm run dev` with `MAIL_AUTH` fake modes for UI evidence

**Target Platform**: Self-hosted Docker (Linux server), single-user web app; dev on macOS worktrees with per-branch ports (013 → API 3013, UI 5113)

**Project Type**: Web application — one repo, `src/server` (Fastify + MCP) and `src/client` (Vue SPA) with a Vite `/api` proxy in dev

**Performance Goals**: Status endpoint responsive under panel polling (~1 req/3s, single user); silent token acquisition per status read is MSAL-local except when refresh is due — no measurable budget beyond SC-001's human-scale "under 2 minutes end-to-end"

**Constraints**: Sign-in mechanics frozen by spec (public client, device code, `Mail.Read`+`offline_access`, cache file location/format, Azure app registration untouched); at most one pending attempt, memory-only; automated checks must never contact real Microsoft; no new MCP tools (agents only see updated error text); CLI fallback must keep working

**Scale/Scope**: One user, one mailbox. ~1 new Vue component, 1 new route file (3 endpoints), 1 new service, 1 interface extraction over an existing module, 4 error-copy sites, ~5 new/extended test suites

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Spec is the source of truth | Tyler-approved PRD at `docs/product/features/web-mailbox-signin.md` (interview-resolved 2026-08-11) → `/speckit-specify` spec with passing quality checklist; this plan builds only what those specify | PASS |
| II. Test-first (non-negotiable) | Every slice starts red: unit (auth verify/sign-out, attempt lifecycle), integration (endpoints, restart persistence, error-copy sweep incl. inverting the existing `mail:signin` assertion), component (panel states). Simulated flow keeps tests hermetic | PASS |
| III. Evidence over assertion | quickstart.md maps every criterion to its surface: browser-tester evidence for panel scenarios, recorded automated-check output for restart/MCP/store criteria; verifier re-runs both | PASS |
| IV. Architecture constraints | TypeScript throughout; no new frameworks; MCP surface unchanged (error text only — spec's out-of-scope list forbids new connect/status tools); ingestion stays server-side; Docker target unaffected (same env vars, same cache file) | PASS |
| V. Small vertical slices, trunk via PR | Single feature branch `013-web-mailbox-signin` in its own worktree; lands as one PR via CI review; Conventional Commits | PASS |

**Post-design re-check (after Phase 1)**: No new violations. Design adds no dependencies, no schema, no MCP tools, no second MSAL client (one `PublicClientApplication` per process, shared by web flow and provider — research D1). Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-web-mailbox-signin/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── mailbox-api.md   # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── index.ts                                  # CHANGED: wire MailboxAuth + connection manager + MAIL_AUTH dev fakes into buildApp
├── app.ts                                    # CHANGED: decorate mailbox service; register mailbox routes
├── routes/
│   ├── mailbox.ts                            # NEW: GET /api/mailbox, POST /api/mailbox/connect, POST /api/mailbox/disconnect
│   └── email-sync.ts                         # (unchanged — error copy flows from services)
└── services/email/
    ├── graph-auth.ts                         # CHANGED: extract MailboxAuth interface; add verifyConnection/signOut/account-in-signIn; typed MailboxNotConnectedError; Sync-page error copy
    ├── fake-mailbox-auth.ts                  # NEW: scriptable fake (tests) + MAIL_AUTH=fake/fake-decline dev behavior, file-backed connected state
    ├── mailbox-connection.ts                 # NEW: MailboxConnectionManager — single pending SignInAttempt lifecycle
    ├── sync-coordinator.ts                   # CHANGED: not-connected/not-configured error copy (FR-010)
    └── graph-provider.ts                     # CHANGED: mid-sync 401/403 error copy (FR-010)

src/server/mcp/
└── tools.ts                                  # CHANGED: sync-emails failure hint points at Sync page (FR-010)

scripts/
└── mail-signin.ts                            # (kept working as headless fallback — FR-012; adjusts only if the auth factory signature moves)

src/client/
├── components/
│   └── MailboxPanel.vue                      # NEW: three-state panel, connect/disconnect, code+copy, status polling
└── pages/
    └── SyncPage.vue                          # CHANGED: render MailboxPanel above the sync form

tests/
├── unit/
│   ├── email-graph-auth.test.ts              # EXTENDED: verifyConnection reasons, signOut persistence, error taxonomy (msal mock)
│   ├── mailbox-connection.test.ts            # NEW: attempt lifecycle — idempotent connect, fail/retry, success clears, restart loses attempt
│   └── mailbox-panel.test.ts                 # NEW: component render per MailboxStatus state (@testing-library/vue)
└── integration/
    ├── mailbox-api.test.ts                   # NEW: endpoint contract, FR-004 resume, restart persistence over shared store file, 409/502 paths
    └── email-sync.test.ts                    # CHANGED: mail:signin assertion inverts — no recorded error may reference the CLI (SC-004)
```

**Structure Decision**: Existing single-repo web layout (`src/server` + `src/client`) — the feature is an additive vertical slice through it: one new service + route file server-side, one new component client-side, plus surgical edits to the four error-copy sites and the two wiring files (`index.ts`, `app.ts`). No new packages, directories beyond those listed, or build changes; dev ports and the Vite `/api` proxy already cover the new endpoints.

## Complexity Tracking

No constitution violations — table intentionally empty.
