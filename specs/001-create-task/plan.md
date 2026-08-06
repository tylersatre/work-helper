# Implementation Plan: Create Task

**Branch**: `001-create-task` | **Date**: 2026-08-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-create-task/spec.md`

## Summary

Thinnest vertical slice proving UI and database work together: a kanban
board whose lanes come from a JSON config file (`To Do`, `In Progress`,
`Waiting`, `Done`), with a create-task form that captures only a title.
New tasks are persisted to SQLite and appear as cards in the first
configured lane; empty/whitespace titles are rejected with a visible
message. No editing, moving, deleting, tags, links, or MCP tools.

This is the repository's first feature, so the plan also establishes the
foundational stack (see [research.md](research.md)): Fastify 5 API +
Vue 3/Vite 8 SPA in a single npm package, SQLite via better-sqlite3 +
Drizzle ORM, zod validation shared between client and server, Vitest for
all automated tests, browser evidence via the `browser-tester` agent.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24 LTS (`engines` ≥22)

**Primary Dependencies**: Fastify 5 (+`@fastify/static`), Vue 3.5
(+`@vitejs/plugin-vue`, `vue-tsc` for SFC typechecking), Vite 8,
Drizzle ORM 0.45 + better-sqlite3 13, zod 4

**Storage**: SQLite (file at `DATABASE_PATH`, default
`./data/work-helper.db`; Docker-volume-friendly); Drizzle-managed
migrations; `:memory:` in tests. Lane config is a JSON file, not DB
(see [contracts/lanes-config.md](contracts/lanes-config.md))

**Testing**: Vitest 4 — unit (shared validation, config loader),
integration (Fastify `inject` + in-memory SQLite), component (Vue
Testing Library + jsdom). Acceptance evidence: `browser-tester` agent via
Playwright MCP → `docs/evidence/create-task/`

**Target Platform**: Self-hosted Docker (Linux) ultimately; this slice
runs via `npm run dev` locally — no choice made here blocks
containerization (DB path and config path are env-overridable)

**Project Type**: Web application — SPA client + API server in one npm
package, one production process (Fastify serves the built client)

**Performance Goals**: Task visible on board <5s after submit (SC-001);
effectively instant locally — no special engineering needed at
single-user scale

**Constraints**: Single user, no auth (spec assumption); lanes read from
config only, no lane management UI (FR-007); no task
edit/move/delete/tags/links/MCP (FR-008); titles have no max length but
must not break board layout when long (CSS wrapping)

**Scale/Scope**: One user, one board, four lanes, hundreds of tasks —
~4 UI components, 2 API endpoints, 1 table

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Spec is the source of truth | ✅ PASS | Tyler-authored PRD (`docs/product/features/create-task.md`) → spec.md via `/speckit-specify`; PRD open questions answered by Tyler (lane set, config file, first-lane default) |
| II | Test-first (non-negotiable) | ✅ PASS | Every layer is test-first-capable by design: shared zod schema (unit), `app.inject()` + `:memory:` SQLite (integration), Testing Library (component). `/speckit-tasks` must order a failing test before each implementation task |
| III | Evidence over assertion | ✅ PASS | quickstart.md maps all 5 acceptance scenarios to automated checks **and** `browser-tester` runs with evidence in `docs/evidence/create-task/`; `verifier` agent independently re-runs gates |
| IV | Architecture constraints | ✅ PASS | TypeScript throughout; no MCP surface in this slice (routes call a plain service/db layer the future `src/mcp/` will consume — MCP additions need their own spec); no Graph ingestion touched; env-configurable DB/config paths keep Docker target viable |
| V | Small vertical slices, trunk via PR | ✅ PASS | One thin slice on branch `001-create-task`, lands via PR with CI review; Conventional Commits |

**Post-design re-check (after Phase 1)**: ✅ PASS — no new violations.
The design adds no lane persistence (config stays the only lane source),
no endpoints beyond the two the spec requires, and no scope beyond FR-001
– FR-008. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-create-task/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── http-api.md      # GET /api/board, POST /api/tasks
│   └── lanes-config.md  # config/lanes.json format & validity rules
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
config/
└── lanes.json               # ["To Do","In Progress","Waiting","Done"]

src/
├── client/                  # Vue SPA (Vite root)
│   ├── index.html
│   ├── main.ts
│   ├── App.vue
│   └── components/
│       ├── Board.vue        # fetches /api/board, lays out lanes
│       ├── Lane.vue         # one column, ordered cards
│       ├── TaskCard.vue     # renders a title (wraps long titles)
│       └── CreateTaskForm.vue  # title input + validation message
├── server/
│   ├── index.ts             # entrypoint: load config, open DB, listen
│   ├── app.ts               # Fastify app factory (injectable in tests)
│   ├── lanes-config.ts      # load + zod-validate config/lanes.json
│   ├── db/
│   │   ├── index.ts         # better-sqlite3 + Drizzle init, migrations
│   │   └── schema.ts        # tasks table (data-model.md)
│   ├── services/
│   │   └── tasks.ts         # create/list logic (future MCP consumer)
│   └── routes/
│       ├── board.ts         # GET /api/board
│       └── tasks.ts         # POST /api/tasks
└── shared/
    ├── types.ts             # Task, BoardView
    └── validation.ts        # zod title schema (client + server)

drizzle/                     # generated SQL migrations (checked in)

tests/
├── unit/                    # validation rules, lanes-config loader
├── integration/             # API via app.inject() + :memory: SQLite
└── component/               # Board/Lane/CreateTaskForm behavior

data/                        # runtime SQLite file (gitignored)
```

**Structure Decision**: Single npm package, web-application shape —
`src/server` (Fastify API), `src/client` (Vue SPA), `src/shared`
(types + validation used by both). One production process: Fastify
serves `/api/*` plus the Vite build via `@fastify/static`; in dev, Vite
proxies `/api` to Fastify. Routes stay thin over `src/server/services/`,
which is the layer the future `src/mcp/` server will consume (Principle
IV). Rationale for rejecting a workspaces monorepo at this size:
research.md R9.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations — table intentionally empty.*
