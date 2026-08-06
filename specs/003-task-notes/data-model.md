# Data Model: Task Notes

**Branch**: `003-task-notes` | **Date**: 2026-08-06

Storage is SQLite via Drizzle ORM (`src/server/db/schema.ts`), migrated by drizzle-kit files in `drizzle/` applied at startup. Decisions referenced as R1–R8 live in [research.md](./research.md).

## Entity: Note (`task_notes` table) — NEW

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | integer | PK, autoincrement | Per-note identity — required for targeted deletion (R3) |
| `task_id` | integer | NOT NULL, FK → `tasks.id` ON DELETE CASCADE | `PRAGMA foreign_keys = ON` already enabled (feature 002) |
| `text` | text | NOT NULL | Markdown source, stored **exactly as typed** — never trimmed or normalized (V1, R4) |
| `source` | text | NOT NULL | `'ui'` \| `'mcp'` — TS-level enum via Drizzle; server-set only, never client-supplied (V2, R8) |
| `created_at` | integer | NOT NULL | Epoch ms — a timezone-independent UTC instant, matching the `tasks`/`people` idiom (FR-006, R3) |

**Validation rules** (Zod in `src/shared/validation.ts`, enforced by the service — FR-010, FR-002):

- **V1 — text required, raw preserved**: text must be non-empty after trimming, but the *untrimmed* value is what gets stored (whitespace is markdown-significant — R4). Violation on the add-note path → "Note text is required" (400). On the task-creation path, trim-empty note input means *no note* — the task is created normally with zero notes, not an error.
- **V2 — source is server-owned**: no API request body carries a source; every API write path sets `'ui'`. `'mcp'` values enter only via direct DB seeding in tests this slice (spec assumption, R8).

**Immutability**: notes have no update path — no service function, no endpoint, no UI affordance (FR-012). The only transitions are create and delete.

**API shape** (`Note` in `src/shared/types.ts`):

```ts
type NoteSource = 'ui' | 'mcp';

interface Note {
  id: number;
  taskId: number;
  text: string;       // raw markdown source, as typed
  source: NoteSource; // displayed as "You" (ui) / "via MCP" (mcp) — mapping lives client-side (R8)
  createdAt: number;  // epoch ms (UTC instant)
}
```

## Entity: Task (`tasks` table) — EXISTING, unchanged schema

No column changes. The feature adds the `task_notes` association, an optional `note` field on the creation input (first note created in the same transaction — R5), and `notes` on the detail read. Card-face rendering data is untouched (FR-013).

**API shape change** (`TaskDetail` in `src/shared/types.ts`):

```ts
interface TaskDetail extends Task {
  people: Person[]; // existing (feature 002)
  notes: Note[];    // NEW — newest first
}
```

## Relationships

```text
tasks 1 ──── * task_notes
       (FK task_id, ON DELETE CASCADE;
        a note belongs to exactly one task)
```

## State transitions

```text
(created) ──── exists ──── (deleted, permanent)
```

Created either with its task (creation-form note, same `created_at` instant as the task — R5) or from the detail view (FR-004). Never edited (FR-012). Deleted only through the confirmation-guarded flow (FR-011); deletion is permanent and cascades never resurrect anything.

## Ordering rule (applies to every notes listing)

`ORDER BY created_at DESC, id DESC` (R3) — newest first (FR-005), with the `id` tiebreak keeping same-millisecond notes in deterministic insertion-newest-first order. Applied in SQL in `getTaskDetail` so the API response order is authoritative; the client never re-sorts.
