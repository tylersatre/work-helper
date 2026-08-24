# Phase 0 Research: card-archive

No open technology unknowns — this feature extends the existing Fastify + Drizzle/SQLite + Vue 3 + `@modelcontextprotocol/sdk` stack with no new dependency. What follows resolves the design questions the spec leaves to `/speckit-plan`.

## R1 — Where does `archived` live, and how does it migrate?

- **Decision**: Add `archived: integer('archived', { mode: 'boolean' }).notNull().default(false)` to the `tasks` table in `src/server/db/schema.ts`, generated via `npx drizzle-kit generate` during `/speckit-implement` (per Constitution IV / CLAUDE.md — migrations are written alongside the schema edit, test-first).
- **Rationale**: SQLite's `ALTER TABLE tasks ADD COLUMN archived integer NOT NULL DEFAULT 0` is a metadata-only operation — it does not rebuild the table or touch existing rows' other columns, so every pre-existing task becomes `archived = false` with zero data loss. This is the same non-destructive `ALTER TABLE ... ADD` shape already used for `people.company_id` in `drizzle/0003_dazzling_eternity.sql`.
- **Alternatives considered**: A separate `archived_cards` table (log of archive events) — rejected, the spec explicitly says "not a separate archive log or history" (Assumptions). A nullable `archivedAt` timestamp instead of a boolean — rejected, spec says no requirement to track *when*/by *whom*, and a boolean is the simplest thing that satisfies every FR; introducing a timestamp would be unrequested scope.

## R2 — How does the board API expose archived cards to the UI vs. to MCP?

- **Decision**: `GET /api/board` (and its underlying `listBoardTasksByLane`) always returns every task in a lane — active and archived — each now carrying `archived: boolean`. The client decides visibility (`showArchived` toggle), exactly the same shape `board-search-filter` already established for `filter.text`/`filter.tagIds`: fetch the full enriched payload once, filter client-side. The MCP `list-board` tool, which has no client-side filtering step of its own, instead gains an explicit `includeArchived` input argument (mirroring its existing `search`/`tags` arguments) and applies the gate server-side before `matchesBoardFilter`.
- **Rationale**: This reuses `board-search-filter`'s established pattern instead of inventing a second one — `Board.vue` already fetches the whole board and filters locally per keystroke; adding a second client-local gate (`showArchived`) ahead of the existing `matchesBoardFilter` gate is a one-line addition to the existing `visibleLanes` computed, and requires no new network round trip when the toggle flips (matches SC-002's spirit of instant results, and the edge case that toggling `Show archived` with nothing archived "changes nothing visible" with no extra fetch/flicker). MCP has no persistent client state to filter locally against, so it needs its own explicit argument, exactly like `list-board` already does for `search`/`tags` (FR-013).
- **Alternatives considered**: A `?includeArchived=1` query param on `GET /api/board`, refetching on toggle — rejected as an unnecessary network round trip and a second, inconsistent filtering model on the same endpoint that already does client-side filtering for everything else.

## R3 — Ordering semantics: "normal manual-order position" and "bottom of its original lane"

- **Decision**: `archived` never changes `lane` or `position` by itself. Archiving leaves `position` untouched, so when `Show archived` is on, an archived card renders interleaved with active cards in that lane at its pre-existing `position`, exactly as FR-006 requires. Unarchiving computes `position = max(position WHERE lane = task.lane) + 1` over **all** tasks in the lane (archived and active alike) — the same unfiltered `max(position)` query `createTask` already uses — so the card lands after everything currently in that lane, visually "the bottom" whether or not archived cards are shown.
- **Rationale**: Using the lane-wide max (not just active tasks' max) guarantees FR-009's "bottom of its original lane" holds in both views: if an archived card sits at a stale high `position` from before other cards were reordered, computing max over the whole lane still puts the freshly unarchived card after it.

## R4 — Idempotency on the edge cases

- **Decision**: `archiveTask(db, id)` on an already-archived task is a no-op that still returns `{ ok: true, task }` (current row, no `UPDATE` needed). `unarchiveTask(db, id)` on an already-active task is likewise a no-op — it returns `{ ok: true, task }` **without** recomputing or moving `position`. Only an actual archived→active transition appends to the bottom.
- **Rationale**: The edge cases only require "must not error — it stays archived / stays active" — they say nothing about repositioning on a no-op call, and the spec is explicit elsewhere that "archiving or unarchiving a card does not change its... manual position... until unarchive appends it at the bottom" (Edge Cases) — "until" ties the append strictly to the transition, not to every unarchive call regardless of prior state. Re-appending on a no-op unarchive (e.g., a doubled click from a stale tab) would silently reorder a card the user didn't intend to touch.

## R5 — MCP field surface: does `archived` show up everywhere a task does?

- **Decision**: `archived: boolean` is added once to the shared `Task` interface (`src/shared/types.ts`) and once to the MCP `taskSummarySchema` object in `src/server/mcp/tools.ts`. Because `BoardTask`, `TaskDetail`, and `taskDetailOutputSchema` already extend/spread those two definitions, every existing read surface (`get-task`, `list-board`, `GET /api/tasks/:id`, `GET /api/board`) starts honestly reporting archived state with no bespoke per-tool schema. Every place that currently hand-maps a task row into `structuredContent` (`create-task`, `move-task`, `update-task`, `list-board`, `taskDetailContent`) gets one added field: `archived: task.archived`.
- **Rationale**: `archived` is now a core, always-present attribute of a task, the same status as `lane` or `position` — treating it as anything less (e.g., omitting it from `get-task`, or bolting on a one-off `boardTaskSummarySchema` just for `list-board`) would special-case a field that every other Task-shaped output already carries structurally. This costs one field per existing mapping, no new tool surface beyond what FR-013/FR-014 already require.
- **Alternatives considered**: A separate `boardTaskSummarySchema` used only by `list-board` — rejected as an unjustified fork of `taskSummarySchema` for a field that belongs on every task.

## R6 — Drag-and-drop of an archived card when "Show archived" is on

- **Decision**: Unchanged — an archived card rendered with `Show archived` on remains draggable exactly like an active card (`TaskCard.vue`/`Lane.vue` get no archived-specific drag branch).
- **Rationale**: Archiving and dragging are orthogonal state changes (position vs. archived flag); nothing in the spec's Functional Requirements, Edge Cases, or Out of Scope restricts dragging an archived card, and FR-017 only forbids adding an archive/unarchive *affordance* to the card face or board — it says nothing about existing drag affordances. Special-casing drag for archived cards would be unrequested scope in a feature that is otherwise a minimal vertical slice.

## R7 — Where does the "Show archived" toggle's persistence live?

- **Decision**: A new, independent `localStorage` key (`wh.board.showArchived`) via a new tiny util `src/client/utils/board-archive-storage.ts`, mirroring the read/write/try-catch shape of `board-filter-storage.ts` but kept as its own file and its own key — not folded into `BoardFilter`.
- **Rationale**: The spec's Out of Scope section is explicit: "Changes to `board-search-filter`'s tag selector or its own persistence mechanism — the `Show archived` toggle is a new, independent control alongside it." Extending the `BoardFilter` type/storage to carry a third field would blur that boundary and couple two independently-owned features' persistence.
