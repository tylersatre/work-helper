# Implementation Plan: Move Task Between Lanes

**Branch**: `008-move-task-between-lanes` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-move-task-between-lanes/spec.md`

## Summary

Make kanban cards movable: drag a card between lanes or within a lane and it lands exactly where dropped, persisted across reloads, with the MCP `list-board` tool mirroring the same order. Technical approach: add an integer `position` column to the `tasks` table (per-lane ordering, renumbered transactionally on each move), expose one new HTTP endpoint `PUT /api/tasks/:id/placement`, implement drag-and-drop in the Vue board with native HTML5 DnD (no new dependency), optimistic UI with refetch-and-banner on save failure, and order all board reads by `(position, id)` so the UI and MCP stay in lockstep via the shared `listTasksByLane` service.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js >= 22 (ESM throughout)

**Primary Dependencies**: Fastify 5 (HTTP API), Vue 3.5 + Vite 8 (client), Drizzle ORM 0.45 + better-sqlite3 (storage), `@modelcontextprotocol/sdk` 1.30 (MCP server), Zod 4 (validation). No new runtime dependencies — drag-and-drop uses the native HTML5 DnD API.

**Storage**: SQLite via better-sqlite3, schema in `src/server/db/schema.ts`, created from the Drizzle baseline in `drizzle/` at startup (`createDb`)

**Testing**: Vitest 4 — integration tests (node env, in-memory SQLite, `app.inject` + in-process MCP client over `StreamableHTTPClientTransport`), component tests (jsdom, @testing-library/vue), plus `browser-tester` agent (Playwright MCP) for acceptance evidence

**Target Platform**: Self-hosted Docker (Linux) in production; dev on macOS. Desktop browser with a mouse — touch/mobile explicitly out of scope (FR-012)

**Project Type**: Web application — single package with `src/server` (Fastify + MCP) and `src/client` (Vue SPA), shared types in `src/shared`

**Performance Goals**: Single-user local CRUD; drag feedback must feel instant, so the UI updates optimistically and never blocks on the network during a drag

**Constraints**: Drag-and-drop is the only move mechanism (no menus/buttons/keyboard); detail view shows lane read-only; MCP stays read-only for placement (no new tools); on save failure the board must revert visibly to last saved state

**Scale/Scope**: One user (Tyler), 4 configured lanes, tens-to-hundreds of tasks — full-lane renumbering per move is trivially cheap at this scale

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Tyler-authored PRD exists (`docs/product/features/move-task-between-lanes.md`, interview resolved 2026-08-08) and spec.md was produced via `/speckit-specify`; this plan adds nothing outside the spec's FRs | PASS |
| II. Test-First | Every behavior lands red→green: integration tests for the placement endpoint/ordering/creation-append, component tests for board rendering and drop-index logic, MCP integration test for `list-board` order — all written before implementation in the tasks phase | PASS |
| III. Evidence Over Assertion | Each acceptance scenario maps to an automated check plus `browser-tester` evidence in `docs/evidence/move-task-between-lanes/`; `verifier` agent confirms both independently | PASS |
| IV. Architecture Constraints | TypeScript only; MCP changes stay inside the existing `@modelcontextprotocol/sdk` server (no new tools, no other framework); no email-ingestion involvement; Docker target unaffected | PASS |
| V. Small Vertical Slices, Trunk via PR | One slice on branch `008-move-task-between-lanes`, landing via PR with Conventional Commits | PASS |
| Data & migrations (dev phase) | Schema change follows the edit-in-place policy: `position` is added to the base schema and the Drizzle baseline is regenerated as a single squashed migration; dev databases are deleted and recreated; no backfill or data-preserving path is written. Consequence: the now-obsolete `tests/integration/migration-carry-over.test.ts` (which replays the pre-squash migration files 0000–0004 to verify a data-preserving step) is removed — the policy explicitly ended that obligation. See research.md R2. | PASS |

**Post-design re-check (after Phase 1)**: Still PASS. The design added no new projects, no new runtime dependencies, no new MCP tools, and no data-preservation machinery; the only contract additions are one HTTP endpoint and an additive `position` field on existing task payloads. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/008-move-task-between-lanes/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── http-api.md      # Board/tasks REST contract incl. new placement endpoint
│   └── mcp-tools.md     # list-board / get-task / create-task ordering + position field
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── types.ts                     # Task gains position: number
├── server/
│   ├── db/
│   │   ├── schema.ts                # tasks table gains position column (edit in place)
│   │   └── index.ts                 # unchanged (migrate() against regenerated baseline)
│   ├── services/
│   │   └── tasks.ts                 # createTask appends at bottom of first lane; new moveTask; listTasksByLane orders by (position, id)
│   ├── routes/
│   │   ├── board.ts                 # unchanged shape; inherits new ordering
│   │   └── tasks.ts                 # new PUT /api/tasks/:id/placement
│   └── mcp/
│       └── tools.ts                 # taskSummarySchema gains position; list-board inherits order via listTasksByLane
└── client/
    ├── components/
    │   ├── Board.vue                # owns drag state, optimistic move, serialized saves, failure banner
    │   ├── Lane.vue                 # drop target: dragover index computation, drop indicator, empty-lane drop
    │   └── TaskCard.vue             # drag source (draggable="true")
    └── pages/
        └── TaskDetailPage.vue       # shows lane read-only

drizzle/                             # squashed to a single regenerated baseline (research.md R2)

tests/
├── integration/
│   ├── board.test.ts                # ordering expectations move from id-ASC to position-based
│   ├── tasks.test.ts                # creation-append + placement endpoint coverage
│   ├── mcp-read-tools.test.ts       # list-board mirrors arranged board order
│   └── migration-carry-over.test.ts # REMOVED (obsolete under squashed baseline; research.md R2)
├── component/
│   ├── board.test.ts                # per-lane order rendering, drop-index logic, failure revert
│   └── task-detail.test.ts          # read-only lane display, no lane-change control
└── unit/                            # pure drop-index helper if extracted
```

**Structure Decision**: Keep the existing single-package web layout (`src/server` + `src/client` + `src/shared`). This feature only touches the files listed above; no new directories, packages, or services are introduced.

## Complexity Tracking

No constitution violations — table intentionally empty.
