# Phase 1 Data Model: task-fields

## Schema change

Four new nullable columns on the existing `tasks` table (`src/server/db/schema.ts`):

```ts
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  lane: text('lane').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  dueDate: text('due_date'), // NEW — 'YYYY-MM-DD', no time component, nullable
  priority: text('priority', { enum: ['Low', 'Medium', 'High', 'Urgent'] }), // NEW — nullable
  effort: text('effort', { enum: ['S', 'M', 'L', 'XL'] }), // NEW — nullable
  description: text('description'), // NEW — markdown text, nullable
});
```

New numbered migration (next after `0006_silky_the_renegades.sql`) generated via `npx drizzle-kit generate`, expected to be four non-destructive statements:

```sql
ALTER TABLE `tasks` ADD `due_date` text;
ALTER TABLE `tasks` ADD `priority` text;
ALTER TABLE `tasks` ADD `effort` text;
ALTER TABLE `tasks` ADD `description` text;
```

Every existing row's four new columns become `NULL` (unset) — see `research.md` R1. No hand-adjustment expected (metadata-only `ALTER TABLE ADD`, no table rebuild, no `NOT NULL`/default to backfill), but the generated SQL must be inspected before committing per CLAUDE.md's migration rule, and this migration file, once landed on `main`, is immutable.

## Entities touched

### Task (`tasks` table)

Gains `dueDate: string | null`, `priority: 'Low' | 'Medium' | 'High' | 'Urgent' | null`, `effort: 'S' | 'M' | 'L' | 'XL' | null`, `description: string | null`, each independent of the others and of every existing column (`title`, `lane`, `position`, `archived`) and of every link table (`task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations`) — none of those tables or their cascade rules change.

### Entities explicitly NOT touched

`people`, `companies`, `tags`, `email_conversations`, `task_notes`, `task_people`, `task_tags`, `task_companies`, `task_conversations` — no column, row, or cascade rule changes anywhere outside the four new `tasks` columns.

## State transitions

Each of the four fields is independently one of two states, with no transition restrictions (FR-002):

```
unset (NULL) --set(value)--> set (value)
set (value)  --change(newValue)--> set (newValue)
set (value)  --clear(null)--> unset (NULL)
```

There is no cross-field dependency — clearing or setting one field never affects another, and none of the four fields interacts with `lane`, `position`, or `archived`.

## Shared types (`src/shared/types.ts`)

```ts
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskEffort = 'S' | 'M' | 'L' | 'XL';

export interface Task {
  id: number;
  title: string;
  lane: string;
  position: number;
  createdAt: number;
  archived: boolean;
  dueDate: string | null; // NEW
  priority: TaskPriority | null; // NEW
  effort: TaskEffort | null; // NEW
  description: string | null; // NEW
}
```

`BoardTask extends Task` and `TaskDetail extends Task` inherit the four fields with no further edits to those interfaces.

## Shared validation (`src/shared/validation.ts`)

```ts
export const taskPriorityValues = ['Low', 'Medium', 'High', 'Urgent'] as const;
export const taskEffortValues = ['S', 'M', 'L', 'XL'] as const;
export const taskPrioritySchema = z.enum(taskPriorityValues);
export const taskEffortSchema = z.enum(taskEffortValues);
```

`dueDate` and `description` have no dedicated schema — accepted as plain strings (or `null` to clear), per `research.md` R2. `taskPriorityValues`/`taskEffortValues` are the single source of truth for the option lists, consumed by the `NSelect` option arrays on the client and the `z.enum(...)` schemas on both the MCP tool input schemas and the HTTP route.

## Service layer (`src/server/services/tasks.ts`)

```ts
export function createTask(
  db: AppDb,
  lanes: string[],
  rawTitle: unknown,
  rawNote?: unknown,
  source: 'ui' | 'mcp' = 'ui',
  rawLane?: string,
  rawFields?: { dueDate?: unknown; priority?: unknown; effort?: unknown; description?: unknown }, // NEW
): typeof tasks.$inferSelect;
```

- `rawFields` is optional; each of its four keys, if present and non-blank, is validated (`priority`/`effort` via `taskPrioritySchema`/`taskEffortSchema`; `dueDate`/`description` accepted as-is per R2) and stored on the inserted row. Omitted or blank keys leave the column `NULL`, matching FR-003's "leaving them blank MUST create the task successfully with all four fields unset."

```ts
export type UpdateTaskInput = {
  title?: string;
  dueDate?: string | null;
  priority?: TaskPriority | null;
  effort?: TaskEffort | null;
  description?: string | null;
};
export type UpdateTaskResult = { ok: true; task: typeof tasks.$inferSelect } | { ok: false; error: 'task-not-found' | 'invalid-title' };
export function updateTask(db: AppDb, taskId: number, input: UpdateTaskInput): UpdateTaskResult;
```

Replaces `updateTaskTitle` (its only caller, the MCP `update-task` tool, moves to this function — see `research.md` R4). Behavior:

- Not found → `{ ok: false, error: 'task-not-found' }`.
- `input.title !== undefined` → validated via the existing `titleSchema`; invalid (empty/whitespace) → `{ ok: false, error: 'invalid-title' }`, no partial write.
- For each of `dueDate`/`priority`/`effort`/`description`: key absent from `input` → column untouched; key present with `null` → column cleared; key present with a value → column set to that value. Enum values for `priority`/`effort` are assumed already valid by this point (gated upstream — see `research.md` R5); this function does not re-validate them.
- Builds a single `db.update(tasks).set(patch).where(eq(tasks.id, taskId)).run()` covering only the keys actually present in `input` (an empty `input` is a no-op read-back, not an error).

`listTasksByLane`/`listBoardTasksByLane`/`getTaskDetail`: unchanged query shape — `db.select().from(tasks)` already selects every column, so `{ ...task, tags, searchText }` and `{ ...task, people, notes, ... }` already carry the four new fields through with no new query needed.

## HTTP routes (`src/server/routes/tasks.ts`)

- `POST /api/tasks` — body gains four optional keys: `{ title, note?, dueDate?, priority?, effort?, description? }`, forwarded into `createTask`'s new `rawFields` parameter.
- `PATCH /api/tasks/:id` (**NEW**) — body `{ dueDate?: string | null; priority?: string | null; effort?: string | null; description?: string | null }` (never `title` — no UI control for renaming, per FR-014/Assumptions). Validates `priority`/`effort` (if non-null) against `taskPrioritySchema`/`taskEffortSchema`, 400 on failure. Calls `updateTask`; 404 if not found; 200 with the updated row on success.

See `contracts/http-api.md` for full request/response shapes.
