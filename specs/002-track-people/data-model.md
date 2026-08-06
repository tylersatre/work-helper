# Data Model: Track People

**Branch**: `002-track-people` | **Date**: 2026-08-06

Storage is SQLite via Drizzle ORM (`src/server/db/schema.ts`), migrated by drizzle-kit files in `drizzle/` applied at startup. Decisions referenced as R1–R8 live in [research.md](./research.md).

## Entity: Person (`people` table) — NEW

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | integer | PK, autoincrement | |
| `first_name` | text | NOT NULL | Stored trimmed; never blank (V1) |
| `last_name` | text | NOT NULL | Stored trimmed; never blank (V1) |
| `email` | text | NULL | Trimmed; blank/whitespace input normalized to `NULL` (V2); original case preserved |
| `phone` | text | NULL | Trimmed; blank/whitespace input normalized to `NULL` |
| `extra_fields` | text (JSON) | NOT NULL DEFAULT `'{}'` | `Record<string, string>`; keys = configured labels, values trimmed non-empty (R2) |
| `created_at` | integer | NOT NULL | Epoch ms, matches `tasks.created_at` idiom |

**Indexes**

- `people_email_unique`: UNIQUE partial expression index on `lower(email)` `WHERE email IS NOT NULL` — DB backstop for V3 (R3).

**Validation rules** (Zod in `src/shared/validation.ts`, enforced by the service on create and update alike — FR-003, FR-004, FR-007):

- **V1 — names required**: `first_name` and `last_name` must be non-empty after trimming; violation → "First and last name are required" (400).
- **V2 — blank normalization**: `email` and `phone` are trimmed; empty-after-trim becomes `NULL`. No email format rule (R8).
- **V3 — email uniqueness**: a non-NULL email must not equal another person's non-NULL email case-insensitively (own record excluded); violation → "That email is already in use" (409). NULLs never conflict.
- **V4 — extra fields**: `extra_fields` keys not present in the current field configuration are stripped; values are trimmed and blank values dropped. Always optional — an empty map is valid.

**API shape** (`Person` in `src/shared/types.ts`):

```ts
interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  extraFields: Record<string, string>; // filtered to currently configured keys
  createdAt: number;
}
```

## Entity: Task–person link (`task_people` table) — NEW

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `task_id` | integer | NOT NULL, FK → `tasks.id` ON DELETE CASCADE | |
| `person_id` | integer | NOT NULL, FK → `people.id` ON DELETE CASCADE | |

- **Primary key**: composite (`task_id`, `person_id`) — at most one link per pair is a schema invariant (FR-014, R6).
- Unordered and unroled; no other columns (spec: Key Entities).
- Requires `PRAGMA foreign_keys = ON` in `createDb()` (R3) so deleting a person cascades to its links (FR-008) — and deleting a task, if a future feature adds that, cannot orphan links either.

## Entity: Field configuration (`config/person-fields.json`) — NEW, not a table

File-based per FR-011 (no in-app management), loaded at startup (R1).

- **Format**: JSON array of extra field labels, e.g. `["Nickname"]`. `[]` is valid (no extra fields).
- **Validation** (fail-fast at startup, mirroring `lanes-config.ts`): entries non-empty after trimming; unique case-insensitively; none may equal a built-in label ("First name", "Last name", "Email", "Phone") case-insensitively.
- **Relationships**: labels are the keys of `people.extra_fields` (R2). Removing a label from the config hides (does not delete) stored values; adding one surfaces an empty optional input everywhere (FR-009, FR-010).

## Entity: Task (`tasks` table) — EXISTING, unchanged

No column changes. The feature adds read access (`GET /api/tasks/:id`) and the `task_people` association; title/lane/createdAt stay read-only in the detail view (FR-016) and card rendering is untouched (FR-017).

## Relationships

```text
tasks 1 ──── * task_people * ──── 1 people
              (composite PK,
               CASCADE both ways)

config/person-fields.json ──labels──► people.extra_fields keys
```

## State transitions

People have no status field; the only lifecycle is create → edit* → delete, with delete permanent (spec assumption) and cascading to `task_people` rows (SC-006). Links have create (idempotent) → remove (idempotent) — see R6.

## Ordering rule (applies to every people listing)

`ORDER BY last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC` (R7) — directory (FR-001), search results (R5), and each task's linked-people list (R6) all use it.
