# Phase 1 Data Model: MCP Note, Tag & Task Tools

No schema change. Every table below already exists in `src/server/db/schema.ts`, shipped by the `task-notes` and `tags` features. This document records the subset of each table's shape this feature reads or writes, plus the two MCP-level identifier shapes this feature introduces (not database concepts — resolution logic only).

## Existing entities this feature acts on

### Task (`tasks`)

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | Target of `update-task`. |
| `title` | text, not null | Written by `update-task` via `titleSchema` (trimmed, non-empty). |
| `lane`, `position`, `createdAt` | — | Unchanged by this feature. |

No new fields. `update-task` is a single-field write (`title` only) — see research.md R3.

### Task note (`task_notes`)

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | Target of `delete-note`; globally unique, no task-scoping needed to identify one. |
| `taskId` | FK → `tasks.id`, `onDelete: cascade` | Read to report which task a deleted note belonged to; not an input to `delete-note`. |
| `text`, `source`, `createdAt` | — | Unchanged; delete-only through this feature (no edit-in-place, per spec Key Entities). |

**Lifecycle relevant to this feature**: delete-only. A note is removed by `delete-note`; no other mutation exists for notes in this feature.

### Tag (`tags`)

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | One of two ways to identify a tag (the other is `name`). |
| `name` | text, not null, unique case-insensitively (`uniqueIndex(sql\`lower(name)\`)`) | Written by `create-tag` (required) and `rename-tag`; read by every tool that resolves a tag by name. |
| `color` | text, not null | Written by `create-tag` (optional — auto-assigned via `nextTagColor` if omitted) and `recolor-tag` (required); hex format `^#[0-9a-fA-F]{6}$` per `tagColorSchema`. |
| `createdAt` | integer | Unchanged; used to seed `nextTagColor`'s "last created color" rotation. |

**Validation rules** (unchanged from the existing `tags` feature, reused as-is):
- Name required, trimmed, min length 1.
- Name unique case-insensitively across all tags (enforced both at the DB uniqueIndex level and pre-checked in `createTag`/`updateTag` for a friendly error).
- Color must match `#RRGGBB` hex.

**Lifecycle relevant to this feature**: create (`create-tag`), rename (`rename-tag`, name only), recolor (`recolor-tag`, color only), delete (`delete-tag`, cascades to `person_tags`/`task_tags` via `onDelete: cascade` — deleting the neighbors' *links*, never the person/task/company records themselves).

### Tag attachment: `person_tags` / `task_tags`

| Table | Columns | Notes |
|---|---|---|
| `person_tags` | `(personId, tagId)` composite PK, both FK `onDelete: cascade` | Written by `attach-tag`/`detach-tag` when the target is a person. |
| `task_tags` | `(taskId, tagId)` composite PK, both FK `onDelete: cascade` | Written by `attach-tag`/`detach-tag` when the target is a task. |

**Lifecycle relevant to this feature**:
- Attach: insert with `onConflictDoNothing()` — attaching an already-attached tag is a no-op (FR-018), not an error.
- Detach: delete the one `(recordId, tagId)` row — never touches the tag row itself or any other record's attachment to the same tag (FR-019).
- Cascade delete: deleting a tag (`delete-tag`) removes all of its `person_tags`/`task_tags` rows automatically via `onDelete: cascade`; this feature's `delete-tag` tool counts those rows *before* the delete to report them in its response (FR-013), since the cascade makes them unreadable after.

## MCP-level identifier shapes (not persisted — resolution logic only)

These are input shapes for tool parameters, not new database concepts. They describe how a tool call identifies "which tag" or "which record" without introducing a new entity.

### TagIdentifier

A tag is identified by **exactly one** of:
- `tagId: number` — resolved by primary key.
- `tagName: string` — resolved via the same case-insensitive match used by the `tags` feature's uniqueness check (`lower(name) = lower(:name)`).

Used by: `rename-tag`, `recolor-tag`, `delete-tag`, `attach-tag`, `detach-tag`. Resolution never creates a tag (research.md R4) — an unresolvable `TagIdentifier` is a `tag-not-found` error (or `invalid-name` if `tagName` is empty/whitespace).

### AttachTarget

A record to attach/detach a tag on is identified by **exactly one** of:
- `taskId: number` — resolved against `tasks.id`.
- `personId: number` — resolved against `people.id`.

Used by: `attach-tag`, `detach-tag`. Supplying both or neither is a validation error, checked before tag resolution (research.md R9). An unresolvable `AttachTarget` is a `task-not-found`/`person-not-found` error as appropriate.

## State transitions

None of these entities have a status/lifecycle state machine. Every mutation in this feature is a direct field write, insert, or delete — no intermediate states, no soft-delete, no async processing.

## Service-layer additions (implementation-level, not new persisted shapes)

Recorded here for continuity into `/speckit-tasks`; see research.md for rationale.

| Function | File | Returns |
|---|---|---|
| `deleteNoteById(db, noteId)` | `src/server/services/tasks.ts` | `{ ok: true; taskId: number } \| { ok: false; error: 'note-not-found' }` |
| `updateTaskTitle(db, taskId, rawTitle)` | `src/server/services/tasks.ts` | `{ ok: true; task } \| { ok: false; error: 'task-not-found' \| 'invalid-title' }` |
| `resolveExistingTag(db, input: TagIdentifier)` | `src/server/services/tags.ts` | `{ ok: true; tag: TagRecord } \| { ok: false; error: 'tag-not-found' \| 'invalid-name' }` |
| `deleteTagByIdentifier(db, input: TagIdentifier)` | `src/server/services/tags.ts` | `{ ok: true; name: string; peopleDetached: number; tasksDetached: number; companiesDetached: number } \| { ok: false; error: 'tag-not-found' \| 'invalid-name' }` — also counts `company_tags` rows before the cascade delete, since a tag can be attached to a company too and the response would otherwise misreport `0` for that surface |
| `createTag(db, rawName, rawColor?)` (extended signature) | `src/server/services/tags.ts` | Adds optional `rawColor` param, validated via `tagColorSchema` when present; same `CreateTagResult` return shape, now also `'invalid-color'` on the error variant. |
