# Phase 0 Research: delete-card

No NEEDS CLARIFICATION markers remain in the Technical Context — the spec's Assumptions section already resolved the open questions (modal-style confirmation, hard delete, no new authz). This file records the technical decisions made while turning those assumptions into an implementation approach.

## Decision: Hard delete via a single `DELETE FROM tasks WHERE id = ?`, no new migration

- **Decision**: Add `deleteTask(db, id)` to `src/server/services/tasks.ts` that deletes the row from `tasks` directly. No schema change, no new migration file.
- **Rationale**: Every table that links off `tasks` — `task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations` — already declares `taskId: integer(...).references(() => tasks.id, { onDelete: 'cascade' })` (`src/server/db/schema.ts`), and the SQLite connection enables `foreign_keys = ON` at startup (`src/server/db/index.ts:14`). Deleting the `tasks` row therefore atomically removes the card's own links without touching `people` or `email_conversations`, which satisfies FR-007 and the edge case "deleting a card removes its links... but never the conversations or people themselves" for free.
- **Alternatives considered**:
  - *Manual cascading deletes in application code* (delete from each child table, then `tasks`) — rejected as redundant; the DB already enforces this, and hand-rolling it risks drifting from the FK graph as new task-linked tables are added.
  - *Soft delete (status flag)* — explicitly rejected by FR-011 and the spec's Assumptions ("hard delete at the data layer... not a status flag").

## Decision: New route `DELETE /api/tasks/:id`, no MCP tool

- **Decision**: Add `app.delete('/api/tasks/:id', ...)` to `src/server/routes/tasks.ts`, calling `deleteTask`. Add no corresponding MCP tool.
- **Rationale**: FR-009 explicitly forbids an MCP-exposed delete capability. The existing `list-board` and `get-task` MCP tools (`src/server/mcp/tools.ts`) read from the same `tasks` table the new route deletes from, so they reflect deletions immediately with no separate cache or projection to keep in sync — satisfying FR-008 (MCP visibility) without adding an MCP tool.
- **Alternatives considered**: *Route + MCP tool pair*, following the pattern of `move-task` (which has both a UI route and an MCP tool) — rejected because the spec explicitly scopes deletion to the web UI only for this slice (FR-009).

## Decision: Idempotent-safe delete response (404, not 500, on missing/already-deleted card)

- **Decision**: `deleteTask` returns a `DeleteTaskResult` discriminated union (`{ ok: true }` / `{ ok: false; error: 'task-not-found' }`), mirroring `deleteNote`/`unlinkPerson`'s existing pattern in the same file. The route returns 404 in the not-found case.
- **Rationale**: Covers the spec's edge case — confirming deletion on a card already deleted elsewhere (stale tab) must not error the user into a broken state. The client treats both a successful delete and a 404 as "the card is gone," and navigates back to the board either way.
- **Alternatives considered**: *Throwing/500 on missing row* — rejected; would surface a broken-state error for a race that the spec explicitly calls out as expected and must be handled gracefully.

## Decision: Confirmation as a new `DeleteCardConfirm.vue` modal component, opened from `TaskDetailPage.vue`

- **Decision**: New small component holding the modal markup (title, "can't be undone" warning, Cancel/Delete buttons), controlled by a `visible` ref in `TaskDetailPage.vue`. The delete control (button) sits in the header area next to the lane pills, matching the spec's Assumption that this reuses `move-task-from-detail-view`'s header layout.
- **Rationale**: Matches the existing pattern of extracting task-detail sub-UI into components (`LinkedPeople.vue`, `LinkedCompanies.vue`, `TaskNotes.vue`) rather than growing `TaskDetailPage.vue` inline. In-page modal (not `window.confirm()`) matches the spec's Assumption and the app's existing UI conventions.
- **Alternatives considered**: *Browser-native `confirm()`* — rejected per spec Assumptions (not consistent with existing UI patterns, and can't show styled warning copy naming the card).
