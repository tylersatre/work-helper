# Phase 1 Data Model: card-archive

## Schema change

One new column on the existing `tasks` table (`src/server/db/schema.ts`):

```ts
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  lane: text('lane').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false), // NEW
});
```

New numbered migration (next after `0004_warm_silver_surfer.sql`) generated via `npx drizzle-kit generate`, expected to be a single non-destructive statement:

```sql
ALTER TABLE `tasks` ADD `archived` integer DEFAULT 0 NOT NULL;
```

Every existing row becomes `archived = 0` (false) — see `research.md` R1. No hand-adjustment expected (metadata-only `ALTER TABLE ADD`, no table rebuild), but the generated SQL must be inspected before committing per CLAUDE.md's migration rule, and this migration file, once landed on `main`, is immutable.

## Entities touched

### Card (`tasks` table)

Gains `archived: boolean`, defaulting to `false`. `archived` is independent of `lane`, `position`, `title`, its notes, and every link table (`task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations`) — none of those tables or their cascade rules change.

### Entities explicitly NOT touched

`people`, `companies`, `tags`, `email_conversations`, `task_notes`, `task_people`, `task_tags`, `task_companies`, `task_conversations` — no column, row, or cascade rule changes anywhere outside `tasks.archived` (FR-008).

## State transitions

```
active (archived = false) --archive--> archived (archived = true)
archived (archived = true) --unarchive--> active (archived = false), position = max(position WHERE lane = this.lane) + 1
```

- `archive`: `active → archived`. Sets `archived = true` only. `lane` and `position` untouched (FR-003 — archiving behaves identically regardless of lane).
- `unarchive`: `archived → active`. Sets `archived = false` **and** `position` to one past the current lane-wide maximum (see `research.md` R3). `lane` untouched.
- `archive` on an already-archived card, or `unarchive` on an already-active card: no-op, returns success, no field changes (see `research.md` R4 — edge cases).

No other transitions exist; there is no intermediate/pending state (spec Assumptions: "synchronous, immediately-reflected actions with no pending/undo window").

## Shared types (`src/shared/types.ts`)

```ts
export interface Task {
  id: number;
  title: string;
  lane: string;
  position: number;
  createdAt: number;
  archived: boolean; // NEW
}
```

`BoardTask extends Task` and `TaskDetail extends Task` inherit `archived` with no further edits to those interfaces. `BoardFilter` is unchanged (R7 — the "Show archived" toggle is not part of `BoardFilter`).

## Service layer (`src/server/services/tasks.ts`)

```ts
export type ArchiveTaskResult = { ok: true; task: typeof tasks.$inferSelect } | { ok: false; error: 'task-not-found' };
export function archiveTask(db: AppDb, id: number): ArchiveTaskResult;

export type UnarchiveTaskResult = { ok: true; task: typeof tasks.$inferSelect } | { ok: false; error: 'task-not-found' };
export function unarchiveTask(db: AppDb, id: number): UnarchiveTaskResult;
```

- `archiveTask`: not-found → error; already `archived` → return current row unchanged; otherwise `UPDATE tasks SET archived = 1 WHERE id = ?`, reselect, return.
- `unarchiveTask`: not-found → error; already active → return current row unchanged; otherwise, inside a transaction, compute `position = (SELECT max(position) FROM tasks WHERE lane = task.lane) + 1` and `UPDATE tasks SET archived = 0, position = ? WHERE id = ?` (same `max(position)`-per-lane pattern `createTask` already uses), reselect, return.
- `listBoardTasksByLane(db, lane)`: unchanged query shape, its per-task result object gains `archived` (already a plain column on `tasks`, so `{ ...task, tags, searchText }` already carries it through — no new query needed).

## Validation rules

- Both `archiveTask`/`unarchiveTask` take only a numeric task id — no request body to validate, matching `deleteTask`'s contract.
- No new validation schema (`src/shared/validation.ts` unchanged).
