# Implementation Plan: task-fields

**Branch**: `030-task-fields` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-task-fields/spec.md`

## Summary

Add four optional, independent attributes to the existing `tasks` table — `dueDate` (a plain `YYYY-MM-DD` string, no time), `priority` (ordered enum Low/Medium/High/Urgent), `effort` (ordered enum S/M/L/XL), and `description` (markdown text) — settable at creation and editable afterward from both the UI and MCP. The create-task form (`CreateTaskForm.vue`) gains four optional inputs. The task detail view gains a new `TaskFields.vue` section: due date/priority/effort use always-visible inline controls that save immediately on change (mirroring the lane-pills/tag-input/archive-button precedent of no-confirmation, immediate actions), while description uses an Edit/Save/Cancel toggle between rendered markdown and a raw-text textarea (mirroring `CompanyDetailPage.vue`'s rename control, appropriate for a multi-line field where per-keystroke autosave would be noisy). `TaskCard.vue` gains a plain due-date badge with no urgency styling — the only field shown on the card face. The MCP `create-task` tool gains the four fields as optional inputs; `update-task` is extended into a general partial-update tool (title becomes optional, the four fields join it with tri-state omit/null/value semantics for independent clearing) and renamed in description accordingly; `get-task` and `list-board` return all four values via the shared `taskSummarySchema`. **One schema change (four nullable columns, one migration), everything else is additive to existing files — no new frameworks, no new routes-level abstraction beyond one new `PATCH /api/tasks/:id`.**

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥ 22, ESM

**Primary Dependencies**: Vue 3.5 + vue-router + naive-ui (client, `NDatePicker`/`NSelect`/`NInput` already used elsewhere); Fastify 5 + drizzle-orm + better-sqlite3 (server); `@modelcontextprotocol/sdk` 1.30 (MCP); zod 4 (tool + route input schemas); `markdown-it` (existing `renderNoteMarkdown`, reused as-is for description)

**Storage**: SQLite via drizzle. Four new nullable columns on `tasks` — `due_date text`, `priority text`, `effort text`, `description text` — added via a new numbered `drizzle-kit generate` migration (next after `0006_silky_the_renegades.sql`). Non-destructive metadata-only `ALTER TABLE ADD` per column; every existing row's new fields become `NULL` (unset), matching FR-013.

**Testing**: vitest — `tests/unit` (extend `validation.test.ts`, `time.test.ts`), `tests/integration` (extend `tasks.test.ts`, `mcp-read-tools.test.ts`, `mcp-note-tag-task-tools.test.ts`; new coverage for `PATCH /api/tasks/:id`), `tests/component` (extend `create-task-form.test.ts`, `task-detail.test.ts`, `task-card.test.ts`). Plus `browser-tester` evidence for UI criteria (US1, US2) and recorded check output for the MCP-only criterion (US3).

**Target Platform**: self-hosted Docker; desktop browser for the board and detail view

**Project Type**: web application — Vue SPA client + Fastify server that also hosts the MCP server, one repo, shared types in `src/shared`

**Performance Goals**: no measurable regression — four extra columns per task row, single-row writes for field edits; no new queries, no pagination concerns (personal-CRM scale, same precedent as `card-archive`/`board-search-filter`).

**Constraints**: no value constraints on any of the four fields beyond the fixed priority/effort option lists (FR-002); no migration/backfill from existing titles or position (FR-013); title parsing/rewriting stays completely out of scope (FR-014); card face shows only the due-date badge, never priority/effort/description (FR-008); no sorting, filtering, or urgency styling on the due date anywhere in this feature (Assumptions).

**Scale/Scope**: 1 schema edit + 1 migration, 1 service-layer replacement (`updateTaskTitle` → `updateTask`) + 1 new service function signature extension (`createTask` gains an optional fields parameter), 1 new HTTP route (`PATCH /api/tasks/:id`) + 1 extended route (`POST /api/tasks`), 2 new client date utils, 5 edited MCP tool registrations (`create-task`, `update-task`, `list-board`, `move-task`, `archive-card`/`unarchive-card` structuredContent mappings) + `taskSummarySchema`/`taskDetailContent` extensions, 1 new Vue component (`TaskFields.vue`) + edits to 3 existing ones (`CreateTaskForm.vue`, `TaskCard.vue`, `TaskDetail.vue`); test extensions across all three test tiers.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. **Result: PASS both times, no violations, Complexity Tracking left empty.***

| Principle | Status | How this plan satisfies it |
| --- | --- | --- |
| I. Spec is the source of truth | PASS | Driven by `docs/product/features/task-fields.md` → `spec.md`; every element traces to an FR/SC. Out-of-scope items (card-face urgency styling, sorting/filtering, title rewriting, migration/backfill, title-rename UI) are respected with no speculative hooks. |
| II. Test-First (non-negotiable) | PASS | `tasks.md` will order every task failing-test-first: schema/migration test before the migration, `createTask`/`updateTask` service tests before the service code, `PATCH /api/tasks/:id` route test before the route, MCP tool tests before the tool edits, component assertions before `CreateTaskForm.vue`/`TaskFields.vue`/`TaskCard.vue`/`TaskDetail.vue` edits. |
| III. Evidence over assertion | PASS | US1 (create-time fields) and US2 (detail-view editing, card badge) have a UI surface → `browser-tester` screenshots into `docs/evidence/task-fields/`. US3 (MCP parity) is reachable only through MCP → recorded `vitest` output. `verifier` re-runs everything. Mapping and commands land in `quickstart.md`. |
| IV. Architecture constraints | PASS | TypeScript throughout; MCP changes are `registerTool` input/output-schema edits on the existing official-SDK server; no new runtime dependency; nothing touches email ingestion; deployment unchanged. |
| V. Small vertical slices, trunk via PR | PASS | One feature, one branch, one PR, Conventional Commits. Vertical slice (schema → service → HTTP route → MCP tool → UI); priority order (P1 create-time fields, P2 detail-view editing, P3 MCP parity) lets US1 ship as a coherent, independently demonstrable increment before US2/US3 layer on top. |
| Data & migrations | PASS, with one flagged, reviewed step | Four new nullable columns, each `ALTER TABLE tasks ADD <col> text` — no `NOT NULL`, no default needed since the columns start unset. Per `research.md` R1 and `data-model.md`, expected to generate non-destructive, metadata-only statements; every existing row's new fields land `NULL`. The generated SQL must still be inspected before committing (CLAUDE.md's rule); if drizzle-kit ever proposes a table rebuild instead of plain `ADD`s, it must be hand-adjusted or flagged to Tyler before merge — not expected here for four new nullable text columns, but not silently assumed either. |

Post-Phase-1 re-check: the design added no framework, no new dependency, and the schema change stays four additive nullable columns with a documented non-destructive path — every row above still holds.

## Project Structure

### Documentation (this feature)

```text
specs/030-task-fields/
├── plan.md                      # This file
├── spec.md                      # Input
├── research.md                  # Phase 0 — R1..R7 decisions
├── data-model.md                # Phase 1 — schema, service signatures, validation rules
├── contracts/
│   ├── http-api.md                  # POST /api/tasks extension, new PATCH /api/tasks/:id, GET response shape
│   ├── mcp-tools.md                 # create-task, update-task, list-board, get-task, move-task/archive-card mappings
│   └── task-fields-ui.md            # CreateTaskForm additions, TaskFields.vue contract, TaskCard badge
├── quickstart.md                # Phase 1 — how to validate + evidence capture
└── tasks.md                     # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── types.ts                       # EDIT — Task gains dueDate/priority/effort/description; new TaskPriority/TaskEffort types
│   └── validation.ts                  # EDIT — taskPriorityValues/taskEffortValues + taskPrioritySchema/taskEffortSchema
├── server/
│   ├── db/
│   │   └── schema.ts                  # EDIT — tasks.dueDate/priority/effort/description columns (all nullable)
│   ├── services/
│   │   └── tasks.ts                   # EDIT — createTask() gains optional fields param; updateTaskTitle → updateTask()
│   ├── routes/
│   │   └── tasks.ts                   # EDIT — POST /api/tasks body extended; NEW PATCH /api/tasks/:id
│   └── mcp/
│       └── tools.ts                   # EDIT — taskSummarySchema + taskDetailContent gain 4 fields; create-task/update-task
│                                       #        input schemas extended; list-board/move-task/archive-card/unarchive-card
│                                       #        structuredContent mappings gain 4 fields
└── client/
    ├── utils/
    │   └── time.ts                    # EDIT — new parseLocalDate()/formatDueDate() helpers for this feature
    ├── components/
    │   ├── CreateTaskForm.vue         # EDIT — due date / priority / effort / description inputs, optional
    │   ├── TaskCard.vue                # EDIT — due-date badge (data-testid="due-date-badge") when task.dueDate is set
    │   ├── TaskDetail.vue              # EDIT — mounts new TaskFields section, wires update:fields event
    │   └── TaskFields.vue              # NEW — due date/priority/effort inline controls + description edit/save/cancel
    └── (TaskDetailPage.vue unchanged — no new props/emits needed at the page level)

drizzle/
└── 0007_<generated-name>.sql          # NEW — ALTER TABLE tasks ADD due_date/priority/effort/description (generated)

tests/
├── unit/
│   ├── validation.test.ts             # EXTEND — taskPrioritySchema/taskEffortSchema accept/reject cases
│   └── time.test.ts                   # EXTEND — parseLocalDate/formatDueDate round-trip + malformed-input tolerance
├── integration/
│   ├── tasks.test.ts                  # EXTEND — createTask with fields, updateTask (rename, per-field set/change/clear,
│   │                                   #           invalid priority/effort rejected with no change), PATCH route
│   ├── mcp-read-tools.test.ts         # EXTEND — get-task/list-board return all 4 fields
│   └── mcp-note-tag-task-tools.test.ts # EXTEND — create-task/update-task MCP field cases incl. invalid enum rejection
└── component/
    ├── create-task-form.test.ts       # EXTEND — optional field inputs, submitted only when set
    ├── task-detail.test.ts            # EXTEND — TaskFields unset/set states, inline save, description edit/save/cancel
    └── task-card.test.ts              # EXTEND — due-date badge present/absent, no priority/effort/description indicator
```

**Structure Decision**: the repo's existing single-package web-app layout (`src/client`, `src/server`, `src/shared`, tests split unit/integration/component) is used as-is, following the exact file layout `card-archive` and `board-search-filter` used for prior task-attribute and card-detail slices — no new directories, one new leaf component (`TaskFields.vue`) matching the existing decomposition precedent (`LinkedPeople.vue`, `LinkedCompanies.vue`, `TaskNotes.vue`, `TagInput.vue` are each their own component mounted from `TaskDetail.vue`).

## Design notes carried into `/speckit-tasks`

Ordered by the spec's user-story priorities, so each story is independently demonstrable:

1. **Foundation** — schema + migration (4 nullable columns); `Task`/`TaskPriority`/`TaskEffort` shared types; `taskPrioritySchema`/`taskEffortSchema`; `createTask()` fields param; `updateTaskTitle` → `updateTask()` service replacement; `PATCH /api/tasks/:id` route; `POST /api/tasks` body extension. Unblocks everything else.
2. **US1 (P1)** — `CreateTaskForm.vue` gains the four optional inputs, submitted only when set (blank stays unset, per FR-003).
3. **US2 (P2)** — `TaskFields.vue` (new component) mounted from `TaskDetail.vue`: due date/priority/effort inline auto-save controls; description Edit/Save/Cancel toggle rendering via the existing `renderNoteMarkdown`. `TaskCard.vue`'s due-date badge, wired to the already-fetched board payload (no new endpoint — `GET /api/board`'s whole-row spread already carries the new columns).
4. **US3 (P3)** — MCP `create-task`/`update-task` input-schema extensions; `taskSummarySchema` + every hand-built `structuredContent` mapping (`create-task`, `update-task`, `move-task`, `archive-card`, `unarchive-card`) gains the four fields; `list-board`'s per-task mapping extended.
5. **Evidence** — seed 2–3 tasks with varying field combinations, run `browser-tester` for US1/US2, record MCP check output for US3, then `verifier`.

Two rules worth restating for the implementer, because both are easy to get subtly wrong:

- **Tri-state semantics for editable fields, not two-state.** `updateTask`'s four new fields must distinguish "key omitted → leave unchanged" from "key present with `null` → clear" from "key present with a value → set." Using a single `?: T | null` per field in the zod input schema (mirroring `set-person-company`'s `companyId: z.number().int().positive().nullable()`, extended with `.optional()` here since update-task's fields are genuinely optional per-call) is the right shape — do not collapse `undefined`/`null` into one case, or clearing becomes indistinguishable from "don't touch," breaking FR-010's explicit-clear requirement and the Edge Cases' persistence-of-unset-state guarantee.
- **Enum validation for priority/effort lives at the MCP input-schema layer, not deep in the service.** Registering `priority`/`effort` as `z.enum([...]).nullable().optional()` in the tool's `inputSchema` means the SDK rejects an out-of-range value (e.g. "Critical") before the handler ever runs — no bespoke error-string matching needed in `updateTask` itself for FR-012. The HTTP `PATCH` route re-validates the same enum defensively (a public endpoint can't rely on `NSelect` alone to gate valid values), but that's a route-layer `safeParse`, not new service-layer branching.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
