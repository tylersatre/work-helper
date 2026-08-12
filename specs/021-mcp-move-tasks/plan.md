# Implementation Plan: MCP Move Tasks

**Branch**: `021-mcp-move-tasks` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-mcp-move-tasks/spec.md`

## Summary

Add a `move-task` tool to the work-helper MCP server and extend the existing `create-task` tool with an optional `lane` parameter. The heavy lifting already exists: `moveTask` in [src/server/services/tasks.ts](../../src/server/services/tasks.ts) (built for the UI drag, feature 008) performs transactional, clamping, within-lane-aware moves against a 0-based index. This feature wires that service into a new MCP tool with 1-based positions, adds lane choice to `createTask` (currently hardcoded to `lanes[0]`), and formats agent-friendly validation errors that name the configured lanes. No schema change, no migration, no UI change.

## Technical Context

**Language/Version**: TypeScript (ES modules), Node.js — matches existing repo toolchain

**Primary Dependencies**: `@modelcontextprotocol/sdk` (McpServer, `registerTool`), `zod` for input/output schemas, Fastify app host, Drizzle ORM over better-sqlite3

**Storage**: SQLite via Drizzle — existing `tasks` table (`id`, `title`, `lane`, `position`, `createdAt`); no schema change → no migration

**Testing**: Vitest — `tests/integration/` for end-to-end MCP tool calls over StreamableHTTP with the stub identity provider (pattern: `tests/integration/mcp-capture-tools.test.ts`), `tests/integration/tasks.test.ts`-style service coverage for the `createTask` signature change

**Target Platform**: Self-hosted Docker (Linux), same as the deployed app

**Project Type**: Web service + MCP server (single TypeScript project, `src/server`)

**Performance Goals**: N/A — single-user board, tool calls are single SQLite transactions

**Constraints**: No partial effects on failure (service functions are transactional); lane list comes from `context.lanes` (loaded from `config/lanes.json` at startup); existing `mcp-authentik-auth` flow gates all tool calls — no new auth work

**Scale/Scope**: 2 MCP tools touched (1 new, 1 extended), 1 service function extended, ~4 new/extended test files; board sizes are tens of cards

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec Is the Source of Truth | PASS | PRD at `docs/product/features/mcp-move-tasks.md`; spec at `specs/021-mcp-move-tasks/spec.md` with checklist fully checked |
| II. Test-First | PASS (planned) | Every task in tasks.md will follow red → green; integration tests over real MCP client transport are the primary evidence |
| III. Evidence Over Assertion | PASS (planned) | MCP-only criteria → recorded automated-check output; FR-012/SC-004 web-app visibility criteria → `browser-tester` evidence in `docs/evidence/021-mcp-move-tasks/`; `verifier` agent confirms both |
| IV. Architecture Constraints | PASS | Uses `@modelcontextprotocol/sdk` `registerTool` only; TypeScript; no ingestion-path involvement; no schema change so no migration risk to production data |
| V. Small Vertical Slices, Trunk via PR | PASS | One branch, one PR, Conventional Commits |

**Post-Phase-1 re-check**: PASS — design introduces no new projects, no schema change, no new dependencies, no constitution deviations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/021-mcp-move-tasks/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── mcp-tools.md     # Phase 1 output — move-task + create-task tool contracts
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── services/
│   │   └── tasks.ts         # extend createTask with optional lane; moveTask reused as-is (verify no-op edge)
│   └── mcp/
│       └── tools.ts         # new move-task tool; create-task gains optional lane input
└── shared/                  # unchanged

tests/
├── unit/                    # (only if service-level edge cases need isolation; primary coverage is integration)
└── integration/
    ├── tasks.test.ts        # extend: createTask with explicit/invalid lane via REST-visible state
    ├── mcp-capture-tools.test.ts  # extend or reference: create-task lane parameter scenarios
    └── mcp-move-tools.test.ts     # new: move-task scenarios over real MCP client (US1, US2, US4)
```

**Structure Decision**: Existing single-project layout. All changes live in `src/server/services/tasks.ts` and `src/server/mcp/tools.ts`; tests follow the established `tests/integration/mcp-*.test.ts` pattern (Fastify app + stub identity provider + real `@modelcontextprotocol/sdk` client over StreamableHTTP).

## Complexity Tracking

No constitution violations — table intentionally empty.
