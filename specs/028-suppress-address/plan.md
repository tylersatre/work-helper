# Implementation Plan: Suppress Address

**Branch**: `028-suppress-address` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-suppress-address/spec.md`

## Summary

Add three MCP write/read tools — `suppress-address`, `unsuppress-address`, `list-suppressed-addresses` — so an authorized agent can flag a currently-unlinked, previously-seen email address as "never link," turning `list-unlinked-addresses` into a genuine work queue instead of an ever-regrowing list of no-reply senders and bulk calendar attendees. The feature is a single new table (`suppressed_addresses`, FK'd to the existing `email_addresses.id`) plus: three new MCP tools; a small filter added to the existing `listUnlinkedAddresses` query; and two small hooks into the existing "link an unlinked address to a person" write sites (`addEntry` in `contact-entries.ts`, `createPerson` in `people.ts`) so a suppression flag clears itself automatically the moment its address becomes linked, with no reactivation on a later unlink. No UI change, no REST route, no new auth code — this feature is MCP-only and inherits the existing `mcp-authentik-auth` gate by registering on the same `McpServer` instance as every other tool.

## Technical Context

**Language/Version**: TypeScript 5, Node.js >=22 (ESM, `"type": "module"`)

**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP server), Fastify 5 (HTTP host for MCP + REST), `drizzle-orm` + `better-sqlite3` (persistence), `zod` 4 (validation)

**Storage**: SQLite via Drizzle ORM (`src/server/db/schema.ts`, `drizzle/` migrations). One new table this feature adds: `suppressed_addresses` (id PK, `address_id` FK → `email_addresses.id` unique, `suppressed_at`). Purely additive migration — no existing table altered, no data-loss risk.

**Testing**: Vitest (`npm test`). MCP tool behavior is exercised through `tests/integration/mcp-*.test.ts`, which spin up the real Fastify app with an in-memory SQLite db, connect a real `@modelcontextprotocol/sdk` `Client` over `StreamableHTTPClientTransport` through the OAuth approval flow, and call tools exactly as an authorized agent would — see `tests/integration/mcp-unlinked-addresses.test.ts` for the closest existing precedent (same fake mail/calendar providers this feature's tests will reuse to seed synced participant data).

**Target Platform**: Self-hosted Docker (Linux server); dev via `npm run dev` (Fastify API + Vite).

**Project Type**: Single web app repo with a client/server/shared split under one `src/` tree (not a separate frontend/backend project pair) — see Structure Decision.

**Performance Goals**: N/A — CRUD-scale MCP tool calls and a single indexed `NOT EXISTS` filter against a local SQLite db; no new performance-sensitive path.

**Constraints**: All three tools must be gated by the existing `mcp-authentik-auth` OAuth flow (no new auth code — every tool registered on the shared `McpServer` instance is already behind it). No confirmation/dry-run step on any tool. Suppress/unsuppress must have zero effect on synced mail, conversations, or message/event participant data (FR-012) — only the new table is written.

**Scale/Scope**: 3 new tools registered in `src/server/mcp/tools.ts`; 1 new service module (`src/server/services/address-suppression.ts`); a small filter addition to `listUnlinkedAddresses` in `src/server/services/email/queries.ts`; small additions to `contact-entries.ts::addEntry` and `people.ts::createPerson` (auto-clear hook); one new schema table + migration; no client (Vue) changes — this feature has no UI surface (spec Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec Is the Source of Truth**: PASS. `specs/028-suppress-address/spec.md` exists with Given/When/Then acceptance scenarios for all 4 user stories, run through `/speckit-specify` before this plan, itself derived from the Tyler-authored `docs/product/features/suppress-address.md` PRD.
- **II. Test-First**: PASS (procedural gate, enforced at `/speckit-implement` time). Plan's testing strategy (integration tests against a real MCP client, per tool, plus the auto-clear-on-link hook exercised through `create-person`/`add-contact-entry`) supports writing a failing test before each tool/service/migration change; no code is written by this plan itself.
- **III. Evidence Over Assertion**: PASS. Every acceptance criterion in this feature is reachable only through MCP tools (no UI surface, per spec Assumptions) — so the sole evidence surface is recorded automated-check output (`tests/integration/mcp-suppress-address.test.ts` plus `npm run lint`/`typecheck`/`test`/`build`), independently confirmed by the `verifier` agent. No `browser-tester` evidence is expected or needed for this feature.
- **IV. Architecture Constraints**: PASS. TypeScript throughout; new tools built on the existing `@modelcontextprotocol/sdk` `McpServer.registerTool` — no new framework. No email-ingestion or Docker-deployment impact. Schema change follows the existing Drizzle migration workflow.
- **V. Small Vertical Slices, Trunk via PR**: PASS. Single feature branch, single PR, Conventional Commits.

No violations. Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/028-suppress-address/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── mcp-tools.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/                       # Vue 3 UI — UNCHANGED by this feature
├── server/
│   ├── db/
│   │   └── schema.ts              # + suppressedAddresses table
│   ├── mcp/
│   │   └── tools.ts               # +3 server.registerTool(...) calls (suppress-address, unsuppress-address, list-suppressed-addresses)
│   ├── services/
│   │   ├── address-suppression.ts # NEW — suppressAddress, unsuppressAddress, listSuppressedAddresses, clearSuppressionForAddressId
│   │   ├── contact-entries.ts     # addEntry gains the auto-clear-on-link hook (research.md R4)
│   │   ├── people.ts              # createPerson gains the auto-clear-on-link hook (research.md R4)
│   │   └── email/
│   │       └── queries.ts         # listUnlinkedAddresses gains a NOT EXISTS suppression filter
│   └── routes/                    # UNCHANGED — no REST route for this feature (MCP-only, per spec Assumptions)
└── shared/
    └── validation.ts              # UNCHANGED — a small local zod schema for `address` lives in address-suppression.ts (research.md R7), not shared/validation.ts

drizzle/
└── 0005_<name>.sql                # NEW migration — CREATE TABLE suppressed_addresses + its unique index

tests/
└── integration/
    └── mcp-suppress-address.test.ts   # new — one MCP-client-driven test file for all 3 tools + the auto-clear hook
```

**Structure Decision**: Single project (work-helper is one repo with `src/client`, `src/server`, `src/shared` under one `src/` tree, not a split frontend/backend pair). This feature is server-only: all changes live in `src/server/mcp/tools.ts`, a new `src/server/services/address-suppression.ts`, small edits to `contact-entries.ts`/`people.ts`/`email/queries.ts`, one new schema table + migration, and one new integration test file. No client changes.

## Complexity Tracking

*No violations — table intentionally empty.*
