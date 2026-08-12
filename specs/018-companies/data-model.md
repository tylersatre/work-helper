# Data Model: Companies

All changes live in `src/server/db/schema.ts` and ship as one additive migration (`drizzle/0002_*.sql`). Conventions follow the existing schema: camelCase exported consts / snake_case SQL names, `createdAt` as epoch-ms integers, table-prefixed index names, composite primary keys on join tables.

## New table: `companies`

| Column | Type | Constraints |
|---|---|---|
| `id` | integer | PK, autoincrement |
| `name` | text | NOT NULL |
| `created_at` | integer | NOT NULL (epoch ms) |

**Indexes**: `companies_name_unique` — unique on `lower(name)` (functional index, the `tags_name_unique` pattern) enforcing FR-002's case-insensitive uniqueness at the DB level.

**Validation rules** (service layer, `src/server/services/companies.ts` + shared `companyNameSchema`):

- Name is trimmed before all checks and before persisting (spec edge case: surrounding whitespace).
- Empty after trim → `invalid-name` → HTTP 400 / MCP `toolError` "A name is required".
- Case-insensitive match against another company (create: any company; rename: any company with `id ≠ self`, so rename-to-own-casing passes) → `name-taken` → HTTP 409 / MCP `toolError` "That company name is already in use".

**Ordering**: all company lists sort `name COLLATE NOCASE` ascending (Companies page, pickers, `list-companies` MCP tool) — the tags-list expression.

## Modified table: `people` — new column

| Column | Type | Constraints |
|---|---|---|
| `company_id` | integer | NULLable, FK → `companies.id`, `ON DELETE SET NULL` |

Models FR-001's "a person belongs to at most one company". NULL = no company. Set/switch/clear via `PUT /api/people/:id` (`companyId: number | null`) and the `set-person-company` MCP tool. Deleting a company automatically clears every assignment (FR-012) via the FK action — `PRAGMA foreign_keys = ON` is set in `createDb`.

**State transitions** (the only stateful field in this feature):

- unassigned → assigned: set `companyId` to an existing company's id (referencing a missing company → `not-found` error, no change).
- assigned → assigned elsewhere: overwrite `companyId` (switch).
- assigned → unassigned: set `companyId` to NULL (clear, or company deletion).

## New table: `task_companies`

| Column | Type | Constraints |
|---|---|---|
| `task_id` | integer | NOT NULL, FK → `tasks.id`, `ON DELETE CASCADE` |
| `company_id` | integer | NOT NULL, FK → `companies.id`, `ON DELETE CASCADE` |

**Primary key**: composite (`task_id`, `company_id`) — duplicate links are structurally impossible (spec edge case). Mirrors `task_people`. Card deletion removes its links; company deletion removes the company from every card while the cards survive (FR-012).

## New table: `company_tags`

| Column | Type | Constraints |
|---|---|---|
| `company_id` | integer | NOT NULL, FK → `companies.id`, `ON DELETE CASCADE` |
| `tag_id` | integer | NOT NULL, FK → `tags.id`, `ON DELETE CASCADE` |

**Primary key**: composite (`company_id`, `tag_id`). Mirrors `person_tags`/`task_tags`, attaching companies to the single shared `tags` vocabulary (FR-011) — no new tag namespace, no change to the `tags` table. Company deletion detaches its tags without deleting them; tag deletion (existing feature) detaches from companies symmetrically.

## Entity relationships

```text
companies 1 ──── * people          (people.company_id, SET NULL on company delete)
companies * ──── * tasks           (task_companies join, CASCADE both ways)
companies * ──── * tags            (company_tags join, CASCADE both ways)
```

## Shared TypeScript types (`src/shared/types.ts`)

- `Company`: `{ id: number; name: string }` — the summary shape used in lists, pickers, person records, and task details.
- `CompanyDetail`: `{ id: number; name: string; people: { id; firstName; lastName }[]; cards: { id; title; lane }[]; tags: Tag[] }` — people ordered by `lastName, firstName COLLATE NOCASE`; cards ordered by `title COLLATE NOCASE`; complete lists (the 25-entry first page is client-side presentation only, per D7).
- `Person` gains `company: Company | null`.
- `TaskDetail` gains `companies: Company[]`.

## Migration `0002_*` contents (expected generated SQL, review before commit)

```sql
CREATE TABLE `companies` (... as above ...);
CREATE UNIQUE INDEX `companies_name_unique` ON `companies` (lower(`name`));
CREATE TABLE `task_companies` (..., PRIMARY KEY(`task_id`, `company_id`), FKs CASCADE);
CREATE TABLE `company_tags` (..., PRIMARY KEY(`company_id`, `tag_id`), FKs CASCADE);
ALTER TABLE `people` ADD `company_id` integer REFERENCES companies(`id`);
```

Purely additive — no existing row or column is modified, so production data survives by construction. If drizzle-kit instead emits a `people` table-recreate for the new FK column, hand-adjust to the `ALTER TABLE ... ADD COLUMN` form per the constitution's data-preservation rule. `tests/integration/migration-upgrade.test.ts` is extended to assert fresh-vs-upgraded schema parity including the new tables and column.
