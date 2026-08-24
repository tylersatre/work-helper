# Implementation Plan: card-archive

**Branch**: `027-card-archive` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-card-archive/spec.md`

## Summary

Add a boolean `archived` flag to the `tasks` table so a card can be hidden from the board without being deleted, with a symmetric path back. The card detail view (`TaskDetailPage.vue`) gains an archive control that swaps for an unarchive control once archived, mirroring `delete-card`'s header-control precedent but with no confirmation step. The board's filter bar (`BoardFilterBar.vue`, from `board-search-filter`) gains an independent, `localStorage`-persisted "Show archived" toggle; `GET /api/board` starts returning every task in a lane (active and archived, each flagged), and `Board.vue`'s existing client-side filtering gains one more layer — an archived gate that runs *before* the existing text/tag `matchesBoardFilter` gate, so archived cards inherit `board-search-filter`'s search/tag behavior for free while staying invisible whenever the toggle is off, regardless of a match. The MCP `list-board` tool gains an `includeArchived` argument doing the equivalent gate server-side, and two new one-card MCP tools, `archive-card`/`unarchive-card`, expose the same action agents already have UI parity for via `task-archive`'s prior decision that agents may archive but not delete. Unarchiving recomputes the card's position to the bottom of its lane (`max(position) + 1` over the whole lane, the same pattern `createTask` already uses); archiving never touches `lane` or `position`. Both actions are idempotent no-ops on their own end state, per the spec's stale-tab/race edge cases. **One schema change, one migration — everything else is additive to existing files, no new frameworks or routes-level abstractions.**

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥ 22, ESM

**Primary Dependencies**: Vue 3.5 + vue-router + naive-ui (client); Fastify 5 + drizzle-orm + better-sqlite3 (server); `@modelcontextprotocol/sdk` 1.30 (MCP); zod 4 (tool schemas)

**Storage**: SQLite via drizzle. One new column, `tasks.archived` (boolean, `NOT NULL DEFAULT false`), added via a new numbered `drizzle-kit generate` migration (next after `0004_warm_silver_surfer.sql`). Non-destructive metadata-only `ALTER TABLE ADD` — every existing row becomes `archived = false`. No other table changes.

**Testing**: vitest — `tests/unit` (new `board-archive-storage.test.ts`), `tests/integration` (new `task-archive.test.ts`, `mcp-archive-tools.test.ts`; extended `board.test.ts`, `mcp-read-tools.test.ts`), `tests/component` (extended `board.test.ts`, `task-detail.test.ts`, `task-card.test.ts`). Plus `browser-tester` evidence for UI criteria (US1, US2, US3, US5) and recorded check output for the MCP-only criterion (US4).

**Target Platform**: self-hosted Docker; desktop browser for the board and detail view

**Project Type**: web application — Vue SPA client + Fastify server that also hosts the MCP server, one repo, shared types in `src/shared`

**Performance Goals**: no measurable regression — the board payload grows by however many archived cards exist (personal-CRM scale, same "no pagination, no cap" precedent `board-search-filter` already accepted) and by one boolean field per task; archive/unarchive are single-row writes.

**Constraints**: no confirmation step on archive or unarchive (FR-002); no bulk archive/unarchive (FR-016); no archive/unarchive affordance anywhere but the detail view (FR-017); no auto-archiving under any trigger (FR-018); `delete-card` completely unaffected (FR-019); the "Show archived" toggle must not disturb `board-search-filter`'s own persistence or tag-selector behavior (Out of Scope).

**Scale/Scope**: 1 schema edit + 1 migration, 2 new server-side service functions, 2 new HTTP routes, 3 new MCP tool registrations + edits to 5 existing ones (`list-board`, `get-task`'s shared schema, `create-task`, `move-task`, `update-task`), 1 new client storage util, edits to 4 existing Vue components (`Board.vue`, `BoardFilterBar.vue`, `TaskCard.vue`, `TaskDetailPage.vue`); 3 new test files and 4 extended ones.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. **Result: PASS both times, no violations, Complexity Tracking left empty.***

| Principle | Status | How this plan satisfies it |
| --- | --- | --- |
| I. Spec is the source of truth | PASS | Driven by `docs/product/features/card-archive.md` → `spec.md`; every element of this plan traces to an FR/SC, and the spec's Out of Scope list (no bulk action, no card-face/board-view affordance, no dedicated archived page, no auto-archive, no change to `delete-card` or to `board-search-filter`'s own persistence) is respected with no speculative hooks for any of them. |
| II. Test-First (non-negotiable) | PASS | `tasks.md` orders every task failing-test-first: `archiveTask`/`unarchiveTask` service tests before the service code, `POST /api/tasks/:id/archive|unarchive` route tests before the routes, `list-board`/`archive-card`/`unarchive-card` MCP tests before the tool registrations, component assertions before the `TaskDetailPage.vue`/`Board.vue`/`TaskCard.vue`/`BoardFilterBar.vue` edits. |
| III. Evidence over assertion | PASS | US1, US2, US3, US5 have a UI surface → `browser-tester` screenshots into `docs/evidence/card-archive/`. US4 is MCP-only → recorded `vitest` output. `verifier` re-runs everything. Mapping and commands are in `quickstart.md`. |
| IV. Architecture constraints | PASS | TypeScript throughout; the MCP changes are `registerTool` additions/input-schema edits on the existing official-SDK server; no new framework, no new runtime dependency; nothing touches email ingestion; deployment unchanged. |
| V. Small vertical slices, trunk via PR | PASS | One feature, one branch, one PR, Conventional Commits. The slice is vertical (schema → service → HTTP route → MCP tool → UI) and the priority order (P1 archive, P1 reveal/restore, P2 filter parity, P2 MCP parity, P3 toggle persistence) lets US1+US2 ship as a coherent, independently demonstrable increment before US3–US5 layer on top. |
| Data & migrations | PASS, with one flagged, reviewed step | One schema change: `tasks.archived`, added as a `NOT NULL DEFAULT false` column. Per `research.md` R1 and `data-model.md`, this is expected to generate a single non-destructive `ALTER TABLE tasks ADD archived integer DEFAULT 0 NOT NULL` — metadata-only in SQLite, no table rebuild, every existing row defaults to `archived = false` with no data loss. The generated SQL must still be inspected before committing (CLAUDE.md's rule) since drizzle-kit's output is not hand-guaranteed until generated; if it ever proposes a rebuild instead of a plain `ADD`, that must be hand-adjusted or flagged to Tyler before merge, per CLAUDE.md — not expected here, but not silently assumed either. |

Post-Phase-1 re-check: the design added no framework, no new dependency, and the one schema change stays a single additive column with a documented non-destructive path — every row above still holds.

## Project Structure

### Documentation (this feature)

```text
specs/027-card-archive/
├── plan.md                      # This file
├── spec.md                      # Input
├── research.md                  # Phase 0 — R1..R7 decisions
├── data-model.md                # Phase 1 — schema, state transitions, service signatures
├── contracts/
│   ├── http-api.md                  # POST .../archive, .../unarchive, GET /api/board change
│   ├── mcp-tools.md                 # list-board includeArchived, archive-card, unarchive-card
│   └── board-archive-ui.md          # detail-view controls, filter-bar toggle, card dimming/badge
├── quickstart.md                # Phase 1 — how to validate + evidence capture
└── tasks.md                     # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── types.ts                       # EDIT — Task gains archived: boolean (propagates to BoardTask, TaskDetail)
├── server/
│   ├── db/
│   │   └── schema.ts                  # EDIT — tasks.archived column
│   ├── services/
│   │   └── tasks.ts                   # EDIT — archiveTask(), unarchiveTask(); listBoardTasksByLane already passes archived through
│   ├── routes/
│   │   └── tasks.ts                   # EDIT — POST /api/tasks/:id/archive, POST /api/tasks/:id/unarchive
│   └── mcp/
│       └── tools.ts                   # EDIT — taskSummarySchema gains archived; list-board gains includeArchived;
│                                       #        new archive-card / unarchive-card tools; archived threaded through
│                                       #        create-task / move-task / update-task / get-task structuredContent
└── client/
    ├── utils/
    │   └── board-archive-storage.ts   # NEW — readShowArchived()/writeShowArchived(), own localStorage key
    ├── components/
    │   ├── BoardFilterBar.vue         # EDIT — showArchived prop + update:showArchived emit, toggle control
    │   ├── Board.vue                  # EDIT — showArchived ref + persistence, layered archivedGatedLanes → visibleLanes
    │   └── TaskCard.vue                # EDIT — dimmed style + "Archived" badge when task.archived
    └── pages/
        └── TaskDetailPage.vue          # EDIT — archive/unarchive control swap, archiveError alert

drizzle/
└── 0005_<generated-name>.sql          # NEW — ALTER TABLE tasks ADD archived (generated by drizzle-kit generate)

tests/
├── unit/
│   └── board-archive-storage.test.ts       # NEW — read/write/clear + malformed-storage tolerance
├── integration/
│   ├── task-archive.test.ts                # NEW — archive/unarchive routes: success, 404, idempotent no-ops,
│   │                                        #        position-append on real transition, no position change on no-op,
│   │                                        #        notes/links/lane untouched, /api/board reflects archived flag
│   ├── mcp-read-tools.test.ts              # EXTEND — list-board includeArchived cases
│   └── mcp-archive-tools.test.ts           # NEW — archive-card / unarchive-card tool behavior + idempotency
└── component/
    ├── board.test.ts                       # EXTEND — Show archived toggle, dimmed/badge rendering, persistence,
    │                                        #           archived respects search/tag filter, toggle-off hides regardless
    ├── task-detail.test.ts                 # EXTEND — archive control → navigates to board; unarchive control →
    │                                        #           stays on page, swaps control back
    └── task-card.test.ts                   # EXTEND — dimmed class + badge only when task.archived
```

**Structure Decision**: the repo's existing single-package web-app layout (`src/client`, `src/server`, `src/shared`, tests split unit/integration/component) is used as-is, following the exact file layout `delete-card` and `board-search-filter` used for prior card-detail and board-filtering slices — no new directories, no new abstraction layer for what is fundamentally one boolean flag threaded through existing read/write paths.

## Design notes carried into `/speckit-tasks`

Ordered by the spec's user-story priorities, so each story is independently demonstrable:

1. **Foundation** — `tasks.archived` schema + migration; `Task` type gains `archived`; `archiveTask`/`unarchiveTask` in `services/tasks.ts`; `POST /api/tasks/:id/archive` and `.../unarchive` routes. Unblocks everything else.
2. **US1 (P1)** — `TaskDetailPage.vue` archive control: renders when not archived, calls the archive route with no confirmation, navigates to `/` on success (FR-001–FR-003).
3. **US2 (P1)** — `BoardFilterBar.vue`'s "Show archived" toggle (session-only for now — persistence is US5); `GET /api/board` starts returning archived cards flagged; `Board.vue`'s `archivedGatedLanes` layer; `TaskCard.vue`'s dimmed style + badge; `TaskDetailPage.vue`'s unarchive control (in-place state update, no navigation).
4. **US3 (P2)** — no new code path expected beyond US2's layering (`archivedGatedLanes` → existing `matchesBoardFilter` gate already composes correctly per `research.md` R2) — this story is primarily a test-coverage addition confirming the composition holds, not new implementation.
5. **US4 (P2)** — `list-board`'s `includeArchived` argument; `archive-card`/`unarchive-card` MCP tools; `archived` threaded through `taskSummarySchema` and every hand-built `structuredContent` mapping (`create-task`, `move-task`, `update-task`, `taskDetailContent`).
6. **US5 (P3)** — `board-archive-storage.ts`; wire `Board.vue`'s `showArchived` ref to it, mirroring the existing `board-filter-storage.ts` read-on-mount/write-on-change pattern.
7. **Evidence** — seed a small multi-lane board, run `browser-tester` for US1/US2/US3/US5, record MCP check output for US4, then `verifier`.

Two rules worth restating for the implementer, because both are easy to get subtly wrong:

- **Idempotency must not reposition.** `unarchiveTask` on an already-active task must return without touching `position` — only an actual `archived → active` transition recomputes it. Getting this backwards (always recomputing `max(position)+1` on every unarchive call) would silently reorder a card on a harmless double-click or stale-tab retry, breaking the edge case's "it stays active" guarantee.
- **The archived gate is structural, not a filter-predicate special case.** `matchesBoardFilter` (`src/shared/board-filter.ts`) stays completely untouched by this feature — the archived/not-archived decision happens one layer above it in `Board.vue` (`archivedGatedLanes`) and one layer above it in `list-board` (a `.filter()` before the existing `matchesBoardFilter` call). Do not add an `archived` parameter to `matchesBoardFilter` itself; that would conflate two independent gates the spec explicitly wants ordered (toggle first, then search/tag) and would force every existing caller of that shared predicate to reckon with a concern it doesn't need.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
