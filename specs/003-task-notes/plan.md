# Implementation Plan: Task Notes

**Branch**: `003-task-notes` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-task-notes/spec.md`

## Summary

Give every task a running, timestamped note history: an optional note field on the kanban create form, a notes section on the task detail view (add, list newest-first, delete-with-confirmation), relative timestamps with exact local time on hover, a source label per note ("You" / "via MCP"), and safe basic-markdown rendering. Notes are immutable — delete-and-rewrite is the only correction path — and the kanban card face is untouched.

Technical approach: add a `task_notes` table (FK → `tasks` with CASCADE, epoch-ms UTC instants, `source` column reserved for future MCP writers) to the existing Fastify + Drizzle/SQLite server; extend `POST /api/tasks` with an optional note created in the same transaction; add `POST /api/tasks/:id/notes` and `DELETE /api/tasks/:id/notes/:noteId`; render notes in a new `TaskNotes` section on the existing `TaskDetailPage` using markdown-it locked to exactly the spec's basic construct set (`html: false`, so raw HTML is inert text) and a dependency-free relative-time utility. Full decisions in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >= 22 (existing repo settings; `"type": "module"`)

**Primary Dependencies**: Fastify 5 (HTTP API), Drizzle ORM 0.45 + drizzle-kit 0.31 (schema/migrations), better-sqlite3 13 (storage driver), Zod 4 (validation), Vue 3.5 + Vite 8 + vue-router 4 (client), **new: markdown-it 14** (note rendering — the only new dependency, ships its own TypeScript types; see research.md R1)

**Storage**: SQLite file at `./data/work-helper.db` via Drizzle ORM; migrations in `drizzle/` applied at startup by `createDb()`. New table: `task_notes` (FK → `tasks.id` ON DELETE CASCADE; `PRAGMA foreign_keys = ON` already enabled by feature 002)

**Testing**: Vitest 4 (`npm test`), `app.inject()` integration tests against in-memory SQLite (`createDb(':memory:')`), @testing-library/vue + jsdom for component tests — all following the existing test layout under `tests/{unit,integration,component}`

**Target Platform**: Self-hosted Docker (Linux server); dev via `npm run dev` (tsx watch + Vite on port 3000/5173)

**Project Type**: Web application — single npm package with `src/server` (Fastify API) and `src/client` (Vue SPA) sharing `src/shared` types/validation

**Performance Goals**: Personal-CRM scale; SC-001 (attach context in ≤ 15 s) is a UX-flow bound met by single-round-trip endpoints; all of a task's notes render without pagination (spec assumption: tens per task), and per-note markdown rendering is synchronous and negligible at that volume

**Constraints**: Kanban card face byte-for-byte unchanged (FR-013, SC-006); notes immutable after creation — no edit endpoint or affordance anywhere (FR-012); markdown limited to exactly the basic set with raw HTML/script rendered inert (FR-008, FR-009); timestamps stored as timezone-independent instants, displayed relative with viewer-local absolute on hover (FR-006); no truncation, search, or pagination of notes

**Scale/Scope**: Single user, no auth; tens of notes per task at most; 1 new table, 2 new endpoints + 2 extended, 2 new components + 2 modified, 2 new client utility modules, 1 migration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Spec Is the Source of Truth | Feature has a PRD (`docs/product/features/task-notes.md`) and a speckit spec (`specs/003-task-notes/spec.md`) with Given/When/Then criteria and a recorded clarification session; this plan derives only from them | PASS |
| II. Test-First (NON-NEGOTIABLE) | Plan orders work as unit/integration/component tests first (red) then implementation (green); quickstart.md lists the verification commands the Stop gate runs | PASS |
| III. Evidence Over Assertion | quickstart.md defines runnable validation scenarios per user story for `browser-tester` evidence (`docs/evidence/task-notes/`) and independent `verifier` re-checks | PASS |
| IV. Architecture Constraints | TypeScript throughout; no MCP surface in this slice (the `source` column only *reserves* provenance for the future MCP feature — FR-007); no email ingestion involvement; SQLite migration keeps self-hosted Docker viable | PASS |
| V. Small Vertical Slices, Trunk via PR | One slice on branch `003-task-notes`, landing via PR with Conventional Commits | PASS |

**Post-design re-check**: design artifacts introduce one new runtime dependency (markdown-it, configured to the spec's exact construct set) and no new frameworks, services, or projects — no constitution violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-task-notes/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── http-api.md      # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
drizzle/
└── 0002_*.sql                       # NEW: generated migration creating task_notes

src/
├── server/
│   ├── db/
│   │   └── schema.ts                # MODIFIED: add taskNotes table
│   ├── routes/
│   │   └── tasks.ts                 # MODIFIED: POST /api/tasks accepts optional note; add note create/delete routes
│   └── services/
│       └── tasks.ts                 # MODIFIED: createTask (note in transaction), getTaskDetail (+notes), addNote, deleteNote
├── shared/
│   ├── types.ts                     # MODIFIED: Note, NoteSource; TaskDetail gains notes
│   └── validation.ts                # MODIFIED: note text schema (trim-validated, stored raw)
└── client/
    ├── utils/
    │   ├── markdown.ts              # NEW: markdown-it locked to the basic construct set
    │   └── time.ts                  # NEW: relative-time buckets + absolute local formatter
    ├── pages/
    │   └── TaskDetailPage.vue       # MODIFIED: render TaskNotes section
    └── components/
        ├── CreateTaskForm.vue       # MODIFIED: optional multiline note field
        ├── TaskNotes.vue            # NEW: notes section — add form, validation message, list
        └── NoteItem.vue             # NEW: one note — source label, <time> hover, rendered markdown, delete w/ confirm

tests/
├── unit/
│   ├── validation.test.ts           # MODIFIED: note text schema cases (raw preserved, whitespace rejected)
│   ├── markdown.test.ts             # NEW: each supported construct renders; HTML/script inert; javascript: links refused; out-of-scope constructs stay text
│   └── time.test.ts                 # NEW: bucket boundaries ("just now" → minutes → hours → "2 days ago"); absolute format incl. timezone conversion
├── integration/
│   ├── db.test.ts                   # MODIFIED: failing-first task_notes schema + FK-CASCADE test (constitution II)
│   ├── tasks.test.ts                # MODIFIED: create task with / without note (atomicity, zero-notes case)
│   └── task-notes.test.ts           # NEW: add (201/400/404), list newest-first, delete (204/404), source 'ui', persistence via GET detail
└── component/
    ├── create-task-form.test.ts     # MODIFIED: note field optional; blank note omitted from request
    ├── task-detail.test.ts          # MODIFIED: detail page shows notes section incl. empty state
    └── task-notes.test.ts           # NEW: order, labels ("You"/"via MCP"), timestamps + hover title, add, validation message, confirm/cancel delete, markdown rendered, XSS inert
```

**Structure Decision**: Keep the existing single-package web-app layout (`src/server` + `src/client` + `src/shared`), extending each area in place. New surfaces follow the established idioms: notes service/routes extend `services/tasks.ts` + `routes/tasks.ts` exactly as person-linking did, `TaskNotes.vue` mirrors the `LinkedPeople.vue` section-component pattern on `TaskDetailPage`, and tests keep the `tests/{unit,integration,component}` split. `src/client/utils/` is a new directory for the two rendering utilities — pure functions kept out of components so they unit-test without mounting anything.

## Complexity Tracking

> No constitution violations — table intentionally empty.
