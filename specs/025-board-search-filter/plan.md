# Implementation Plan: board-search-filter

**Branch**: `025-board-search-filter` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-board-search-filter/spec.md`

## Summary

Add a filter bar above the kanban lanes — a live case-insensitive text search over a card's title, note text, and linked person/company names, plus a multi-select tag filter — and give the `list-board` MCP tool the same two filters so agents see exactly what the UI shows.

Technical approach: `GET /api/board` starts returning each card enriched with `tags` and a precomputed lowercased `searchText` blob. The board filters **in the client** against that full payload, so narrowing is instantaneous per keystroke, the tag selector can be derived from the cards actually on the board, and a filtered drag still knows the destination lane's true length. A single pure predicate in `src/shared/board-filter.ts` is the only place the matching rule exists; the MCP `list-board` handler builds the same enriched cards server-side and calls that same function, which is what makes SC-006 ("an agent receives exactly the same cards the UI shows") a property rather than a coincidence. The active filter lives in `localStorage` so it survives both a reload and an SPA navigation round trip. **No schema change, no migration.**

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥ 22, ESM

**Primary Dependencies**: Vue 3.5 + vue-router + naive-ui (client); Fastify 5 + drizzle-orm + better-sqlite3 (server); `@modelcontextprotocol/sdk` 1.30 (MCP); zod 4 (tool schemas)

**Storage**: SQLite via drizzle. **Read-only for this feature** — `tasks`, `task_notes`, `task_tags`/`tags`, `task_people`/`people`, `task_companies`/`companies`. No new table, no new column, **no migration**. Filter state is client-side (`localStorage`), never persisted server-side.

**Testing**: vitest — `tests/unit` (pure predicate), `tests/integration` (Fastify `app.inject` + in-memory MCP client), `tests/component` (jsdom + @testing-library/vue). Plus `browser-tester` evidence for UI criteria and recorded check output for MCP-only criteria.

**Target Platform**: self-hosted Docker; desktop browser for the board (drag is desktop-only per `move-task-between-lanes`)

**Project Type**: web application — Vue SPA client + Fastify server that also hosts the MCP server, one repo, shared types in `src/shared`

**Performance Goals**: filtered render within one typed character with no network round trip (SC-002). The enriched `/api/board` payload adds note text and linked names per card — acceptable at personal-CRM scale (no pagination, no result cap, per the spec).

**Constraints**: no highlighting or match explanation, no change to the card face (FR-010); all four lanes always rendered (FR-009); within-lane reorder impossible while filtered and the persisted order provably unchanged (FR-016, SC-007); plain substring matching only — no fuzzy, ranked, boolean, or field-prefixed queries.

**Scale/Scope**: 1 new shared module, 1 new Vue component, edits to 4 existing files (`Board.vue`, `Lane.vue`, `routes/board.ts`, `mcp/tools.ts`) plus `services/tasks.ts` and `shared/types.ts`; 1 new test file and 3 extended ones.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. **Result: PASS both times, no violations, Complexity Tracking left empty.***

| Principle | Status | How this plan satisfies it |
| --- | --- | --- |
| I. Spec is the source of truth | PASS | Driven by `docs/product/features/board-search-filter.md` → `spec.md`; every element of this plan traces to an FR/SC. Nothing here is outside the spec, and the spec's Out of Scope list (sorting, extra facets, highlighting, saved filters, card-face changes) is respected — no speculative hooks for them. |
| II. Test-First (non-negotiable) | PASS | Every task in `tasks.md` will be ordered failing-test-first: the unit predicate before `board-filter.ts`, the `/api/board` shape assertions before the enrichment, the `list-board` cases before the tool arguments, the component assertions before `BoardFilterBar.vue`. |
| III. Evidence over assertion | PASS | US1–US4 have a UI surface → `browser-tester` screenshots into `docs/evidence/board-search-filter/`. US5 is MCP-only → recorded `vitest` output. `verifier` re-runs everything. Mapping and commands are in `quickstart.md`. |
| IV. Architecture constraints | PASS | TypeScript throughout; the MCP change is a `registerTool` input-schema edit on the existing official-SDK server; no new framework, no new runtime dependency; nothing touches email ingestion; deployment unchanged. |
| V. Small vertical slices, trunk via PR | PASS | One feature, one branch, one PR, Conventional Commits. The slice is genuinely vertical (shared predicate → API → MCP → UI) and the priority order lets US1 ship as a coherent increment before US2–US5 land on top. |
| Data & migrations | PASS | Read-only feature. No `schema.ts` edit, so no `drizzle-kit generate`, no new file in `drizzle/`, no migration to hand-adjust, and no data-loss risk to flag. Existing deployed data is untouched. |

Post-Phase-1 re-check: the design added no table, no dependency, no framework, and no persistence beyond browser-local view state — every row above still holds.

## Project Structure

### Documentation (this feature)

```text
specs/025-board-search-filter/
├── plan.md              # This file
├── spec.md              # Input
├── research.md          # Phase 0 — R1..R7 decisions
├── data-model.md        # Phase 1 — BoardTask, BoardFilter, matching rule
├── contracts/           # Phase 1
│   ├── board-api.md         # GET /api/board enrichment
│   ├── mcp-list-board.md    # list-board search/tags arguments
│   └── board-filter-ui.md   # filter bar elements + behaviours
├── quickstart.md        # Phase 1 — how to validate + evidence capture
└── tasks.md             # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── board-filter.ts            # NEW — matchesBoardFilter(), the single matching rule
│   └── types.ts                   # EDIT — BoardTask (tags + searchText), BoardLane re-typed
├── server/
│   ├── routes/board.ts            # EDIT — return enriched board cards
│   ├── services/tasks.ts          # EDIT — listBoardTasksByLane(): tags + searchText assembly
│   └── mcp/tools.ts               # EDIT — list-board gains optional search / tags inputs
└── client/
    ├── components/
    │   ├── BoardFilterBar.vue     # NEW — search input, tag selector, N-of-M indicator, clear
    │   ├── Board.vue              # EDIT — filter state, localStorage, computed visible lanes,
    │   │                          #        filtered-drag rules, "No cards match"
    │   └── Lane.vue               # EDIT — filterActive: no drop indicator, block within-lane drop
    └── utils/board-filter-storage.ts  # NEW — safe localStorage read/write of BoardFilter

tests/
├── unit/board-filter.test.ts          # NEW — predicate + trim/case/missing-field rules
├── integration/board.test.ts          # EXTEND — /api/board returns tags + searchText
├── integration/mcp-read-tools.test.ts # EXTEND — list-board search / tags / both / neither
└── component/board.test.ts            # EXTEND — filter bar, live typing, persistence, drag guards
```

**Structure Decision**: the repo's existing single-package web-app layout (`src/client`, `src/server`, `src/shared`, tests split unit/integration/component) is used as-is. The one structural addition is `src/shared/board-filter.ts` — the matching rule belongs in `shared/` precisely because both the client board and the server-side MCP tool must run the identical predicate; putting it anywhere else would fork the semantics that SC-006 requires to be one thing.

## Design notes carried into `/speckit-tasks`

Ordered by the spec's user-story priorities, so each story is independently demonstrable:

1. **Foundation** — `matchesBoardFilter` + `BoardTask`; `/api/board` enrichment (`searchText` assembly in `services/tasks.ts`). Unblocks everything else.
2. **US1 (P1)** — `BoardFilterBar.vue` with the search input, wired into `Board.vue`'s `computed` visible lanes, plus the N-of-M indicator, clear control, and "No cards match".
3. **US2 (P2)** — tag selector: options = union of board tags and still-selected tags, alphabetical; union across selected tags; intersected with the text filter.
4. **US5 (P2)** — `list-board` gains `search`/`tags`, resolving names to ids and reusing the shared predicate.
5. **US3 (P2)** — `localStorage` persistence via `utils/board-filter-storage.ts`, tolerant of a missing or malformed store.
6. **US4 (P3)** — `filterActive` down to `Lane.vue`: suppress the drop indicator, block within-lane drops outright, append cross-lane drops at the unfiltered lane length.
7. **Evidence** — seed the spec's board, run `browser-tester` for US1–US4, record MCP check output for US5, then `verifier`.

Two rules worth restating for the implementer, because both are easy to get subtly wrong:

- The cross-lane drop index must come from the **unfiltered** destination lane (`board.value.lanes[...].tasks.length`), never from the rendered/filtered list — otherwise a filtered drag silently reorders hidden cards and breaks SC-007.
- A within-lane drop while filtered must be dropped **before** any `fetch`, not merely ignored optimistically; the component test asserts that no `placement` request is issued at all.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
