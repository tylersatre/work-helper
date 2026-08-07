# Implementation Plan: MCP Server

**Branch**: `004-mcp-server` | **Date**: 2026-08-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-mcp-server/spec.md`

## Summary

Expose work-helper's existing board, task, note, and people data as six MCP tools (`list-board`, `get-task`, `search-people`, `get-person`, `create-task`, `add-note`) over the Streamable HTTP transport, gated by a single connector password. The gate is implemented as the MCP-standard OAuth 2.1 authorization flow (code + PKCE, dynamic client registration) so that any compliant client — ultimately Claude Desktop — connects by opening a browser password page; access tokens are stateless HMACs keyed by a password-derived secret, which makes connections survive restarts exactly when the password is unchanged and makes password-change-plus-restart the complete revocation mechanism. A per-IP, consecutive-failure, in-memory lockout (3 strikes, cleared only by restart) hardens the password page, keyed on Caddy-forwarded client IPs. Tools call the existing service layer, so MCP reads and writes are the web app's own live data with notes sourced "via MCP". Full decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥ 22, ESM throughout (existing project settings)

**Primary Dependencies**: Fastify 5 (existing HTTP server; `trustProxy: true` added), `@modelcontextprotocol/sdk` ^1.30.0 (new — the only new production dependency; official SDK per constitution), zod ^4.4 (existing, SDK-compatible), drizzle-orm + better-sqlite3 (existing), Vue 3 client untouched, `node:crypto` (scrypt key derivation, HMAC, timing-safe compares)

**Storage**: SQLite via drizzle (one new table `oauth_clients` + migration); deliberately in-memory: lockout records and pending authorization codes; deliberately stateless: access tokens (never stored)

**Testing**: vitest — unit tests for token minting/verification, lockout transitions, and password-page rendering states; integration tests driving a real listening server with the SDK's own `Client`/`StreamableHTTPClientTransport` plus scripted password-page HTTP (restart simulation by rebuilding the app over the same DB; IP simulation via `X-Forwarded-For`); `browser-tester` agent for password-page evidence; Claude Desktop connect is Tyler's manual acceptance step per spec clarification

**Target Platform**: self-hosted Docker on the public internet behind Caddy (TLS termination + forwarded client IPs — the lockout's trust anchor); local dev without proxy works with socket IPs

**Project Type**: single web application (Fastify server + Vue client in one package); this feature adds server routes and one server-rendered page, no SPA changes

**Performance Goals**: single-user system — no throughput targets; connect flow must complete well inside SC-001's under-a-minute budget (it is 3 HTTP round-trips plus one password entry); scrypt derivation done once at boot, not per request

**Constraints**: no session persistence (FR-009/FR-010 shape what may and may not survive restart); official MCP SDK only, no other MCP framework; tools only (no resources/prompts); no new UI beyond the password page; lockout must never be global; password from environment only; in deployment the app's port must be reachable only through Caddy — `trustProxy: true` trusts any `X-Forwarded-For`, so direct access would let a caller spoof the lockout's per-IP key

**Scale/Scope**: one user, a handful of concurrently connected MCP clients, six tools, ~5 new HTTP endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-research | Post-design |
|---|---|---|---|
| I | Spec is the source of truth | PASS — PRD `docs/product/features/mcp-server.md` → `/speckit-specify` → `spec.md` with clarifications resolved 2026-08-06 | PASS — every design element traces to an FR/US; out-of-scope list respected (no extra tools, no session expiry, no connection UI) |
| II | Test-first (non-negotiable) | PASS — plan commits to failing-test-first; scripted SDK client makes every story automatable before code exists | PASS — [quickstart.md](quickstart.md) names the test surfaces; contracts are written to be asserted against (exact messages, status codes, shapes) |
| III | Evidence over assertion | PASS — acceptance split defined: vitest integration (scripted MCP client) + browser-tester on the password page + verifier; Claude Desktop manual step is Tyler's, not the agents' | PASS — evidence plan concretized in quickstart (`tests/integration/mcp-*`, `docs/evidence/mcp-server/`) |
| IV | Architecture constraints | PASS — TypeScript; official `@modelcontextprotocol/sdk` and no other MCP framework; no email ingestion touched; Docker/Caddy deployment assumed by spec | PASS — SDK ^1.30.0 verified compatible with zod 4; no Express added (transport bridged to Fastify raw req/res); single-process architecture preserved |
| V | Small vertical slices, trunk via PR | PASS — one branch `004-mcp-server`, lands via PR; read+capture tier only, rest split to `mcp-tool-expansion` | PASS — no scope growth during design |

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-mcp-server/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D10
├── data-model.md        # Phase 1 — oauth_clients table, in-memory/stateless entities, validation reuse
├── quickstart.md        # Phase 1 — run + validate guide, evidence map, Tyler's manual acceptance
├── contracts/
│   ├── http-auth.md     # Phase 1 — discovery, register, authorize (password page), token, /mcp gate
│   └── mcp-tools.md     # Phase 1 — the six tools: inputs, outputs, error messages
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── app.ts                     # touched: trustProxy, connectorPassword option, register MCP + auth routes
│   ├── index.ts                   # touched: read CONNECTOR_PASSWORD from env
│   ├── db/
│   │   └── schema.ts              # touched: + oauth_clients table (drizzle migration in drizzle/)
│   ├── services/
│   │   └── tasks.ts               # touched: source param on createTask/addNote (default 'ui')
│   ├── routes/                    # existing web API routes — unchanged
│   └── mcp/                       # new — everything MCP lives here
│       ├── auth/
│       │   ├── tokens.ts          # scrypt key derivation, token mint/verify (stateless HMAC)
│       │   ├── lockout.ts         # per-IP consecutive-failure tracker (in-memory)
│       │   ├── clients.ts         # oauth_clients persistence (register/lookup)
│       │   ├── codes.ts           # in-memory single-use authorization codes
│       │   ├── oauth-routes.ts    # /.well-known/*, /oauth/register, /oauth/authorize, /oauth/token
│       │   └── password-page.ts   # server-rendered HTML: form, error, locked states
│       ├── tools.ts               # six tool registrations calling existing services
│       └── routes.ts              # /mcp endpoint: bearer check, stateless transport bridge
└── shared/                        # unchanged (validation schemas reused as-is)

tests/
├── unit/
│   ├── mcp-tokens.test.ts         # new
│   ├── mcp-lockout.test.ts        # new
│   └── mcp-password-page.test.ts  # new
└── integration/
    ├── mcp-connect.test.ts        # new — US1: gate + tools/list via SDK client
    ├── mcp-read-tools.test.ts     # new — US2
    ├── mcp-capture-tools.test.ts  # new — US3 (+ web-route visibility)
    ├── mcp-lockout.test.ts        # new — US4 (two IPs, restart clears)
    └── mcp-revocation.test.ts     # new — US5 (restart same/changed password)
```

**Structure Decision**: Keep the single-package web app; all MCP surface area is additive under `src/server/mcp/` with auth isolated in `src/server/mcp/auth/`. Existing routes and the Vue client are untouched except for the two deliberate touch-points (app wiring, service `source` param). Test layout mirrors the existing unit/integration split; integration files map one-to-one onto the spec's user stories so acceptance traceability is mechanical.

## Complexity Tracking

No constitution violations — nothing to justify.
