# Implementation Plan: MCP People Tools

**Branch**: `015-mcp-people-tools` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-mcp-people-tools/spec.md`

## Summary

Expose person creation, person editing, contact-list management (add / mark-primary / remove for emails and phones), and unlinked-synced-address discovery as work-helper MCP tools, so an authorized agent can build and maintain the People list from synced mail. The existing service layer (`createPerson`, `updatePerson`, `addEntry`, `markPrimary`, `removeEntry`) already implements the UI's validation, uniqueness, primary-marker, and synced-address-linking semantics, so the implementation is: six new MCP tools in `src/server/mcp/tools.ts` that call those services, enrichment of the services' conflict results to identify the holding person (FR-006), MCP-side strict validation the UI never needed (reject unknown extra fields, reject explicitly blank contact values), one new aggregate query for unlinked synced addresses, and an expanded `get-person` output carrying full contact lists. No schema change, no migration, no UI change.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >= 22, ESM throughout

**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.30 (StreamableHTTP server transport, `McpServer.registerTool`), Fastify 5, drizzle-orm ^0.45 on better-sqlite3, zod ^4; Vue 3 client untouched by this feature

**Storage**: SQLite via drizzle. Production data exists on the home server; this feature adds **no schema change and no migration** — every table it needs (`people`, `email_addresses`, `person_phones`, `email_participants`, `email_messages`) already exists

**Testing**: vitest 4. Integration tests boot the real Fastify app on an in-memory SQLite DB and drive tools through the real MCP `Client` over StreamableHTTP with the OAuth approval stub (pattern of `tests/integration/mcp-read-tools.test.ts` + `helpers/oauth-client.ts`); synced-mail seeding follows `tests/integration/email-person-linking.test.ts`

**Target Platform**: Self-hosted Docker on Tyler's home server (Node 22 / Linux); dev ports for this feature are API 3015 / UI 5115 via `npm run dev`

**Project Type**: Single-repo TypeScript web app with embedded MCP server (`src/server` + `src/client`)

**Performance Goals**: Single-user product; the only new query of note, the unlinked-address aggregate, must stay interactive (sub-second) over a real mailbox (tens of thousands of participant rows) — served by the existing `email_participants_address_id` and `email_messages` indexes

**Constraints**: FR-020 parity boundary (no agent power the UI lacks, no person deletion via agent); zero UI behavior change; FR-001 auth rides entirely on the shipped mcp-authentik-auth bearer gate at `POST /mcp`; production data untouched (no migration)

**Scale/Scope**: One user; MCP surface grows from 10 tools to 16; hundreds of people, thousands of synced messages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Justification |
|---|---|---|
| I. Spec Is the Source of Truth | PASS | Tyler-authored PRD at `docs/product/features/mcp-people-tools.md`, specified into `specs/015-mcp-people-tools/spec.md`; this plan implements only what the spec requires |
| II. Test-First (NON-NEGOTIABLE) | PASS | Every tool, service enrichment, and query lands red→green: a failing vitest integration test through the real MCP client precedes each behavior; service-level changes get failing tests in the existing `people.test.ts` / `contact-entries.test.ts` suites first |
| III. Evidence Over Assertion | PASS | Criteria reachable only through MCP (tool responses, validation errors, ordering) are evidenced by recorded vitest output; criteria with a UI surface (person appears on People page, record shows values after reload, conversation detail shows the link) get browser-tester evidence in `docs/evidence/mcp-people-tools/`; verifier re-runs both |
| IV. Architecture Constraints | PASS | Tools register on the existing `McpServer` from the official SDK — no other framework; agents stay consumers (this feature adds consumer surface only; ingestion untouched); ships in the existing Docker deployment |
| V. Small Vertical Slices, Trunk via PR | PASS | One branch (`015-mcp-people-tools`), one PR, Conventional Commits; the slice is independently shippable (pure additive server surface) |
| Data & migrations | PASS | No schema change → no migration file, no data risk; nothing lossy to flag |

**Post-Phase-1 re-check**: PASS — the design added no projects, no new frameworks, no schema changes; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-mcp-people-tools/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── mcp-tools.md     # Phase 1 output — tool-by-tool MCP contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── mcp/
│   │   └── tools.ts                    # MODIFIED — 6 new tools; get-person output expanded; shared person schema helpers
│   ├── services/
│   │   ├── people.ts                   # MODIFIED — email/phone conflict results gain the holding person {id, name}
│   │   ├── contact-entries.ts          # MODIFIED — addEntry conflict result gains the holding person {id, name}
│   │   └── email/
│   │       └── queries.ts              # MODIFIED — new listUnlinkedAddresses(db) aggregate
│   └── routes/
│       └── people.ts                   # UNCHANGED behavior — routes keep existing messages, ignoring the enriched conflict payload
└── shared/
    └── validation.ts                   # LIKELY UNCHANGED — research D6 places the MCP-strict contact schemas at the tool layer (tools.ts); touch only if implementation reveals a genuine need

tests/
├── integration/
│   ├── mcp-people-write-tools.test.ts  # NEW — US1 create, US3 contact management, US4 edit, validation + parity cases
│   ├── mcp-unlinked-addresses.test.ts  # NEW — US2 discovery list content, ordering, link-reactivity
│   ├── mcp-read-tools.test.ts          # MODIFIED — US5 get-person full lists, search-people unchanged
│   ├── people.test.ts                  # MODIFIED — conflict-holder enrichment at the service/API seam
│   └── contact-entries.test.ts         # MODIFIED — conflict-holder enrichment for addEntry
```

**Structure Decision**: Single-project layout as shipped; all work lands in the existing MCP tool registry, the two people services, and the email query module. The REST routes and Vue client are deliberately untouched (spec: "Any UI change" is out of scope), which the plan enforces by keeping conflict-holder data additive on service results the routes already ignore.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
