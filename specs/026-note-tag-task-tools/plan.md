# Implementation Plan: MCP Note, Tag & Task Tools

**Branch**: `026-note-tag-task-tools` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-note-tag-task-tools/spec.md`

## Summary

Add eight write tools to the work-helper MCP server — delete-note, update-task, create-tag, rename-tag, recolor-tag, delete-tag, attach-tag, detach-tag — so an authorized agent can clean up task notes, correct a card's title, and fully manage the tag vocabulary (including attach/detach on tasks and people) without opening the browser. Every underlying database table (`task_notes`, `tags`, `person_tags`, `task_tags`) and most of the write logic (`createTag`, `updateTag`, `deleteTag`, `deleteNote`, tag attach/detach) already exist in the service layer from the `task-notes` and `tags` features; this feature is almost entirely new MCP tool registrations plus a small number of service-layer additions to match MCP-specific contracts (id-or-name resolution, no-auto-create attach, single-note-id delete, detach counts, task-title update). No schema change and no migration are needed. A ninth, read-only `list-tags` MCP tool is also added — see Research decision R6 below; it is supporting infrastructure, not one of the eight FR-021 tools, and is called out explicitly because it slightly expands the tool count the spec's FR list implies.

## Technical Context

**Language/Version**: TypeScript 5, Node.js >=22 (ESM, `"type": "module"`)

**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP server), Fastify 5 (HTTP host for MCP + REST), `drizzle-orm` + `better-sqlite3` (persistence), `zod` 4 (validation)

**Storage**: SQLite via Drizzle ORM (`src/server/db/schema.ts`, `drizzle/` migrations). No schema change for this feature — `tasks`, `task_notes`, `tags`, `person_tags`, `task_tags` already exist.

**Testing**: Vitest (`npm test`). MCP tool behavior is exercised through `tests/integration/mcp-*.test.ts`, which spin up the real Fastify app with an in-memory SQLite db, connect a real `@modelcontextprotocol/sdk` `Client` over `StreamableHTTPClientTransport` through the OAuth approval flow (see `tests/integration/mcp-read-tools.test.ts`), and call tools exactly as an authorized agent would.

**Target Platform**: Self-hosted Docker (Linux server); dev via `npm run dev` (Fastify API + Vite).

**Project Type**: Single web app repo with a client/server/shared split under one `src/` tree (not a separate frontend/backend project pair) — see Structure Decision.

**Performance Goals**: N/A — CRUD-scale MCP tool calls against a local SQLite db; no new performance-sensitive path.

**Constraints**: All eight write tools must be gated by the existing `mcp-authentik-auth` OAuth flow (no new auth code — every tool registered on the shared `McpServer` instance is already behind it). No confirmation/dry-run step on any tool (delete-tag included) — the call is the deliberate act, matching `mcp-move-tasks`/`mcp-people-tools` precedent. No audit-note side effects.

**Scale/Scope**: 8 new write tools + 1 new read tool (`list-tags`) registered in `src/server/mcp/tools.ts`; small additions to `src/server/services/tasks.ts` and `src/server/services/tags.ts`; no client (Vue) changes — this feature has no new UI surface (tag CRUD/attach/detach and note delete already have UI; task title rename is deliberately MCP-only for this slice, per the spec's Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec Is the Source of Truth**: PASS. `specs/026-note-tag-task-tools/spec.md` exists with Given/When/Then acceptance scenarios for all 4 user stories, run through `/speckit-specify` before this plan.
- **II. Test-First**: PASS (procedural gate, enforced at `/speckit-implement` time). Plan's testing strategy (integration tests against a real MCP client, per tool) supports writing a failing test before each tool/service change; no code is written by this plan itself.
- **III. Evidence Over Assertion**: PASS, with a note. This feature is unusual in that its actions are MCP-only but several of its effects are UI-visible (Tags page, task/person detail views, kanban board — per FR-020 and multiple acceptance scenarios). Both evidence surfaces apply: (a) automated integration-test output (`tests/integration/mcp-*.test.ts`) covering every tool's success and error paths, and (b) `browser-tester` evidence confirming the UI reflects effects triggered via MCP calls (tag chips, renamed card titles, deleted notes) — the browser-tester can seed state and trigger mutations via direct MCP/API calls the same way `tests/integration/mcp-read-tools.test.ts` does, then verify the DOM. update-task has no UI trigger control by design, but its effect (new title) is still UI-visible and must be confirmed in the browser per FR-020/SC-002.
- **IV. Architecture Constraints**: PASS. TypeScript throughout; new tools built on the existing `@modelcontextprotocol/sdk` `McpServer.registerTool` — no new framework. No email-ingestion or Docker-deployment impact.
- **V. Small Vertical Slices, Trunk via PR**: PASS. Single feature branch, single PR, Conventional Commits.

No violations. Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/026-note-tag-task-tools/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── mcp-tools.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/                       # Vue 3 UI — UNCHANGED by this feature
├── server/
│   ├── db/
│   │   └── schema.ts              # UNCHANGED — tasks, task_notes, tags, person_tags, task_tags already exist
│   ├── mcp/
│   │   └── tools.ts               # +9 server.registerTool(...) calls (8 write + list-tags read)
│   ├── services/
│   │   ├── tasks.ts               # + deleteNoteById, + updateTaskTitle
│   │   └── tags.ts                # + resolveExistingTag (no-create id-or-name lookup), + deleteTag detach-count variant, + attach-tag no-create path
│   └── routes/                    # UNCHANGED — REST routes back the existing UI, untouched
└── shared/
    └── validation.ts              # UNCHANGED — titleSchema, tagNameSchema, tagColorSchema already fit this feature's needs

tests/
└── integration/
    └── mcp-note-tag-task-tools.test.ts   # new — one MCP-client-driven test file for all 9 tools
```

**Structure Decision**: Single project (work-helper is one repo with `src/client`, `src/server`, `src/shared` under one `src/` tree, not a split frontend/backend pair). This feature is server-only: all changes live in `src/server/mcp/tools.ts` and `src/server/services/{tasks,tags}.ts`, plus one new integration test file. No client changes, no new migration.

## Complexity Tracking

*No violations — table intentionally empty.*
