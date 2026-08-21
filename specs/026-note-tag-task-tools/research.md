# Phase 0 Research: MCP Note, Tag & Task Tools

No NEEDS CLARIFICATION markers were left in the Technical Context — the codebase already has direct precedent for nearly every piece of this feature (task notes, tags, MCP tool registration patterns). The research below documents the concrete decisions made while reconciling the spec against what already exists in `src/server/services/tags.ts`, `src/server/services/tasks.ts`, and `src/server/mcp/tools.ts`.

## R1: No schema change is needed

- **Decision**: Ship this feature with zero new migrations.
- **Rationale**: `src/server/db/schema.ts` already defines `tasks`, `taskNotes`, `tags`, `personTags`, and `taskTags` with exactly the shape this feature needs (tag name unique case-insensitively via `uniqueIndex(sql\`lower(name)\`)`, join tables with composite primary keys and `onDelete: 'cascade'`). The `tags` feature and `task-notes` feature already built and migrated these tables.
- **Alternatives considered**: None — confirmed by reading the schema file directly rather than assuming.

## R2: `delete-note` takes only a note id, not a task id

- **Decision**: The MCP tool's input is `{ noteId: number }`. A new service function, `deleteNoteById(db, noteId)`, looks the note up directly (no task-scoping parameter) and returns `{ ok: true, taskId }` or `{ ok: false, error: 'note-not-found' }`.
- **Rationale**: FR-001 and both User Story 1 acceptance scenarios call `delete-note` with just the note's id — no task id is ever supplied. The existing `deleteNote(db, taskId, noteId)` service function (built for the UI's task-detail delete button, which always has the task id in scope) requires both. Since note ids are already globally unique (`taskNotes.id` is an autoincrement PK) and every note belongs to exactly one task, scoping by task is unnecessary for this entry point and would only add a parameter the spec never asks for.
- **Alternatives considered**: Reusing `deleteNote(db, taskId, noteId)` and requiring the MCP tool to take both ids — rejected, contradicts the spec's stated tool signature and would fail the "delete-note with one note's id" acceptance scenario as written (an agent would have to call `get-task` first just to discover a task id it doesn't need).

## R3: `update-task` needs a new service function; existing validation is reused as-is

- **Decision**: Add `updateTaskTitle(db, taskId, rawTitle)` to `src/server/services/tasks.ts`, returning `{ ok: true, task }` or `{ ok: false, error: 'task-not-found' | 'invalid-title' }`. It reuses `titleSchema` from `src/shared/validation.ts` unchanged.
- **Rationale**: No task-title-update function exists today (`createTask` sets the initial title only). `titleSchema` (`z.string().trim().min(1, 'Title is required')`) already rejects both empty and whitespace-only titles with the exact "Title is required" message FR-004 asks for — no new validation needed.
- **Alternatives considered**: A generic `updateTask(db, id, { title? })` partial-update function mirroring `updateTag`'s multi-field shape — rejected as over-engineering; this feature only ever changes title, and the spec explicitly scopes `update-task` to title only (Key Entities: "Task title: ... editable only through the update-task tool for this feature").

## R4: Tag identification "by id or name" needs a non-creating resolver, separate from the UI's auto-create path

- **Decision**: Add `resolveExistingTag(db, input: AttachInput): { ok: true; tag: TagRecord } | { ok: false; error: 'tag-not-found' | 'invalid-name' }` to `src/server/services/tags.ts`, reusing the existing case-insensitive `findTagByNameCaseInsensitive` lookup but never inserting a new row. `rename-tag`, `recolor-tag`, `delete-tag`, `attach-tag`, and `detach-tag` all resolve their target tag through this function before acting.
- **Rationale**: The existing `resolveOrCreateTag(db, input)` — used today by the UI's tag-picker on person/task/company detail views via `attachTagToPerson`/`attachTagToTask`/`attachTagToCompany` — auto-creates a tag when a given name doesn't match one. That is correct, existing UI behavior and must not change. But FR-016 and the User Story 3 "Ghost" acceptance scenario require `attach-tag` to *reject* an unknown name with "no such tag exists," never create one. Reusing `resolveOrCreateTag` for the MCP tools would silently violate that requirement. A separate, purely-resolving function keeps the UI's create-on-attach convenience intact while giving the MCP tools the strict, agent-facing contract the spec demands.
- **Alternatives considered**: Threading an `allowCreate: boolean` flag through `resolveOrCreateTag` and the attach functions that call it — rejected as a needless behavior branch inside code the UI depends on today; a same-shaped sibling function is simpler to reason about and lower-risk to the existing `tags.test.ts` / `tags-page.test.ts` coverage.

## R5: `attach-tag`/`detach-tag` MCP tools need their own attach/detach codepath, not the existing UI-facing functions

- **Decision**: `attach-tag` and `detach-tag` are implemented directly in `tools.ts` (or a small new pair of service functions) using `resolveExistingTag` (R4) for the tag and a plain existence check for the target, rather than calling `attachTagToPerson`/`attachTagToTask`/`detachTagFromPerson`/`detachTagFromTask` (which are wired to `resolveOrCreateTag`).
- **Rationale**: Same reasoning as R4 — those functions' auto-create behavior is correct for the UI and wrong for the MCP tool. The join-table insert (`onConflictDoNothing()`, satisfying FR-018's no-op-on-duplicate requirement) and delete (`db.delete(taskTags/personTags).where(...)`) logic itself is identical and trivial to reuse or mirror; only the tag-resolution step differs.
- **Alternatives considered**: See R4.

## R6: `delete-tag` needs to accept id-or-name and report detach counts

- **Decision**: Extend the delete path with a variant that (a) resolves the tag via `resolveExistingTag` (R4), (b) counts current `personTags`/`taskTags` rows for that tag id before deleting (cascade delete on `tags` removes them), and (c) returns `{ ok: true, peopleDetached: number, tasksDetached: number }`.
- **Rationale**: FR-013/FR-014 and the "Contract renewal" delete-tag acceptance scenario require the response to report exactly how many people and tasks were detached, and to accept either id or name. The existing `deleteTag(db, id)` takes only a numeric id and reports nothing beyond success — it's used today by the Tags-page REST route where the UI already knows the counts from `listTags`'s `peopleCount`/`tasksCount`. The MCP tool needs to compute and surface those counts itself in one call.
- **Alternatives considered**: Reusing `listTags`'s per-tag counts by filtering the full list — rejected as wasteful (loads every tag to find one); a direct `count(*)` query scoped to the one tag id is simpler and cheaper.

## R7: A `list-tags` MCP read tool is added as supporting infrastructure — flagged explicitly

- **Decision**: Register a ninth tool, `list-tags` (no input, returns every tag's id/name/color), mirroring the existing `GET /api/tags` → `listTags(db)` service call already used by the Tags page.
- **Rationale**: FR-020 requires every effect of this feature's tools to be checkable via "every relevant MCP reading tool (get-task, list-tags, board-listing)," and three separate acceptance scenarios (User Story 2, scenarios 1, 2, and 5) explicitly say a tag "appears... in list-tags" or "is gone from... list-tags" as part of the Then clause. No `list-tags` MCP tool exists today — every other entity type already has one (`get-task`/`list-board` for tasks, `get-person`/`search-people` for people, `get-company`/`list-companies` for companies), but tags, which only had a UI-facing REST route, did not. Without it, the spec's own acceptance criteria and FR-020's MCP-reading-tool requirement would be uncheckable by MCP means. This is called out explicitly here — and in the plan Summary — because it is not one of the eight tools FR-021 says "this feature" comprises; it's additive reading infrastructure the other seven FRs' acceptance criteria depend on to be verifiable.
- **Alternatives considered**: Treating "list-tags" in the acceptance scenarios as loose language for "the Tags page" only, and skipping the MCP tool — rejected: FR-020 names it alongside `get-task` and the board-listing tool in the same breath as concrete MCP reading tools, and Constitution Principle III requires an automated check (not just browser evidence) for criteria reachable through MCP tools; without `list-tags`, User Story 2's tag-lifecycle criteria would have no MCP-reachable automated check at all.

## R8: Color validation reuses the existing hex-format schema; "any color value" refers to the auto-assign palette, not format

- **Decision**: `create-tag`'s optional color and `recolor-tag`'s required color both validate with the existing `tagColorSchema` (`/^#[0-9a-fA-F]{6}$/`).
- **Rationale**: The spec's Assumptions section says "Constraining create-tag or recolor-tag's color to the UI's fixed auto-assign palette is out of scope — both tools accept any color value." Read against the acceptance scenarios, which only ever supply concrete hex values ("#F59E0B", "#10B981"), this is a statement about not restricting colors to the UI's small preset palette (`nextTagColor` in `src/shared/tag-palette.ts`) — not a request to accept arbitrary non-color strings. Reusing the existing schema keeps tag color representation consistent everywhere the color is rendered (Tags page, chips) without inventing a second color format.
- **Alternatives considered**: Accepting any non-empty string as a color — rejected: would let an MCP call store a value the UI's chip-rendering CSS can't safely use, and nothing in the spec asks for non-hex colors.

## R9: Attach-tag/detach-tag target resolution shape (task vs. person)

- **Decision**: Both tools take optional `taskId` and `personId` inputs; exactly one must be supplied (validation error otherwise, before any tag lookup). This mirrors the tag side's own `tagId`/`tagName` optional-pair shape (R4).
- **Rationale**: No existing MCP tool targets "a task or a person" polymorphically — existing link tools are one-entity-specific (`add-person-to-task`, `add-company-to-task`). The spec's User Story 3 requires a single `attach-tag`/`detach-tag` pair usable against either record type. A flat optional-pair input matches this codebase's existing style (e.g., `type: z.enum(['email', 'phone'])` used elsewhere for a similar "which kind" dispatch) better than a discriminated-union or nested-object shape, which isn't used anywhere else in `tools.ts`.
- **Alternatives considered**: A single `targetType: z.enum(['task', 'person'])` + `targetId: number` pair — considered equally valid; rejected only for being slightly more verbose for callers than the id-or-name-style pairing already established for tags, with no other benefit. Recorded here so `/speckit-tasks` can pick either without re-litigating; the optional-pair-of-typed-ids shape is the plan's chosen direction. See `contracts/mcp-tools.md` for the exact fields.

## R10: Auth — no new code needed

- **Decision**: Register all nine tools through the same `registerMcpTools(server, context)` function and `McpServer` instance already gated end-to-end by the `mcp-authentik-auth` OAuth flow.
- **Rationale**: Every tool in `tools.ts` today is reachable only after a client completes OAuth through `src/server/mcp/auth/*`; there is no per-tool auth check anywhere in the file. FR-021 is satisfied by construction — adding tools to the same registration function inherits the same gate, exactly like every prior MCP-tools feature (`mcp-move-tasks`, `mcp-people-tools`).
- **Alternatives considered**: None — confirmed by reading `src/server/mcp/routes.ts`/`http.ts` and the existing `mcp-forged-identity.test.ts`/`mcp-revocation.test.ts` coverage, which already exercises this gate against the full tool set.

## R11: `create-tag` needs an optional explicit-color parameter — the existing service function doesn't accept one

- **Decision**: Extend `createTag(db, rawName, rawColor?)` in `src/server/services/tags.ts` to accept an optional color argument, validated with `tagColorSchema` when supplied and falling back to the existing `nextTagColor(lastCreatedTagColor(db))` auto-assignment when omitted.
- **Rationale**: FR-006 requires `create-tag` to accept "a required name and an optional color; when no color is given, the system MUST assign one automatically." The current `createTag(db, rawName: unknown)` signature has no color parameter at all — the UI's create flow (`POST /api/tags`, `tagRoutes` in `src/server/routes/tags.ts`) never lets a caller pick a color, so the service was never built to accept one. This is a small, additive signature change: existing callers (the REST route) keep working unchanged by simply not passing the new optional argument, and get the same auto-assigned-color behavior as before.
- **Alternatives considered**: A separate `createTagWithColor` function — rejected as needless duplication; the auto-assign-when-omitted behavior is a strict superset of the existing behavior, so extending in place is simpler and keeps one source of truth for tag creation.
