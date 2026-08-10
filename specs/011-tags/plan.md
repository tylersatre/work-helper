# Implementation Plan: Tags

**Branch**: `011-tags` | **Date**: 2026-08-10 | **Spec**: [specs/011-tags/spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-tags/spec.md`

## Summary

Tags become a first-class model: one shared vocabulary of colored labels attachable to both people and tasks. The slice adds a `tags` table plus two join tables (`person_tags`, `task_tags`) to the SQLite schema, a `tags` service and `/api/tags` routes following the existing service/route conventions, attach/detach sub-routes on people and tasks, tag chips rendered by one shared `TagChip` component on task detail, person detail, and people-list rows, a suggest-or-create `TagInput` on both detail views, a new Tags page (nav link, usage-ordered list, create/rename/recolor/delete with confirm dialog), and `tags` (names only) added to the `get-person` and `get-task` MCP tool outputs. Auto-assigned colors cycle a fixed 10-color palette shared between server (assignment) and client (picker swatches).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js ≥ 22, ESM throughout (`"type": "module"`)

**Primary Dependencies**: Fastify 5 (HTTP API), Vue 3.5 + Naive UI 2 (SPA client), Drizzle ORM 0.45 + better-sqlite3 (persistence), `@modelcontextprotocol/sdk` 1.30 (MCP server), Zod 4 (validation), vue-router 4

**Storage**: SQLite file (`./data/work-helper.db`, `DATABASE_PATH` override) accessed via Drizzle; single baseline migration in `drizzle/` applied by `migrate()` at startup

**Testing**: Vitest 4 — `tests/unit` (pure logic), `tests/component` (@testing-library/vue + jsdom), `tests/integration` (real Fastify app + in-memory SQLite, including MCP tool tests via the SDK client); `npm test` runs all three, `npm run lint` / `npm run typecheck` / `npm run build` complete the gate

**Target Platform**: self-hosted Docker (Linux) serving the SPA + API + MCP endpoint; dev on macOS via `npm run dev` (branch 011 → API port 3011, UI port 5111)

**Project Type**: single-package web application — Fastify server, Vue SPA, and MCP server in one TypeScript repo (`src/server`, `src/client`, `src/shared`)

**Performance Goals**: single-user CRM; UI interactions should feel immediate — at this scale every tag query is a sub-millisecond SQLite lookup, so no dedicated performance work is planned

**Constraints**: dev-phase data policy — edit `src/server/db/schema.ts` in place, regenerate the single baseline migration, recreate the dev DB; no data-preserving migrations. MCP tag payloads are names only (no colors/ids). Frontend is Vue 3 + Naive UI (no React). MCP server stays on the official SDK.

**Scale/Scope**: one user; vocabulary expected in the tens of tags; touches 3 existing UI surfaces, adds 1 page and 2 components, extends 2 MCP tools, adds 3 tables and ~8 API endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Feature has a Tyler-authored PRD (`docs/product/features/tags.md`) run through `/speckit-specify` + `/speckit-clarify` into `specs/011-tags/spec.md`; this plan derives only from that spec | PASS |
| II. Test-First | Every layer is planned test-first: failing unit/component/integration tests precede each service, route, component, and MCP change; the tasks phase will order red before green | PASS |
| III. Evidence Over Assertion | UI-facing criteria (US1, US2) get `browser-tester` evidence in `docs/evidence/011-tags/`; the MCP-only criterion (US3) gets recorded integration-test output; `verifier` independently confirms both | PASS |
| IV. Architecture Constraints | TypeScript throughout; MCP additions use the existing `@modelcontextprotocol/sdk` server; no email-ingestion involvement; no new deployment requirements | PASS |
| V. Small Vertical Slices, Trunk via PR | One branch (`011-tags`), one PR, Conventional Commits; the slice is independently shippable (US1 alone already delivers value) | PASS |
| Data & migrations (dev phase) | Schema change edits `schema.ts` in place and regenerates the baseline migration; dev DB is recreated, no backfill/migration-path work | PASS |

No violations — Complexity Tracking is empty.

**Post-design re-check (after Phase 1)**: the design introduces no new projects, frameworks, or patterns outside existing conventions (service functions + route modules + Naive UI components + Zod schemas); all gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/011-tags/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── http-api.md
│   └── mcp-tools.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── types.ts                    # MODIFY: add Tag / TagWithCounts; add tags to Person, TaskDetail
│   ├── validation.ts               # MODIFY: add tagNameSchema, tagColorSchema
│   └── tag-palette.ts              # NEW: the 10-color auto-assign palette (server assignment + client swatches)
├── server/
│   ├── db/schema.ts                # MODIFY: add tags, personTags, taskTags tables
│   ├── services/tags.ts            # NEW: vocabulary CRUD, attach/detach, usage counts, auto-color assignment
│   ├── services/people.ts          # MODIFY: include tags in PersonRecord (getPerson + listPeople)
│   ├── services/tasks.ts           # MODIFY: include tags in getTaskDetail
│   ├── routes/tags.ts              # NEW: GET/POST /api/tags, PATCH/DELETE /api/tags/:id
│   ├── routes/people.ts            # MODIFY: POST /api/people/:id/tags, DELETE /api/people/:id/tags/:tagId
│   ├── routes/tasks.ts             # MODIFY: POST /api/tasks/:id/tags, DELETE /api/tasks/:id/tags/:tagId
│   ├── app.ts                      # MODIFY: register tagRoutes
│   └── mcp/tools.ts                # MODIFY: add tags (names only) to get-person and get-task outputs
├── client/
│   ├── App.vue                     # MODIFY: add "Tags" nav link + active-section handling
│   ├── router.ts                   # MODIFY: add /tags route
│   ├── pages/TagsPage.vue          # NEW: usage-ordered list, create, rename, recolor, delete-with-confirm
│   ├── pages/TaskDetailPage.vue    # MODIFY: Tags section (chips + TagInput)
│   ├── pages/PersonDetailPage.vue  # MODIFY: Tags section (chips + TagInput)
│   ├── pages/PeoplePage.vue        # MODIFY: tag chips in people-list rows
│   └── components/
│       ├── TagChip.vue             # NEW: single source of chip rendering (name + color)
│       └── TagInput.vue            # NEW: suggest existing / create-and-attach input
drizzle/                            # REGENERATE: baseline migration from updated schema (dev-phase policy)
tests/
├── unit/                           # NEW: tag name/color validation, auto-color cycling
├── component/                      # NEW: TagInput, TagChip, TagsPage; MODIFY: task-detail, person-detail-page, people-page, app-shell
└── integration/                    # NEW: tags API CRUD + ordering + attach/detach + cascade; MODIFY: mcp-read-tools (tags in get-person/get-task)
```

**Structure Decision**: keep the existing single-package layout — server logic as pure service functions (`src/server/services/tags.ts`) called by thin Fastify route modules and by MCP tools, shared types/validation/palette in `src/shared`, and Vue SPA additions under `src/client`. This mirrors how people/tasks/notes are already built; no new structure is introduced.

## Complexity Tracking

No constitution violations — nothing to justify.
