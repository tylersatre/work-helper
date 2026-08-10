# Phase 0 Research: Tags

All Technical Context entries were resolvable from the codebase and the known stack — no external unknowns remained. The decisions below settle every planning-level choice the spec deliberately left open.

## R1: Attachment storage — two join tables, not a polymorphic table

**Decision**: two join tables mirroring the existing `task_people` convention: `person_tags` (personId, tagId) and `task_tags` (taskId, tagId), each with a composite primary key and `ON DELETE CASCADE` foreign keys to both parents.

**Rationale**: SQLite foreign keys cannot reference "people or tasks" from one polymorphic column, so a single attachment table would give up referential integrity and cascade behavior. Two join tables get tag deletion (FR-012) and record deletion cleanup for free via cascade, and match the `taskPeople` pattern already in `schema.ts`.

**Alternatives considered**: a polymorphic `tag_attachments` table (`tagId`, `recordType`, `recordId`) — rejected because it loses FK enforcement and cascades, and every query needs a type discriminator; separate per-type tag vocabularies — rejected by FR-001 (one shared vocabulary).

## R2: Case-insensitive name uniqueness and validation messages

**Decision**: a unique index on `lower(name)` (the exact pattern of `email_addresses_value_unique`), plus service-level pre-checks that return typed results so routes can send friendly messages. Names are trimmed before validation and uniqueness checks (`tagNameSchema` = trimmed, min 1, in `src/shared/validation.ts`). Rename excludes the tag's own id from the duplicate check, which makes recasing a tag's own name (VIP → Vip) a legal rename. Messages follow the repo's sentence-case convention: **"A name is required"** (400) and **"That tag name is already in use"** (409, matching the 409 used for email/phone conflicts).

**Rationale**: the DB index is the integrity backstop; the service pre-check produces the deterministic validation messages FR-002 requires. Both mechanisms already exist in this codebase for contact entries, so tests and error paths follow known shapes.

**Alternatives considered**: `COLLATE NOCASE` on the column — rejected because the expression index on `lower()` is the established convention here; relying on the constraint violation alone — rejected because SQLite constraint errors don't map cleanly to per-field validation messages.

## R3: Auto-assign color palette and cycling algorithm

**Decision**: a fixed 10-color palette in `src/shared/tag-palette.ts`, ordered so adjacent entries are visibly distinct on the dark theme: `#3B82F6` (blue), `#22C55E` (green), `#EAB308` (amber), `#EF4444` (red), `#A855F7` (purple), `#EC4899` (pink), `#14B8A6` (teal), `#F97316` (orange), `#06B6D4` (cyan), `#84CC16` (lime). Assignment is stateless: look up the most recently created tag (highest id); if none exists assign `palette[0]`; if its color sits at palette index `i` assign `palette[(i + 1) % 10]`; if its color is custom (not in the palette, e.g. it was recolored before the next creation) assign the first palette color that differs from it. Against a custom color the difference guarantee is by value only — visual distinctness is guaranteed between palette entries (adjacent entries are chosen to be visibly distinct), and FR-005 scopes the "visibly different" requirement accordingly.

**Rationale**: FR-005 only requires *consecutively created* tags to receive different auto-assigned colors (visibly distinct within the palette), and this derives the next color from durable state (the last-created tag row) with no counter to persist or break on deletion. The palette doubles as the preset swatches for the color picker (FR-011 says the same palette is used for both), so it lives in `src/shared` and is imported by server and client.

**Alternatives considered**: a persisted creation counter — rejected as extra state that drifts under deletion; random assignment with distance checks — rejected as nondeterministic and hard to test; deriving from tag count — rejected because deletions make counts repeat, which could hand consecutive creations the same color.

## R4: Color picker — `NColorPicker` with palette swatches

**Decision**: use Naive UI's `NColorPicker` on the Tags page with `:swatches` set to the shared palette and `:modes="['hex']"`, giving preset swatches plus free custom-color entry in one control.

**Rationale**: the clarification requires "preset palette swatches plus a custom option"; `NColorPicker` provides exactly that out of the box, and Naive UI is already the component library. Colors are stored as `#RRGGBB` hex strings, which is what the picker emits (a defensive `tagColorSchema` regex rejects anything else with 400 "A valid color is required").

**Alternatives considered**: hand-rolled swatch grid plus text input — rejected as more code for the same behavior; storing named palette slots instead of hex — rejected because custom colors need arbitrary hex anyway.

## R5: Tag input — custom combobox following the `LinkedPeople` pattern

**Decision**: a `TagInput.vue` component built like `LinkedPeople.vue`: an `NInput` with a suggestion list underneath. It fetches the whole vocabulary from `GET /api/tags` and filters client-side, case-insensitively, excluding tags already attached to the current record; when the typed text matches no existing tag case-insensitively it shows a "Create “X”" option. No debounce or server-side search.

**Rationale**: full control over the three behaviors the spec pins down (case-insensitive suggestion, exclusion of already-attached, create option only for genuinely new names) is simpler in a purpose-built list than fighting `NAutoComplete`/`NSelect` tag-mode semantics; and with a single-user app and a vocabulary in the tens, shipping the whole list to the client is the simplest correct thing.

**Alternatives considered**: `NAutoComplete` — rejected because injecting a conditional "create" option and attach-on-select semantics is awkward; `NSelect` with `tag` mode — rejected because it manages its own chip state, which conflicts with server-driven attachments.

## R6: Attach API — one endpoint that attaches by id or creates-and-attaches by name

**Decision**: `POST /api/people/:id/tags` and `POST /api/tasks/:id/tags` accept either `{ tagId }` (attach existing) or `{ name }` (create-and-attach in one transaction). If a submitted `name` case-insensitively matches an existing tag, the server attaches that tag instead of creating a duplicate. Attaching an already-attached tag is a no-op (`onConflictDoNothing`, like `linkPerson`). Both attach and detach respond with the record's updated `{ tags }` array.

**Rationale**: FR-004 makes create+attach one step; doing it in one server transaction avoids the orphaned-tag state a client-side create-then-attach pair could leave. Attach-on-name-match makes the endpoint safe even if the client's cached vocabulary is stale, guaranteeing SC-004 at the API layer, not just in the input's UI logic.

**Alternatives considered**: separate create and attach calls from the client — rejected for the partial-failure window; a dedicated `POST /api/tags` + attach orchestration in `TagInput` — same objection.

## R7: Usage ordering and delete-confirmation counts

**Decision**: `GET /api/tags` returns every tag with `peopleCount` and `tasksCount` (computed via `LEFT JOIN`/subquery aggregates), ordered by total attachments descending, ties broken by `lower(name)` ascending — the FR-009 order, computed in SQL. The Tags page list renders names and colors only (counts are not displayed there, per the spec assumption); the delete dialog re-fetches `GET /api/tags` when it opens and reads that tag's counts, satisfying "counts reflect the moment the dialog opens" without a dedicated per-tag endpoint.

**Rationale**: the server needs the counts anyway to sort, so carrying them in the response costs nothing and gives the dialog its numbers; a fresh fetch on dialog open is the simplest way to make the counts current.

**Alternatives considered**: a `GET /api/tags/:id` counts endpoint — rejected as an extra endpoint duplicating data the list already carries; ordering client-side — rejected because the order is a server contract worth testing once, in SQL.

## R8: Where tags appear in existing read models

**Decision**: extend the three read models that back chip surfaces: `PersonRecord` (both `getPerson` and `listPeople`) and `getTaskDetail` gain `tags: Tag[]` (`{ id, name, color }`), ordered by name case-insensitively. The MCP `get-person` and `get-task` tools map that to `tags: string[]` — names only, same order. MCP authorization needs no work: the entire MCP surface is already behind the mcp-authentik-auth flow, so "authorized agents" is satisfied by the existing transport auth.

**Rationale**: FR-006 needs chips on task detail, person detail, and people-list rows — exactly these read models; a deterministic name order keeps every surface identical (SC-002) and tests stable. Names-only at the MCP boundary is the clarified contract.

**Alternatives considered**: a separate `GET /api/{people,tasks}/:id/tags` fetch per surface — rejected as extra round-trips and a second source of truth; including colors/ids in MCP output — rejected by the clarification.

## R9: Schema change mechanics (dev-phase policy)

**Decision**: add the three tables to `src/server/db/schema.ts`, delete the contents of `drizzle/` and regenerate the single baseline migration with `npx drizzle-kit generate`, and delete the dev DB file (`./data/work-helper.db`) so `migrate()` recreates it on next start.

**Rationale**: the constitution's development-phase policy forbids accumulating migrations; regenerating the baseline changes its hash, so an existing dev DB (which tracks applied migrations by hash) must be recreated rather than migrated — which the policy explicitly allows.

**Alternatives considered**: appending a `0001_*.sql` migration — rejected by the constitution until real data exists.
