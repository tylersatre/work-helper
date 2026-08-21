# Implementation Plan: delete-card

**Branch**: `024-delete-card` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-delete-card/spec.md`

## Summary

Add a delete control to the card detail view's header (next to the lane pills, per `move-task-from-detail-view`'s precedent). Clicking it opens an in-page confirmation modal naming the card and warning the action is permanent; confirming calls a new `DELETE /api/tasks/:id` route that hard-deletes the row and navigates back to the board, while canceling closes the modal with no side effects. Because every task-linked table (`task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations`) already declares `onDelete: 'cascade'` and the SQLite connection runs with `foreign_keys = ON` (`src/server/db/index.ts:14`), a single `DELETE FROM tasks WHERE id = ?` removes the card's own links while leaving `people` and `email_conversations` rows untouched — no schema change or migration is needed. No MCP tool is added for deletion (FR-009); the MCP `list-board`/`get-task` tools automatically reflect the deletion because they read the same `tasks` table the UI route deletes from.

## Technical Context

**Language/Version**: TypeScript (Node.js), Vue 3 + Vite frontend

**Primary Dependencies**: Fastify (HTTP API), Drizzle ORM (SQLite), Vue Router, `@modelcontextprotocol/sdk` (read-only for this feature — no new tool)

**Storage**: SQLite via better-sqlite3, existing `tasks` table and its cascading child tables (`task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations`)

**Testing**: Vitest (`tests/unit`, `tests/integration`), `browser-tester` agent (Playwright) for UI acceptance evidence

**Target Platform**: Self-hosted Docker web app (server + browser client)

**Project Type**: Web application (single Fastify server serving API + Vue SPA)

**Performance Goals**: N/A — single-row delete on a personal-scale dataset

**Constraints**: Hard delete only (no soft-delete/trash/undo per FR-011); deletion must not cascade into `people` or `email_conversations`; deletion must be visible to MCP read tools without a cache or separate data path

**Scale/Scope**: One new API route, one new service function, one new Vue confirmation component, one button + wiring in `TaskDetailPage.vue`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec Is the Source of Truth** — PASS. `specs/024-delete-card/spec.md` exists with Given/When/Then acceptance criteria; this plan implements only what it specifies.
- **II. Test-First** — PASS (enforced during `/speckit-implement`, not this planning step). Tasks generated in Phase 2 must each start with a failing test.
- **III. Evidence Over Assertion** — PASS. Acceptance criteria split cleanly into UI-surfaced (US1, US2 — detail view, modal, board redirect) requiring `browser-tester` evidence, and API/MCP-surfaced (US3's MCP listing check) requiring recorded automated-check output; `quickstart.md` documents both.
- **IV. Architecture Constraints** — PASS. No new frameworks; delete route lives in the existing Fastify `tasks` router; no MCP tool is added, consistent with FR-009 and the existing "MCP is a consumer, not the ingestion/mutation-of-everything path" pattern already used for reads.
- **V. Small Vertical Slices, Trunk via PR** — PASS. Single vertical slice (delete-with-confirmation), lands via PR against `main`.

No violations. Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/024-delete-card/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── db/
│   │   └── schema.ts                     # unchanged — cascades already in place
│   ├── services/
│   │   └── tasks.ts                      # add deleteTask(db, id): DeleteTaskResult
│   └── routes/
│       └── tasks.ts                      # add DELETE /api/tasks/:id
└── client/
    ├── pages/
    │   └── TaskDetailPage.vue            # add delete control + wiring near lane pills
    └── components/
        └── DeleteCardConfirm.vue         # new confirmation modal (title + warning + cancel/confirm)

tests/
├── integration/
│   └── task-delete.test.ts               # API: delete removes task + cascades, leaves people/conversations, 404 on missing/already-deleted
└── unit/                                  # (only if the modal/service warrants isolated unit coverage beyond integration + browser evidence)
```

**Structure Decision**: Existing single Fastify + Vue SPA web app (`src/server`, `src/client`). This feature adds one server route/service function and one client component, following the exact file layout `move-task-from-detail-view` and `mcp-mark-emails-read` used for prior task-detail slices — no new directories.

## Complexity Tracking

*No violations — table omitted.*
