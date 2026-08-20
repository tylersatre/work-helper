# Implementation Plan: Move Task from Detail View

**Branch**: `023-move-task-detail-view` | **Date**: 2026-08-20 | **Spec**: [specs/023-move-task-detail-view/spec.md](spec.md)

**Input**: Feature specification from `/specs/023-move-task-detail-view/spec.md`

## Summary

Replace the task detail view's plain-text `Lane: <name>` line with a row of clickable lane pills that move the card by calling the exact same server-side move path the kanban board's drag-and-drop already uses (`PUT /api/tasks/:id/placement` → `moveTask()` in `src/server/services/tasks.ts`). No new endpoint, no new MCP tool, and no MCP tool's behavior changes — `move-task` and `list-board` are untouched and already prove User Story 2. The only backend change is additive: `GET /api/tasks/:id` gains an ordered `lanes: string[]` field (mirroring how `GET /api/board` already exposes `app.lanes`) so the frontend can render pills without a second network call. Bottom-of-lane landing reuses the placement endpoint's existing index-clamping behavior (already covered by `tests/integration/tasks.test.ts`'s "clamps an index past the end... to append" case) by passing `Number.MAX_SAFE_INTEGER` — the same mechanism the `move-task` MCP tool already uses when `position` is omitted. Visual "current vs. move-target" styling follows the app's established link-blue-tint precedent (`ContactEntryList.vue`'s "Primary" marker) over `--wh-surface`/`--wh-border-subtle` contained-pill styling, and failure handling follows the tag-attach/detach precedent (await the response, only update local state on success, show an inline error and leave the last-saved lane displayed on failure) rather than `Board.vue`'s optimistic-apply-and-reconcile pattern, since the detail view renders one task, not a whole board.

## Technical Context

**Language/Version**: TypeScript 5.9, Node >= 22, ESM (`"type": "module"`)

**Primary Dependencies**: Fastify 5 (API), Vue 3.5 + vue-router 4 (SPA), Drizzle ORM 0.45 + better-sqlite3 (data), `@modelcontextprotocol/sdk` ^1.30 (MCP server, unchanged by this feature), zod 4 (schema validation)

**Storage**: SQLite via better-sqlite3; no schema change — this feature adds no table, column, or migration. It only adds a derived, non-persisted field (`lanes`) to one HTTP response, sourced from the existing `app.lanes` config array.

**Testing**: Vitest — `tests/integration/` (Fastify `app.inject()` for HTTP; real MCP SDK `Client` over `StreamableHTTPClientTransport` for `list-board` visibility), `tests/component/` (`@testing-library/vue`, jsdom); gate = `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

**Target Platform**: Self-hosted Docker (Linux) in production; macOS dev; per-feature dev ports from branch prefix (023 → API 3023, UI 5123)

**Project Type**: Single TypeScript web app: Vue SPA (`src/client/`) + Fastify API (`src/server/`) + MCP server (`src/server/mcp/`, untouched) sharing types via `src/shared/`

**Performance Goals**: Personal-scale single-user CRM; one lane list (≤ a handful of configured lanes) rendered per detail-view visit — no pagination or performance concerns

**Constraints**: TDD mandatory (failing test first); evidence gate (browser-tester for the UI story, recorded HTTP/MCP test output for the agent-visibility story, both independently confirmed by the verifier agent); Vue 3 only; no new MCP tools and no existing MCP tool's behavior changes (FR-009); the kanban card face on the board must not change (FR-010); no confirmation dialog, toast, or move animation (Assumptions); no hard-wrapped markdown

**Scale/Scope**: Single user; 2 user stories, 6 acceptance scenarios + 3 edge cases; 0 migrations, 1 modified route handler, 1 modified shared type, 1 modified Vue page (no new components needed — the pill row is small enough to live inline in `TaskDetailPage.vue`, matching how the existing lane text was inline), ~2 modified/new test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Tyler-authored PRD (`docs/product/features/move-task-from-detail-view.md`) ran through `/speckit-specify` (`specs/023-move-task-detail-view/spec.md`, commit `69828bf`); this plan derives everything from that spec | PASS |
| II. Test-First | Every behavior sequenced failing-test-first: the `lanes` field via `app.inject()` HTTP tests, pill rendering/click/error/reload behavior via `@testing-library/vue` component tests, MCP visibility via the real MCP SDK client against `list-board`; no code before its failing test | PASS |
| III. Evidence Over Assertion | User Story 1 (UI-facing) gets browser-tester evidence in `docs/evidence/023-move-task-detail-view/`; User Story 2 (MCP-only) gets recorded automated-check output; verifier independently re-runs both | PASS |
| IV. Architecture Constraints | TypeScript throughout; MCP server (`@modelcontextprotocol/sdk`) is untouched — no new tool, no tool-behavior change; agents remain MCP consumers; Docker deployment untouched | PASS |
| V. Small Vertical Slices, Trunk via PR | One branch (`023-move-task-detail-view`), one PR, Conventional Commits; the slice is independently shippable (detail-view move control, nothing else) | PASS |
| Data & migrations | No schema change — no migration is generated by this feature. `lanes` is derived from the existing `app.lanes` decorator at request time, never stored | PASS |

**Post-design re-check (after Phase 1)**: PASS — the design artifacts add no new projects, no schema change, no new MCP surface, and reuse the existing placement endpoint and its already-tested clamp-to-bottom behavior; nothing exceeds the spec's scope.

## Project Structure

### Documentation (this feature)

```text
specs/023-move-task-detail-view/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── http-api.md      # Phase 1 output — HTTP detail-response + placement-reuse contract; notes the MCP surface stays unchanged
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── types.ts                        # MODIFIED: TaskDetail gains `lanes: string[]`
├── server/
│   └── routes/tasks.ts                 # MODIFIED: GET /api/tasks/:id merges `lanes: app.lanes` into the response (mirrors routes/board.ts:6-9); PUT .../placement UNCHANGED
└── client/
    └── pages/TaskDetailPage.vue        # MODIFIED: replaces `<p data-testid="task-lane">Lane: {{ task.lane }}</p>` with a lane-pill row; new placement-request logic (await response, apply on success, inline error + stale-response guard on failure/race)

tests/
├── integration/
│   └── task-detail-lane-move.test.ts   # NEW: GET /api/tasks/:id includes ordered `lanes`; a placement move made the way the pill row makes it is visible via the MCP `list-board` tool (User Story 2)
└── component/
    └── task-detail.test.ts             # MODIFIED: replaces the FR-009 "read-only lane, no control" test (spec 008) with pill-row rendering, current-pill non-interactivity, click-to-move, bottom-of-lane request shape, and inline-error-on-failure tests (User Story 1)
```

**Structure Decision**: Keep the existing single-app layout — no new files beyond one new integration test. This is the smallest touch surface of any recent feature: one route handler gains a field it already has access to (`app.lanes`, same decorator `routes/board.ts` already reads), one shared type gains a field, and one page's existing inline markup is replaced with a slightly richer inline control. No new service module, no new Vue component, no new MCP tool — mirrors how `008-move-task-between-lanes` added the underlying `moveTask` service without inventing new architecture, and how `card-email-links` (020) kept read paths flowing through existing detail endpoints rather than adding new ones.

## Complexity Tracking

> No constitution violations — table intentionally empty.
