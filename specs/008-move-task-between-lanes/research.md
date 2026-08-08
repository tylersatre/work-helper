# Research: Move Task Between Lanes

**Feature**: `008-move-task-between-lanes` | **Date**: 2026-08-08

No NEEDS CLARIFICATION items remained in the Technical Context — the PRD interview (2026-08-08) resolved all product questions, and the codebase inspection resolved the technical ones. This document records the design decisions and their rationale.

## R1: Ordering model — integer `position` column, renumbered per move

**Decision**: Add `position: integer NOT NULL` to the `tasks` table. A task's order within its lane is `ORDER BY position ASC, id ASC` (the `id` tiebreak makes ordering deterministic even if positions were ever duplicated). Every move runs in a single transaction that rewrites positions: read the destination lane's ordered task ids, splice the moved task at the drop index, renumber that list 0..n-1, and — for cross-lane moves — renumber the source lane 0..n-1 as well so positions stay compact. New tasks get `max(position in first lane) + 1` (0 when empty), computed inside the existing `createTask` transaction.

**Rationale**: This is the simplest model that satisfies FR-003/FR-004/FR-005. The board is single-user with 4 lanes and at most hundreds of tasks, so rewriting one or two lanes' positions per move is a handful of row updates inside one synchronous better-sqlite3 transaction — there is no contention or scale pressure that would justify anything cleverer. Compact renumbering keeps the data trivially inspectable and makes "append at bottom" unambiguous.

**Alternatives considered**: Fractional/lexicographic ranking (insert between neighbors without renumbering) — rejected: exists to avoid write amplification under concurrency that this app doesn't have, and brings rebalancing edge cases. Linked-list (`prevTaskId`) ordering — rejected: fragile invariants, painful queries. Reusing `id`/`createdAt` order with no new column — rejected: cannot express manual order at all.

## R2: Schema change mechanism — edit base schema in place, squash the Drizzle baseline

**Decision**: Add `position` to `src/server/db/schema.ts`, then regenerate `drizzle/` as a single squashed baseline: delete the existing `drizzle/` migration folder (files `0000`–`0004` plus `meta/`) and run `npx drizzle-kit generate` once against the updated schema, producing a fresh `0000` baseline that creates the full current schema. Dev databases (`./data/work-helper.db` or `DATABASE_PATH`) are deleted and recreated on next startup. `tests/integration/migration-carry-over.test.ts` is removed: it replays the old migration file sequence to verify feature 005's data-preserving carry-over step, and both the files it replays and the obligation it verifies are gone under the current policy.

**Rationale**: The constitution's development-phase data policy (v1.1.0, amended 2026-08-07 — after the last migration landed) is explicit: "do not accumulate migration files: apply schema changes by editing the base schema in place and resetting/recreating the dev database freely." This is the first schema change since that amendment, so it sets the precedent: `schema.ts` is the source of truth and `drizzle/` is a derived single-file baseline regenerated on schema change. `createDb`'s `migrate()` call keeps working unchanged against the regenerated folder, and fresh databases (including every `:memory:` test database) are created directly from the new baseline, so no backfill for `position` is ever needed. Appending a `0005` migration instead would have violated the policy's letter for no benefit.

**Alternatives considered**: Generate an incremental `0005` ALTER TABLE migration — rejected: literally the accumulation the policy forbids, and it would force a default/backfill story for a column that fresh databases never need. Hand-edit the existing `0000` SQL in place — rejected: drifts from the `meta/` snapshots drizzle-kit diffs against, corrupting future generations. Keep the carry-over test by preserving old migration files as fixtures — rejected: preserves exactly the data-preserving machinery the policy says not to maintain, for data that does not exist.

**Visibility note for review**: this deletes five migration files and one green test from a prior feature. That is a deliberate consequence of the constitution amendment `bf39e60`, not collateral damage — called out here and in the Constitution Check so Tyler sees it at PR time.

## R3: Move API — `PUT /api/tasks/:id/placement`

**Decision**: One new endpoint, `PUT /api/tasks/:id/placement`, body `{ lane: string, index: number }`, where `index` is the 0-based slot in the destination lane counted with the moving card excluded (final-index semantics): for cross-lane moves this equals the visual slot at drop time; for within-lane moves the client computes the index over the lane's other cards, so the identical server-side splice is exact in both directions (upward and downward). Responses: `200` with the updated task summary (including final `lane` and `position`), `404` for an unknown task, `400` for a lane not in the configured lane list or a non-integer/negative index. An index beyond the end of the destination lane is clamped to append (robust if the client's view is momentarily stale). Dropping a card onto its own current slot is a valid no-op that returns 200.

**Rationale**: Placement (lane + slot) is a complete replacement of one task's board position, which is what PUT-on-a-subresource expresses; it stays clear of a future generic task-edit PATCH. The endpoint style matches the codebase's existing task subresource routes (`POST /api/tasks/:id/notes`, `POST /api/tasks/:id/people`). Server-side clamping plus whole-lane renumbering makes the operation idempotent and keeps FR-006's exactly-one-lane invariant enforceable in one transaction.

**Alternatives considered**: `PATCH /api/tasks/:id` with partial `{ lane, position }` — rejected: overloads a future edit endpoint and blurs validation. Board-level `PUT /api/board` replacing the full arrangement — rejected: heavier payloads, races between rapid drops, and it hides which task moved. Rejecting out-of-range index with 400 instead of clamping — rejected: turns harmless client staleness into user-visible errors.

## R4: Drag-and-drop — native HTML5 DnD, no new dependency

**Decision**: Implement drag-and-drop with the native HTML5 API: `draggable="true"` on `TaskCard`, `dragstart` sets the dragged task id, lanes handle `dragover` (computing the insertion index from the midpoints of the cards other than the one being dragged — final-index semantics per R3 — and showing a drop indicator) and `drop`, and `dragend` without a drop clears state leaving the board untouched. The insertion-index computation is extracted as a pure function so it can be unit-tested without a browser.

**Rationale**: The scope is desktop-mouse-only (FR-012), which is exactly the case native HTML5 DnD handles without help. FR-007 (release outside any lane changes nothing) falls out of the platform for free: no `drop` fires, `dragend` cleans up. Zero new dependencies keeps the constitution's stack constraints trivially satisfied and avoids adopting a library's styling and event model. Playwright (the browser-tester's driver) supports HTML5 drag-and-drop in Chromium via mouse-driven drags (`browser_drag` / `locator.dragTo`, with `page.dragAndDrop`/dispatched `DragEvent`s as a documented fallback if a between-cards drop needs finer targeting) — the browser-tester will validate this empirically as part of evidence collection.

**Alternatives considered**: `vue-draggable-plus` / SortableJS — rejected: a new runtime dependency plus an internal fallback/native event model that is harder to drive deterministically from test automation, for interaction polish (touch, ghosting, animation) this slice explicitly doesn't need. Custom pointer-event drag engine — rejected: reimplements cancel/ghost semantics the platform already provides and loses the free FR-007 behavior.

**Testing note**: jsdom does not implement `DataTransfer`/native drag event plumbing, so component tests assert rendering order, the pure drop-index function, and handler behavior with synthetic events carrying a stubbed `dataTransfer`; the real mouse-drag path is covered by browser-tester evidence, which is what the constitution requires anyway.

## R5: Persistence flow — optimistic UI, serialized saves, refetch-and-banner on failure

**Decision**: On drop, `Board.vue` applies the move to local state immediately (optimistic), then calls the placement endpoint. Save requests are serialized through a simple promise chain so rapid successive moves post in drop order. On a failed save (non-2xx or network error), the board refetches `/api/board` — restoring the last saved arrangement — and shows a visible error banner ("Couldn't save that move — the board has been restored.") that clears on the next successful move or dismissal. If the refetch itself fails (server unreachable), the banner still shows — the user is informed the move did not take — and the board re-syncs on the next successful load.

**Rationale**: Optimistic update keeps drag feel instant (Performance Goals) while the refetch-on-failure path satisfies the spec's edge case verbatim: the board never keeps showing a placement that won't survive reload, and the user can see the move didn't take. Serializing the saves makes "several moves in quick succession all persist" hold by construction — the server applies them in the same order the user made them. Single-user scope (per spec Assumptions) means no cross-session conflict handling is needed.

**Alternatives considered**: Save-then-render (pessimistic) — rejected: visible latency on every drop for no correctness gain at this scale. Client-side retry queue with rollback journal — rejected: complexity without a driving requirement; refetch is the simplest correct revert and the server is always the source of truth.

## R6: MCP surface — no new tools; additive `position` field; order via shared service

**Decision**: `list-board` keeps calling the shared `listTasksByLane`, so it inherits `(position, id)` ordering with zero MCP-specific logic — the UI and MCP literally cannot disagree (FR-010/SC-005). Additively, `taskSummarySchema` gains `position: z.number()`, and the `get-task`/`create-task` structured outputs include it, so agents see the order made explicit. No new tools, no write access to placement (stays in the `mcp-tool-expansion` stub per the PRD).

**Rationale**: Routing both consumers through one service function is the structural guarantee the spec asks for. Exposing `position` is a backward-compatible output-schema addition (existing clients ignore unknown fields), makes the ordering self-describing, and keeps `structuredContent` truthful now that task rows carry the column.

**Alternatives considered**: Omitting `position` from MCP outputs — rejected: array order alone satisfies FR-010, but the raw rows now contain the field and hiding it adds mapping code to keep payloads *less* informative. Duplicating ordering logic inside `tools.ts` — rejected: creates exactly the drift FR-010 exists to prevent.

## R7: Task detail lane display — read-only text, no control

**Decision**: `TaskDetailPage.vue` renders the task's lane as plain read-only text (e.g. a "Lane: Waiting" line near the title). No select, button, or other affordance to change it (FR-009). `GET /api/tasks/:id` already returns `lane`, so this is a pure UI addition.

**Rationale**: The PRD interview settled this: moving happens only on the board; the detail view just tells the truth. The component test asserts both the display and the absence of any lane-changing control.

**Alternatives considered**: None with substance — a lane dropdown on the detail page was explicitly ruled out in the PRD's out-of-scope list.

## Impacted existing tests (expectation updates, part of TDD in the tasks phase)

- `tests/integration/board.test.ts` — the "id ASC order" expectation becomes position-based; direct `db.insert(tasks)` seeding must now supply `position`.
- `tests/integration/tasks.test.ts` and `tests/integration/mcp-read-tools.test.ts` — task payload assertions gain `position`; seeding that moved tasks by raw `db.update(tasks).set({ lane })` should switch to the placement endpoint (or set positions explicitly) so fixtures reflect real arrangements.
- `tests/component/board.test.ts` — fixture tasks gain `position`; new assertions for drag behavior and failure revert.
- `tests/integration/persistence.test.ts`, `tests/component/task-card.test.ts`, `tests/component/task-detail.test.ts`, and `tests/integration/helpers/` — any direct task seeding or fixtures gain `position` (T009 performs the full sweep).
- `tests/integration/migration-carry-over.test.ts` — removed per R2.
