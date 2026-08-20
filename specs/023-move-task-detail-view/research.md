# Phase 0 Research: Move Task from Detail View

No NEEDS CLARIFICATION markers remained in the Technical Context — the stack is fully established by the codebase and the spec's Assumptions section resolves the open product questions (reuse the existing move operation; no new visual pattern; no confirmation/toast/animation; no mobile design pass). Research therefore located the in-repo precedent for each remaining design decision so the feature mirrors proven patterns.

## D1. Ordered lane list for the frontend: extend `GET /api/tasks/:id`, not a new endpoint

**Decision**: The `GET /api/tasks/:id` handler in `src/server/routes/tasks.ts` merges `lanes: app.lanes` into its response — `return { ...task, lanes: app.lanes };` — the same one-line pattern `routes/board.ts` already uses (`lanes: app.lanes.map(...)`). `TaskDetail` (`src/shared/types.ts`) gains `lanes: string[]`.

**Rationale**: `app.lanes: string[]` is already decorated onto every Fastify request handler (`src/server/app.ts:75`) in configured order — the exact order FR-001 requires. `TaskDetailPage.vue` already fetches this endpoint on mount and has nowhere else to get lane order from; it does not fetch `/api/board` today. Piggybacking the field on the endpoint the page already calls needs zero new network round trips and zero new route.

**Alternatives considered**: Fetching `/api/board` from the detail page to derive lane names (rejected — pulls every task in every lane just to read lane names, and couples the detail page to the board's full response shape for one field); a dedicated `GET /api/lanes` endpoint (rejected — no other consumer needs lane names in isolation; `app.lanes` is already free to read in any handler, so a new route is pure ceremony for one field).

## D2. Bottom-of-lane placement: reuse the placement endpoint's existing clamp, unchanged

**Decision**: The pill click handler calls the existing `PUT /api/tasks/:id/placement` with `{ lane: targetLane, index: Number.MAX_SAFE_INTEGER }`. No change to the route, its Zod validation (`placementIndexSchema`), or `moveTask()` in `src/server/services/tasks.ts`.

**Rationale**: `moveTask()` already clamps `targetIndex` via `Math.max(0, Math.min(targetIndex, destinationIds.length))`, so an oversized index lands at the bottom — this exact mechanism is what the `move-task` MCP tool already relies on when `position` is omitted (`src/server/mcp/tools.ts`, `targetIndex = position === undefined ? Number.MAX_SAFE_INTEGER : position - 1`), and it is already proven at the HTTP layer by `tests/integration/tasks.test.ts`'s "clamps an index past the end of the destination lane to append" case. FR-004 ("place the task at the bottom... matching the default position used by drag-and-drop and the existing MCP move tool") is satisfied by construction — all three entry points funnel through the identical clamp, so there is no independent "bottom of lane" logic to write or diverge.

**Alternatives considered**: Extending the HTTP route to accept an omitted/optional `index` like the MCP tool's optional `position` (rejected — touches an existing endpoint's contract and its validation branch for no requirement that needs it; `Number.MAX_SAFE_INTEGER` already gets the identical clamped result with zero backend changes); computing `destinationLane.tasks.length` client-side and passing that as the index (rejected — would require the detail page to also fetch `/api/board` per D1's rejected alternative, just to count tasks in the target lane).

## D3. Update strategy on click: await-then-apply, not optimistic-apply-then-reconcile

**Decision**: The pill click handler calls `PUT .../placement`, awaits the response, and on success sets `task.value.lane` / `task.value.position` from the response body (or refetches the task). On failure (`!response.ok` or a thrown fetch), it sets an inline error message and leaves `task.value` untouched. This mirrors the tag attach/detach pattern already in `TaskDetailPage.vue` (`attachTag`/`detachTag`: await, apply from response on success, set `tagError` and leave state alone on failure).

**Rationale**: Spec edge case 2 requires that "if a move fails to save, the pill row must not show the destination lane as current — it must reflect the card's actual last-saved lane." Never marking a pill current until the server confirms the move satisfies this by construction — there is no optimistic state to roll back. `Board.vue`'s drag-and-drop uses optimistic-apply + refetch-the-whole-board-on-failure instead, but that complexity exists because dragging changes the *board's* rendered order immediately and multiple concurrent drops must reconcile against one shared board view; the detail view renders exactly one task, so there is nothing to keep visually responsive ahead of the server's answer and no shared-state reconciliation problem to solve.

**Alternatives considered**: Board.vue's optimistic-apply-then-refetch-on-failure pattern (rejected — solves a problem the single-task detail view doesn't have, and reintroduces the exact "shows the destination as current before it's confirmed" state edge case 2 forbids); a toast/banner on failure instead of inline text (rejected — Assumptions explicitly rule out added toast notifications beyond the pill row updating; the existing `tagError`-style inline `role="alert"` text is the established precedent for this exact page).

## D4. Rapid re-click sequencing: discard stale responses, don't queue or disable

**Decision**: A local ref tracks the most recently issued move's target lane (or a bumped sequence counter). Each pill click fires its own independent `PUT .../placement` immediately (pills stay enabled). When a response arrives, it is only applied to `task.value` if it still matches the latest issued request; a response for a superseded click is discarded.

**Rationale**: Edge case 3 — "clicking a different pill again before a prior move has finished saving resolves to the last-clicked lane once saving settles — no lost or duplicated moves" — describes exactly this: the last click should win, and it explicitly treats clicking again *before* the first settles as expected behavior, not something to prevent. Each click is a real, independent move to a specific lane (not a toggle), so firing multiple requests is safe — `moveTask()` is not additive; the last one to actually apply determines the final lane. Guarding only the *response application* (ignore anything but the latest request's result) is the minimal mechanism that satisfies "no lost or duplicated moves" without adding a save queue.

**Alternatives considered**: Disabling all pills while a save is in flight (rejected — contradicts edge case 3's framing of a second click during an in-flight save as a normal, supported interaction, not a blocked one); `Board.vue`'s `saveChain`-style serialized queue with a `pendingSaves` counter and batch failure banner (rejected — that machinery exists to reconcile a shared board view across concurrent multi-card drops; a single pill row has no analogous shared-state problem, so a "latest request wins" guard is sufficient).

## D5. Visual language: link-blue-tint "current" pill over "contained control" others

**Decision**: The current-lane pill uses the app's established blue-tint "current/selected" convention — background `rgba(59, 130, 246, 0.2)`-family tint with `--wh-link-hover` text (the same tokens `ContactEntryList.vue`'s "Primary" marker already uses) — and is a disabled, non-clickable element (FR-002: "MUST NOT act as a move target when clicked"). Non-current pills use the app's generic "contained control" look (`background: var(--wh-surface); border: 1px solid var(--wh-border-subtle);`, matching `.contact-entry-row`/`.person-row`) and are enabled, clickable buttons.

**Rationale**: The spec's Assumptions section defers exact styling to implementation but requires following "this app's existing UI conventions (palette tokens, card-contained styling) rather than introducing a new visual pattern." `ContactEntryList.vue`'s primary-marker styling is the closest existing precedent for "one item in a list is visually marked as current, others are click targets to become current," and it already references palette-derived tokens (`--wh-link-hover` is `palette.linkHover`), keeping the AA-contrast guarantee `tests/unit/palette.test.ts` enforces. Rendering every pill as the same `<button>` element (disabled for current, enabled for others) rather than splitting current into a `<span>` keeps the markup and its tests simple, and a disabled button is a native, well-understood way to satisfy "must not act as a move target when clicked."

**Alternatives considered**: A `<span>` for the current pill and `<button>` for the rest (rejected — two element types for what is visually one control type adds markup branching for no behavioral gain over `disabled`); introducing a new color/token for "current" (rejected — the spec explicitly asks for existing conventions, and the link-blue tint is already the app's one "this is the selected one" language).

## D6. Placement in the page: inline in `TaskDetailPage.vue`, no new component

**Decision**: The pill row replaces `<p data-testid="task-lane">Lane: {{ task.lane }}</p>` directly in `TaskDetailPage.vue`'s template, with its click handler and request logic as local `<script setup>` functions — no new Vue component file.

**Rationale**: FR-001 requires the pills to render "directly under the card title... with no added section header," i.e. it replaces one inline line, not a new page section like the Emails/Cards sections `020-card-email-links` added (which justified new `LinkedConversations.vue`/`LinkedCards.vue` components because each was a distinct, independently-testable list section with its own empty state and navigation). The lane-pill row has no empty state, no navigation, and a handful of lines of markup — comparable in size to the tag-chip rendering already inline in the same file, which the codebase does not factor into its own component either.

**Alternatives considered**: A new `LanePills.vue` component (rejected — no reuse site exists elsewhere in the app; the control is tightly coupled to this one page's task-detail state and error handling, and the codebase's convention is to extract a component only when a section has its own list/empty-state/navigation shape, per D7 of `020-card-email-links`'s research).

## D7. MCP surface: no changes

**Decision**: `move-task` and `list-board` in `src/server/mcp/tools.ts` are untouched. User Story 2's acceptance test drives a move the same way the pill row does (`PUT /api/tasks/:id/placement`) and asserts the result via the existing `list-board` tool, following the `boardOrderViaListBoard()` helper pattern already established in `tests/integration/mcp-move-tools.test.ts`.

**Rationale**: FR-008/FR-009 require that a pill-driven move is visible through the *existing* `list-board` tool with "no new MCP tools... and no existing MCP tool's behavior changes." Since the pill row calls the same `PUT .../placement` → `moveTask()` path drag-and-drop already uses, and `list-board` already reads live task state (`listTasksByLane`, ordered `position asc, id asc`), there is nothing to add — the existing tool already sees whatever the database holds, regardless of which HTTP entry point wrote it.

**Alternatives considered**: None viable — inventing any MCP-side change would directly violate FR-009.
