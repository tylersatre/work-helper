# Data Model: Create Task

**Feature**: `001-create-task` | **Date**: 2026-08-06

Two entities. Only **Task** is persisted; **Lane** exists solely in the configuration file (FR-007 — no lane management in the app).

## Task (persisted — `tasks` table, SQLite via Drizzle)

| Field       | Type                                  | Constraints                                        |
|-------------|---------------------------------------|----------------------------------------------------|
| `id`        | INTEGER PRIMARY KEY AUTOINCREMENT     | Assigned by the database                           |
| `title`     | TEXT NOT NULL                         | Stored trimmed; must be non-empty after trimming   |
| `lane`      | TEXT NOT NULL                         | Lane name; set by the server to the first configured lane at creation (FR-003) |
| `createdAt` | INTEGER NOT NULL (unix epoch ms)      | Set by the server at insert time                   |

**Validation rules** (authoritative on the server, shared with the client via the zod schema in `src/shared/validation.ts` — see research.md R7):

- `title`: required; rejected when empty or whitespace-only (FR-005, SC-003). Trimmed before storage. No maximum length (spec sets none); long titles are a rendering concern (wrap, don't break layout).
- Titles are **not** unique — identical titles create separate tasks (spec edge case).
- `lane` is never client-supplied in this feature — there is no lane picker (spec assumption); the server assigns the first configured lane.

**State transitions**: none. Tasks are create-only in this feature — no edit, move, or delete (FR-008).

**Ordering**: within a lane, tasks render in creation order (`id ASC`), so creating a task never reorders or alters existing cards (FR-006).

## Lane (configuration only — not persisted)

Defined by `config/lanes.json`: a JSON array of lane-name strings whose array order is the display order, left to right (FR-001). See `contracts/lanes-config.md` for the file contract.

| Property | Type   | Constraints                            |
|----------|--------|----------------------------------------|
| name     | string | Non-empty, unique within the file      |
| order    | —      | Implicit: position in the array        |

Deployment value: `["To Do", "In Progress", "Waiting", "Done"]`.

**Relationship**: `Task.lane` holds a lane name string. There is no foreign key — lanes are not database rows. Config renames/removals orphaning existing tasks are out of scope for this feature (spec assumption: a valid, stable configuration is in place).
