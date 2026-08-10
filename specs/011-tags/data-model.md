# Data Model: Tags

Schema additions to `src/server/db/schema.ts` (Drizzle, SQLite). Applied per the dev-phase policy in [research.md R9](./research.md#r9-schema-change-mechanics-dev-phase-policy): edit the base schema, regenerate the baseline migration, recreate the dev DB.

## Tables

### `tags`

| Column | Type | Constraints |
|---|---|---|
| `id` | integer | PK, autoincrement |
| `name` | text | NOT NULL; unique index on `lower(name)` (`tags_name_unique`) |
| `color` | text | NOT NULL; `#RRGGBB` hex string |
| `created_at` | integer | NOT NULL; epoch ms |

The most recently created tag — the row with the highest `id` (research.md R3) — drives auto-color cycling; `created_at` is bookkeeping metadata, not the recency key. Color is always a concrete hex value — "preset palette color" vs "custom color" is not a stored distinction.

### `person_tags`

| Column | Type | Constraints |
|---|---|---|
| `person_id` | integer | NOT NULL; FK → `people.id` ON DELETE CASCADE |
| `tag_id` | integer | NOT NULL; FK → `tags.id` ON DELETE CASCADE |

Composite primary key `(person_id, tag_id)` — a person carries at most one attachment per tag.

### `task_tags`

| Column | Type | Constraints |
|---|---|---|
| `task_id` | integer | NOT NULL; FK → `tasks.id` ON DELETE CASCADE |
| `tag_id` | integer | NOT NULL; FK → `tags.id` ON DELETE CASCADE |

Composite primary key `(task_id, tag_id)`.

## Shared types (`src/shared/types.ts`)

```ts
interface Tag { id: number; name: string; color: string }
interface TagWithCounts extends Tag { peopleCount: number; tasksCount: number }
```

- `Person` and `TaskDetail` gain `tags: Tag[]`, ordered by name case-insensitively (research.md R8). `Person` covers both the people list and person detail, so people-list rows get chips with no extra type.

## Validation rules (`src/shared/validation.ts`)

- `tagNameSchema`: string, trimmed, min length 1 → message "A name is required" (FR-002). Trimming happens before both storage and uniqueness checks.
- `tagColorSchema`: string matching `/^#[0-9a-fA-F]{6}$/` → message "A valid color is required" (defensive; the color picker only emits valid hex).
- Case-insensitive uniqueness is checked in the service (returning a typed `name-taken` error → 409 "That tag name is already in use") with the `lower(name)` unique index as backstop. A rename compares against all tags except the renamed tag's own id, so recasing a tag's own name is allowed.

## Relationships

- One tag ↔ many people (via `person_tags`) and many tasks (via `task_tags`) — one shared vocabulary (FR-001).
- Usage = `peopleCount + tasksCount`, computed by aggregate query, never stored. Tags-page order: usage descending, then `lower(name)` ascending (FR-009).

## State transitions

| Operation | Effect |
|---|---|
| Create (inline or Tags page) | Insert `tags` row with trimmed name and auto-assigned palette color (research.md R3); inline create also inserts the attachment row in the same transaction (FR-004). |
| Attach | Insert into `person_tags`/`task_tags`; `onConflictDoNothing` makes re-attaching a no-op. |
| Detach | Delete the single attachment row; the tag row and its other attachments are untouched (FR-007). |
| Rename | Update `tags.name` after validation; every surface reflects it because all reads join `tags` (FR-010). |
| Recolor | Update `tags.color`; same propagation (FR-011). |
| Delete tag | Delete the `tags` row; FK cascade removes all its attachment rows (FR-012). |
| Delete person/task | FK cascade removes that record's attachment rows; tags survive. |
