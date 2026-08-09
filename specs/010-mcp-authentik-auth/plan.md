# Implementation Plan: MCP Authentik Auth

**Branch**: `010-mcp-authentik-auth` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-mcp-authentik-auth/spec.md`

## Summary

Replace the shared-connector-password step of the MCP OAuth flow with Authentik-fronted sign-in. `/oauth/authorize` moves behind the Authentik proxy outpost (the deployment's unauthenticated-path carve-outs narrow from `^/oauth/` to just `^/oauth/register` and `^/oauth/token`), and the app verifies the outpost's forwarded `X-authentik-jwt` assertion by presenting it as a Bearer token to the deployment's Authentik userinfo endpoint (`AUTHENTIK_USERINFO_URL`) — only tokens genuinely minted by that Authentik instance pass, so forged/missing/expired assertions are rejected fail-closed (research decision R1: JWKS verification is impossible for authentik proxy providers, which hard-code `signing_key = None`). A verified visitor sees an approval page naming their Authentik username; approving redeems a one-time server-side approval ticket and issues the single-use authorization code, while declining or abandoning issues nothing. The existing token machinery (scrypt-derived HMAC key, `whmcp_` tokens, PKCE, dynamic client registration) is unchanged except its key material moves from `CONNECTOR_PASSWORD` to a new required `MCP_TOKEN_SECRET`, preserving the survive-restart / rotate-to-revoke story. The password page, `CONNECTOR_PASSWORD`, and the per-IP lockout are deleted end to end, and `docs/deploy.md` is updated to match.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js >= 22, ESM throughout

**Primary Dependencies**: Fastify 5 (`trustProxy: true` already set), `@modelcontextprotocol/sdk` ^1.30, drizzle-orm + better-sqlite3, zod 4. **No new dependencies**: identity verification is a `fetch` call to Authentik's userinfo endpoint, not local JWT cryptography, so no JWT/JWKS library is needed.

**Storage**: SQLite via drizzle (`oauth_clients` table, unchanged — no schema changes in this feature). In-memory TTL stores for authorization codes (existing, unchanged) and approval tickets (new, same pattern as `codes.ts`).

**Testing**: Vitest 4 — unit tests (`tests/unit`), integration tests against an in-process Fastify app plus a local stub identity-provider HTTP server that mimics Authentik's userinfo endpoint (`tests/integration`), and the docker-compose deploy suite (`npm run test:deploy`, `tests/deploy` harness). Browser evidence via the `browser-tester` agent driving the dev server through a new local outpost simulator (`scripts/outpost-sim.ts`) that injects `X-authentik-jwt` the way the real outpost does. Real-Authentik end-to-end is Tyler's manual acceptance step (spec assumption).

**Target Platform**: Self-hosted Docker (Linux container) behind Caddy → Authentik embedded outpost in Proxy mode, per `docs/deploy.md`.

**Project Type**: Single-project web app + MCP server (`src/server`, `src/client`); this feature touches only the server, scripts, tests, and docs.

**Performance Goals**: The authorize step adds at most two userinfo round-trips per connection attempt (one on GET, one on approval POST) over the local Docker network — negligible against SC-001's 2-minute connect budget. No change to `/mcp` request handling.

**Constraints**: Fail closed everywhere — no identity assertion, unverifiable assertion, or unconfigured verifier must ever fall back to a password prompt or issue a grant (FR-004). Programmatic endpoints (`/oauth/register`, `/oauth/token`, `/mcp`, `/.well-known/*`) must remain reachable without a browser session (FR-005). Tokens must remain valid across restarts under an unchanged `MCP_TOKEN_SECRET` and all be invalidated by rotating it (FR-006/007). No new npm dependencies.

**Scale/Scope**: Single user (Tyler), a handful of connected MCP clients. ~10 server source files touched (5 changed, 3 added, 2 deleted), 1 new dev script, ~10 test files touched, plus `compose.yaml`, `.env.example`, and `docs/deploy.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec Is the Source of Truth** — PASS. `spec.md` exists with Tyler-authored acceptance criteria derived from `docs/product/features/mcp-authentik-auth.md`; this plan implements exactly that scope.
- **II. Test-First (NON-NEGOTIABLE)** — PASS. The design gives every behavior a test seam that lets a failing test exist before code: the identity verifier is exercised against a stub userinfo server (no Authentik required), approval tickets and pages are pure in-process units, and the connect flow is drivable end to end via the existing `tests/integration/helpers/oauth-client.ts` pattern with forwarded-identity headers. `/speckit-tasks` will order red → green per slice.
- **III. Definition of Done: Evidence Over Assertion** — PASS. Browser-surface criteria (approval page naming the username, decline path, clear error on missing assertion) get `browser-tester` evidence via the outpost simulator; headless criteria (forged-assertion rejection, restart persistence, secret rotation, no-`CONNECTOR_PASSWORD` startup) get recorded automated-check output from the integration and deploy suites; the `verifier` agent independently re-runs both. The one thing automation cannot cover — real Authentik in the loop — is explicitly Tyler's manual acceptance step per the spec's Assumptions, with `docs/deploy.md` as the script for it.
- **IV. Architecture Constraints** — PASS. TypeScript throughout; MCP server stays on the official `@modelcontextprotocol/sdk`; deployment stays self-hosted Docker; email ingestion untouched. No new frameworks or dependencies at all.
- **V. Small Vertical Slices, Trunk via PR** — PASS. One feature branch, lands via PR with Conventional Commits.
- **Data & migrations (development phase)** — PASS trivially: no schema changes. The cutover revoking previously connected password-flow clients is acceptable per the spec's edge cases (development phase, no real data).

**Post-Phase-1 re-check**: PASS — the design added no projects, no dependencies, no schema changes, and no deviations needing Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/010-mcp-authentik-auth/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── oauth-http.md
│   ├── identity-verification.md
│   └── config.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── app.ts                        # CHANGED: drop connectorPassword option; take mcpTokenSecret + identityVerifier; keep mcpKey gate
├── env.ts                        # CHANGED: production now requires MCP_TOKEN_SECRET and AUTHENTIK_USERINFO_URL (CONNECTOR_PASSWORD check removed)
├── index.ts                      # CHANGED: wire the two new env vars into buildApp; build the userinfo-backed verifier
└── mcp/
    ├── http.ts                   # CHANGED: sendUnconfigured message no longer names CONNECTOR_PASSWORD
    ├── routes.ts                 # unchanged (bearer gate on /mcp)
    └── auth/
        ├── clients.ts            # unchanged (dynamic client registration)
        ├── codes.ts              # unchanged (single-use 60s authorization codes)
        ├── tokens.ts             # unchanged (scrypt deriveKey + HMAC mint/verify; key source renamed at call sites)
        ├── identity.ts           # NEW: IdentityVerifier — presents X-authentik-jwt to the configured userinfo endpoint
        ├── approval-tickets.ts   # NEW: one-time TTL approval-ticket store binding authorize GET → approval POST
        ├── approval-page.ts      # NEW: renders approval page (username, approve/deny) + rejection/error pages
        ├── oauth-routes.ts       # CHANGED: authorize GET/POST rewritten around identity + tickets; register/token/discovery untouched
        ├── password-page.ts      # DELETED (FR-008)
        └── lockout.ts            # DELETED (FR-008)

scripts/
└── outpost-sim.ts                # NEW: dev-only simulated Authentik — stub userinfo endpoint + reverse proxy that injects X-authentik-jwt (browser evidence + local dev)

tests/
├── unit/
│   ├── mcp-identity.test.ts          # NEW: verifier vs stub userinfo (valid/forged/expired/timeout/missing-claim)
│   ├── mcp-approval-tickets.test.ts  # NEW: single-use, TTL expiry, param binding
│   ├── mcp-approval-page.test.ts     # NEW: username rendering, escaping, approve/deny forms (replaces mcp-password-page.test.ts)
│   ├── env.test.ts                   # CHANGED: new required-var matrix
│   ├── mcp-tokens.test.ts            # unchanged
│   ├── mcp-password-page.test.ts     # DELETED
│   └── mcp-lockout.test.ts           # DELETED
├── integration/
│   ├── helpers/oauth-client.ts               # CHANGED: connectThroughApproval (forwarded-identity headers + approval POST) replaces connectThroughPasswordGate
│   ├── helpers/stub-identity-provider.ts     # NEW: local HTTP server mimicking Authentik userinfo; mints/revokes stub assertions
│   ├── mcp-connect.test.ts                   # CHANGED: full connect through simulated outpost; decline/abandon paths
│   ├── mcp-forged-identity.test.ts           # NEW: direct-to-app forged/missing/expired assertions obtain no grant (US2)
│   ├── mcp-revocation.test.ts                # CHANGED: restart/rotation semantics keyed on MCP_TOKEN_SECRET
│   └── mcp-lockout.test.ts                   # DELETED
└── deploy/
    ├── harness.ts                # CHANGED: .env gains MCP_TOKEN_SECRET + AUTHENTIK_USERINFO_URL; password field removed
    ├── mcp-connect.test.ts       # CHANGED: stub identity-provider container on the work-helper network (trackContainer pattern from caddy-proxy.test.ts)
    └── fresh-deploy.test.ts      # CHANGED: missing-var startup error now names MCP_TOKEN_SECRET

compose.yaml                      # CHANGED: require MCP_TOKEN_SECRET (compose-level :?err gate), pass AUTHENTIK_USERINFO_URL
.env.example                      # CHANGED: new vars documented, CONNECTOR_PASSWORD removed
docs/deploy.md                    # CHANGED: narrowed unauthenticated paths, new .env table, userinfo URL setup, updated troubleshooting (FR-010)
```

**Structure Decision**: Single-project layout, exactly as the repo stands today. All behavior change is inside `src/server/mcp/auth/` plus deployment wiring; the Vue client is untouched (the approval page stays server-rendered HTML like the password page it replaces — the one signed-off exception to the Vue-frontend rule, unchanged in kind).

## Complexity Tracking

No constitution violations — table intentionally empty.
