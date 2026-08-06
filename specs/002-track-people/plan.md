# Implementation Plan: Track People

**Branch**: `002-track-people` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-track-people/spec.md`

## Summary

Add a people directory (built-in first name, last name, email, phone plus extra free-text fields from a file-based field configuration), a People page listing everyone alphabetically by last name, a person record view with edit and delete, and a task detail view (opened by clicking a kanban card) where people are searched by name or email and linked to or removed from the task. Deleting a person removes them from every task.

Technical approach: extend the existing Fastify + Drizzle/SQLite server with a `people` table (JSON column for extra field values, partial unique index on `lower(email)`) and a `task_people` join table with `ON DELETE CASCADE`; load extra fields from `config/person-fields.json` following the existing `config/lanes.json` pattern; introduce `vue-router` on the client so the board, People page, person record, and task detail are routed pages. Full decisions in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >= 22 (existing repo settings; `"type": "module"`)

**Primary Dependencies**: Fastify 5 (HTTP API), Drizzle ORM 0.45 + drizzle-kit 0.31 (schema/migrations), better-sqlite3 13 (storage driver), Zod 4 (validation), Vue 3.5 + Vite 8 (client), **new: vue-router 4** (client-side routing — the only new dependency; see research.md R4)

**Storage**: SQLite file at `./data/work-helper.db` via Drizzle ORM; migrations in `drizzle/` applied at startup by `createDb()`. New tables: `people`, `task_people`. Foreign-key enforcement enabled via `PRAGMA foreign_keys = ON` (research.md R3)

**Testing**: Vitest 4 (`npm test`), `app.inject()` integration tests against in-memory SQLite (`createDb(':memory:')`), @testing-library/vue + jsdom for component tests — all following the existing test layout under `tests/{unit,integration,component}`

**Target Platform**: Self-hosted Docker (Linux server); dev via `npm run dev` (tsx watch + Vite on port 3000/5173)

**Project Type**: Web application — single npm package with `src/server` (Fastify API) and `src/client` (Vue SPA) sharing `src/shared` types/validation

**Performance Goals**: Personal-CRM scale; SC-001 (person visible in list ≤ 5 s of submitting) and SC-004 (open task and link a person ≤ 15 s) are UX-flow bounds, comfortably met by synchronous SQLite queries — no caching or pagination needed

**Constraints**: Field configuration is file-based, read at startup, with no management UI (FR-011); people list has no pagination (spec assumption); kanban card rendering unchanged (FR-017); task fields not editable from the detail view (FR-016)

**Scale/Scope**: Single user, no auth; hundreds of people / tasks at most; 4 new routed pages, ~9 API endpoints, 2 new tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Spec Is the Source of Truth | Feature has a PRD (`docs/product/features/track-people.md`) and a speckit spec (`specs/002-track-people/spec.md`) with Given/When/Then criteria; this plan derives only from them | PASS |
| II. Test-First (NON-NEGOTIABLE) | Plan orders work as contract/integration/component tests first (red) then implementation (green); quickstart.md lists the verification commands the Stop gate runs | PASS |
| III. Evidence Over Assertion | quickstart.md defines runnable validation scenarios per user story for `browser-tester` evidence (`docs/evidence/track-people/`) and independent `verifier` re-checks | PASS |
| IV. Architecture Constraints | TypeScript throughout; no MCP surface in this slice (spec: out of scope); no email ingestion involvement; SQLite + file config keep self-hosted Docker viable | PASS |
| V. Small Vertical Slices, Trunk via PR | One slice on branch `002-track-people`, landing via PR with Conventional Commits | PASS |

**Post-design re-check**: design artifacts introduce one new runtime dependency (`vue-router`, the official Vue routing library) and no new frameworks, services, or projects — no constitution violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-track-people/
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
config/
├── lanes.json                       # existing
└── person-fields.json               # NEW: extra person fields, e.g. ["Nickname"]

src/
├── server/
│   ├── app.ts                       # MODIFIED: decorate personFields; register people routes
│   ├── index.ts                     # MODIFIED: load person-fields config at startup
│   ├── lanes-config.ts              # existing (pattern source)
│   ├── person-fields-config.ts      # NEW: load/validate config/person-fields.json
│   ├── db/
│   │   ├── index.ts                 # MODIFIED: PRAGMA foreign_keys = ON
│   │   └── schema.ts                # MODIFIED: add people, task_people tables
│   ├── routes/
│   │   ├── board.ts                 # existing (unchanged)
│   │   ├── tasks.ts                 # MODIFIED: add GET /api/tasks/:id, link/unlink routes
│   │   └── people.ts                # NEW: people CRUD + search + person-fields endpoint
│   └── services/
│       ├── tasks.ts                 # MODIFIED: getTaskDetail, linkPerson, unlinkPerson
│       └── people.ts                # NEW: create/list/get/update/delete/search people
├── shared/
│   ├── types.ts                     # MODIFIED: Person, PersonInput, TaskDetail types
│   └── validation.ts                # MODIFIED: person input schema
└── client/
    ├── main.ts                      # MODIFIED: install router
    ├── App.vue                      # MODIFIED: nav shell (Board | People) + <RouterView>
    ├── router.ts                    # NEW: routes for /, /people, /people/:id, /tasks/:id
    ├── pages/
    │   ├── BoardPage.vue            # NEW: hosts existing CreateTaskForm + Board
    │   ├── PeoplePage.vue           # NEW: people list + create form
    │   ├── PersonDetailPage.vue     # NEW: person record, edit, delete
    │   └── TaskDetailPage.vue       # NEW: task title + linked-people section
    └── components/
        ├── Board.vue                # existing (unchanged rendering)
        ├── Lane.vue                 # existing (unchanged)
        ├── TaskCard.vue             # MODIFIED: click navigates to /tasks/:id
        ├── CreateTaskForm.vue       # existing (unchanged)
        ├── PersonForm.vue           # NEW: shared create/edit form incl. extra fields
        └── LinkedPeople.vue         # NEW: linked list + search-and-link widget

tests/
├── unit/
│   ├── lanes-config.test.ts         # existing
│   ├── validation.test.ts           # MODIFIED: person schema cases
│   └── person-fields-config.test.ts # NEW
├── integration/
│   ├── people.test.ts               # NEW: CRUD, validation, email uniqueness, sort order
│   ├── people-search.test.ts        # NEW: substring/case-insensitive search
│   ├── task-people.test.ts          # NEW: detail view, link, unlink, dedupe, 404s
│   └── person-delete.test.ts        # NEW: delete removes links from all tasks
└── component/
    ├── people-page.test.ts          # NEW: list order, create, validation messages
    ├── person-form.test.ts          # NEW: extra configured fields render and submit
    ├── task-detail.test.ts          # NEW: linked people, search results show email, remove
    └── task-card.test.ts            # NEW: card click navigates to detail view
```

**Structure Decision**: Keep the existing single-package web-app layout (`src/server` + `src/client` + `src/shared`), extending each area in place. New surfaces follow the established idioms: config loader mirrors `lanes-config.ts`, routes/services mirror `routes/tasks.ts` + `services/tasks.ts`, tests mirror the `tests/{unit,integration,component}` split. The task detail view and person record are routed pages (not modals) — rationale in research.md R4.

## Complexity Tracking

> No constitution violations — table intentionally empty.
