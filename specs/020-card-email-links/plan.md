# Implementation Plan: Card–Email Links

**Branch**: `020-card-email-links` | **Date**: 2026-08-12 | **Spec**: [specs/020-card-email-links/spec.md](spec.md)

**Input**: Feature specification from `/specs/020-card-email-links/spec.md`

## Summary

Add a many-to-many association between kanban cards and synced email conversations: one additive join-table migration (`task_conversations`), two new MCP write tools (`link-conversation-to-task`, `unlink-conversation-from-task`) behind the existing mcp-authentik-auth flow, linked-conversation/linked-card fields on the existing `get-task`/`get-conversation` detail responses and their HTTP counterparts, and two read-only UI sections — a linked-emails section on the card detail page and a linked-cards section on the conversation detail page — each with a styled empty state and cross-navigation. Every piece mirrors a shipped precedent: `task_companies` supplies the join-table and service shape, `add-company-to-task`/`remove-company-from-task` supply the MCP tool shape (tightened to error on duplicates per FR-005), `conversationsForPerson`/`listConversations` supply the conversation-summary query shape, and the `FakeMailProvider` + MCP SDK client harness supplies the test approach.

## Technical Context

**Language/Version**: TypeScript 5.9, Node >= 22, ESM (`"type": "module"`)

**Primary Dependencies**: Fastify 5 (API), Vue 3.5 + vue-router 4 (SPA), Drizzle ORM 0.45 + better-sqlite3 (data), `@modelcontextprotocol/sdk` ^1.30 (MCP server), zod 4 (tool schemas / shared validation)

**Storage**: SQLite via better-sqlite3; schema in `src/server/db/schema.ts`; numbered drizzle-kit migrations in `drizzle/` applied automatically at startup; production DB holds real data — the new migration must be purely additive (latest landed migration is `0003_*`, this feature adds `0004_*`)

**Testing**: Vitest — `tests/integration/` (Fastify `app.inject()` for HTTP; real MCP SDK `Client` over `StreamableHTTPClientTransport` through `connectThroughApproval` for tools; `FakeMailProvider` seeds conversations via real sync), `tests/component/` (@testing-library/vue, jsdom), `tests/unit/`; gate = `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

**Target Platform**: Self-hosted Docker (Linux) in production; macOS dev; per-feature dev ports from branch prefix (020 → API 3020, UI 5120)

**Project Type**: Single TypeScript web app: Vue SPA (`src/client/`) + Fastify API (`src/server/`) + MCP server (`src/server/mcp/`) sharing types via `src/shared/`

**Performance Goals**: Personal-scale single-user CRM; both linked sections are unpaginated by spec (FR-015) — expected link counts per entity are single-digit to low tens, so full-list queries are fine

**Constraints**: Additive-only migration (landed migrations `0000`–`0003` untouched); TDD mandatory (failing test first); evidence gate (browser-tester for UI stories, recorded MCP/HTTP test output for agent stories, verifier confirmation); Vue 3 only; read-only UI — no link create/remove controls anywhere in the web app (FR-010); `list-board`, `list-conversations`, and `create-task` responses/inputs must not change (FR-013, FR-014); no hard-wrapped markdown

**Scale/Scope**: Single user; 5 user stories, ~7 acceptance scenarios + 6 edge cases; 1 migration, 1 new service file, 2 new Vue components, ~2 new MCP tools, ~8 modified files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Tyler-authored PRD (`docs/product/features/card-email-links.md`, commit `a2e437c`) ran through `/speckit-specify` (`specs/020-card-email-links/spec.md`, commit `9e796ec`); this plan derives everything from that spec | PASS |
| II. Test-First | Every behavior is sequenced failing-test-first: MCP tools via the SDK-client integration harness, HTTP fields via `app.inject()`, UI sections via @testing-library/vue component tests; no code before its failing test | PASS |
| III. Evidence Over Assertion | UI-facing stories (1, 2, 3, 5 web halves) get browser-tester evidence in `docs/evidence/020-card-email-links/`; MCP-only criteria (tool errors, response fields) get recorded automated-check output; verifier independently re-runs everything | PASS |
| IV. Architecture Constraints | TypeScript throughout; tools added to the existing `@modelcontextprotocol/sdk` server via `registerTool`; agents remain MCP consumers — no ingestion-path change; Docker deployment untouched | PASS |
| V. Small Vertical Slices, Trunk via PR | One branch (`020-card-email-links`), one PR, Conventional Commits; the slice is independently shippable (links + visibility, nothing else) | PASS |
| Data & migrations | One new migration `0004_*` creating only the `task_conversations` join table — purely additive, no existing row touched, no data-loss path; fresh-vs-upgraded parity covered by extending `tests/integration/migration-upgrade.test.ts` | PASS |

**Post-design re-check (after Phase 1)**: PASS — the design artifacts add no new projects or frameworks, one additive table, two tools that mirror the existing company-link tools, and read-only UI sections; nothing exceeds the spec's scope.

## Project Structure

### Documentation (this feature)

```text
specs/020-card-email-links/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── mcp-tools.md     # Phase 1 output — MCP tool + detail-response contracts
│   └── http-api.md      # Phase 1 output — HTTP detail-response contracts
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
drizzle/
└── 0004_*.sql                          # NEW migration: task_conversations join table

src/
├── shared/
│   └── types.ts                        # MODIFIED: LinkedConversationSummary, LinkedCardSummary; TaskDetail gains conversations; EmailConversationDetail gains cards
├── server/
│   ├── db/schema.ts                    # MODIFIED: taskConversations table
│   ├── services/
│   │   ├── task-conversations.ts       # NEW: linkConversationToTask, unlinkConversationFromTask, conversationsForTask, cardsForConversation
│   │   ├── tasks.ts                    # MODIFIED: getTaskDetail includes conversations
│   │   └── email/queries.ts            # MODIFIED: getConversation includes cards; participantsForConversation exported (currently module-private) for reuse by task-conversations.ts
│   └── mcp/tools.ts                    # MODIFIED: link/unlink tools; get-task + get-conversation output schemas gain link fields
└── client/
    ├── pages/
    │   ├── TaskDetailPage.vue          # MODIFIED: Emails section hosting LinkedConversations
    │   └── EmailConversationPage.vue   # MODIFIED: Cards section hosting LinkedCards
    └── components/
        ├── LinkedConversations.vue     # NEW: read-only linked-emails list (subject, participants, latest date) + empty state
        └── LinkedCards.vue             # NEW: read-only linked-cards list (title, lane) + empty state

tests/
├── integration/
│   ├── task-conversation-links.test.ts     # NEW: service + HTTP surface (detail fields, link lifecycle, card-delete cascade)
│   ├── mcp-conversation-link-tools.test.ts # NEW: both tools — happy paths, duplicate error, not-found errors, unlink-not-linked, detail fields, create-task+link flow, unchanged list responses
│   └── migration-upgrade.test.ts           # MODIFIED: parity check covers task_conversations
└── component/
    ├── linked-conversations.test.ts        # NEW: entries, empty state, navigation links, no write controls
    ├── linked-cards.test.ts                # NEW: entries, empty state, navigation links, no write controls
    ├── task-detail.test.ts                 # MODIFIED: page renders Emails section
    └── email-conversation-page.test.ts     # MODIFIED: page renders Cards section
```

**Structure Decision**: Keep the existing single-app layout — one new service file on the server, two new read-only components on the client, shared response shapes in `src/shared/types.ts`. This mirrors how companies (018) landed; no new directories or projects.

## Complexity Tracking

> No constitution violations — table intentionally empty.
