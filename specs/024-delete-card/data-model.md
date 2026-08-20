# Phase 1 Data Model: delete-card

No schema changes. This feature deletes rows using the existing model; it introduces no new tables, columns, or migrations.

## Entities touched

### Card (`tasks` table)

The entity this feature deletes. Unchanged shape — see `src/server/db/schema.ts`. Deletion is a row removal (`DELETE FROM tasks WHERE id = ?`), not a status/flag change (FR-011).

### Cascading children (deleted automatically, unchanged definitions)

These tables already declare `taskId` with `onDelete: 'cascade'` against `tasks.id`, and the app's SQLite connection runs with `foreign_keys = ON` (`src/server/db/index.ts:14`), so deleting a `tasks` row deletes the matching rows in each of these without any application-level fan-out code:

| Table | What it links | Deleted on card delete |
|---|---|---|
| `task_people` | card ↔ person | Yes (join row only — `people` row untouched) |
| `task_notes` | card's own notes | Yes (notes belong to the card, so this is expected data removal, not a "linked entity") |
| `task_tags` | card ↔ tag | Yes (join row only — `tags` row untouched) |
| `task_companies` | card ↔ company | Yes (join row only — `companies` row untouched) |
| `task_conversations` | card ↔ email conversation | Yes (join row only — `email_conversations`/`email_messages` untouched) |

### Entities explicitly NOT touched

- **`people`** — rows are never deleted or modified by this feature (FR-007, edge case).
- **`email_conversations`** / **`email_messages`** — rows are never deleted or modified by this feature (FR-007, edge case, US3).
- **`companies`**, **`tags`** — rows are never deleted or modified by this feature.

## State transitions

Card has no delete-related state field (no soft-delete flag exists or is introduced). Its lifecycle transition for this feature is: `exists (id present in tasks)` → `does not exist (row removed)`. There is no intermediate or reversible state (FR-011: no undo/trash/restore path).

## Validation rules

- The service function must confirm the card exists before attempting delete, returning a typed not-found result rather than throwing, so the route can respond 404 without a 500 (see `research.md` — idempotent-safe delete). This also covers the edge case of a stale detail view attempting to confirm deletion of an already-deleted card.
- No input validation beyond the numeric `id` route param — there is no request body for the delete endpoint.
