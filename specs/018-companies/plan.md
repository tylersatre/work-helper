# Implementation Plan: Companies

**Branch**: `018-companies` | **Date**: 2026-08-12 | **Spec**: [specs/018-companies/spec.md](spec.md)

**Input**: Feature specification from `/specs/018-companies/spec.md`

## Summary

Add a deliberately thin Company model — a case-insensitively unique name, shared-vocabulary tags, one-to-many people assignment, many-to-many card links — with a Companies list page, a company detail page (rename, delete-with-confirmation, paginated people/cards sections, tag chips), a company picker on the person edit form, a linked-companies control on the card detail view, and eight new MCP tools plus company fields on the existing `get-person`/`get-task` responses. Everything mirrors an existing, proven pattern in the codebase: the `tags` feature supplies the name-validation/CRUD/error-shape precedent, `task_people` supplies the card-link join-table precedent, `TagInput`/`LinkedPeople` supply the picker UI precedent, and `src/server/mcp/tools.ts` supplies the MCP tool precedent. One additive drizzle migration creates three new tables and one nullable column on `people`.

## Technical Context

**Language/Version**: TypeScript 5.9, Node >= 22, ESM (`"type": "module"`)

**Primary Dependencies**: Fastify 5 (API), Vue 3.5 + vue-router 4 + naive-ui 2 (SPA), Drizzle ORM 0.45 + better-sqlite3 (data), `@modelcontextprotocol/sdk` ^1.30 (MCP server), zod 4 (shared validation)

**Storage**: SQLite via better-sqlite3; schema in `src/server/db/schema.ts`; numbered drizzle-kit migrations in `drizzle/` applied automatically at startup; production DB holds real data — migrations must be additive/data-preserving

**Testing**: Vitest 4 — `tests/integration/` (Fastify `app.inject()` for HTTP; real MCP SDK `Client` over `StreamableHTTPClientTransport` for tools), `tests/component/` (@testing-library/vue, jsdom pragma), `tests/unit/`; gate = `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

**Target Platform**: Self-hosted Docker (Linux) in production; macOS dev; per-feature dev ports derived from branch prefix (018 → API 3018, UI 5118)

**Project Type**: Single TypeScript web app: Vue SPA (`src/client/`) + Fastify API (`src/server/`) + MCP server (`src/server/mcp/`) sharing types/validation via `src/shared/`

**Performance Goals**: Personal-scale single-user CRM; no server-side pagination needed for company lists (matches People/Tags precedent — only email browsing paginates server-side); company detail sections paginate client-side (25 + load-more)

**Constraints**: Additive-only migration (never edit landed migrations `0000`/`0001`); TDD mandatory (failing test first); evidence gate (browser-tester for UI stories, recorded MCP/HTTP test output for agent story, verifier confirmation); Vue 3 only (React rejected); no hard-wrapped markdown

**Scale/Scope**: Single user; expected volumes in the hundreds of companies, low thousands of people/cards; 7 user stories, ~15 acceptance scenarios, 1 migration, ~6 new source files + ~8 modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Feature has a Tyler-authored PRD (`docs/product/features/companies.md`, commit `722d09c`) and a `/speckit-specify` spec (`specs/018-companies/spec.md`) with Given/When/Then criteria; this plan derives everything from that spec | PASS |
| II. Test-First | Plan sequences every behavior as failing-test-first (integration tests via `app.inject()`, MCP tests via real SDK client, component tests via @testing-library/vue); no code lands before its failing test | PASS |
| III. Evidence Over Assertion | UI stories (1–6) get browser-tester evidence in `docs/evidence/018-companies/`; MCP story (7) gets recorded automated-check output; verifier independently re-runs checks | PASS |
| IV. Architecture Constraints | TypeScript throughout; MCP tools added to the existing `@modelcontextprotocol/sdk` server (`registerTool` pattern); no ingestion-path changes; Docker deployment untouched | PASS |
| V. Small Vertical Slices, Trunk via PR | One feature branch (`018-companies`), lands via one PR with Conventional Commits; slice is independently shippable | PASS |
| Data & migrations | One new numbered migration (`0002_*`) creating `companies`, `task_companies`, `company_tags` and adding nullable `people.company_id` — purely additive, no data loss possible; landed migrations untouched; fresh-vs-upgraded parity covered by extending the `migration-upgrade` test precedent | PASS |

**Post-design re-check (after Phase 1)**: PASS — the design artifacts introduce no new projects, no new frameworks, no lossy migration steps, and no scope beyond the spec; all contracts mirror existing in-repo patterns.

## Project Structure

### Documentation (this feature)

```text
specs/018-companies/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── http-api.md      # Phase 1 output — REST endpoints
│   └── mcp-tools.md     # Phase 1 output — MCP tool contracts
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
drizzle/
└── 0002_*.sql                        # NEW migration: companies, task_companies, company_tags, people.company_id

src/
├── shared/
│   ├── types.ts                      # MODIFIED: Company, CompanyDetail; Person + TaskDetail gain company fields
│   └── validation.ts                 # MODIFIED: companyNameSchema (trim + min 1)
├── server/
│   ├── db/schema.ts                  # MODIFIED: companies, taskCompanies, companyTags tables; people.companyId column
│   ├── app.ts                        # MODIFIED: register companyRoutes
│   ├── routes/
│   │   ├── companies.ts              # NEW: list/create/detail/rename/delete + tag attach/detach
│   │   ├── people.ts                 # MODIFIED: PUT accepts companyId; detail includes company
│   │   └── tasks.ts                  # MODIFIED: POST/DELETE /api/tasks/:id/companies[...]
│   ├── services/
│   │   ├── companies.ts              # NEW: CRUD, uniqueness, detail assembly, link/unlink
│   │   ├── people.ts                 # MODIFIED: company on person detail, set/clear assignment
│   │   └── tasks.ts                  # MODIFIED: companies on task detail
│   └── mcp/tools.ts                  # MODIFIED: 8 new company tools; get-person/get-task gain company fields
└── client/
    ├── router.ts                     # MODIFIED: /companies, /companies/:id
    ├── App.vue                       # MODIFIED: Companies nav link + active-section mapping
    ├── pages/
    │   ├── CompaniesPage.vue         # NEW: alphabetical list + create form + empty state
    │   ├── CompanyDetailPage.vue     # NEW: rename, delete-with-confirm, people/cards sections (25 + load-more), tags
    │   ├── PersonDetailPage.vue      # MODIFIED: shows current company
    │   └── TaskDetailPage.vue        # MODIFIED: hosts LinkedCompanies section
    └── components/
        ├── CompanyPicker.vue         # NEW: debounced search-select for person edit form (set/switch/clear)
        ├── LinkedCompanies.vue       # NEW: card detail linked-companies search/add/remove (mirrors LinkedPeople)
        └── PersonForm.vue            # MODIFIED: company field via CompanyPicker

tests/
├── integration/
│   ├── companies.test.ts             # NEW: CRUD + validation + ordering + delete-unlink
│   ├── company-links.test.ts         # NEW: person assignment + card links + tag attachments
│   ├── mcp-company-tools.test.ts     # NEW: 8 tools + get-person/get-task company fields
│   └── migration-upgrade.test.ts     # MODIFIED: parity check covers new tables/column
└── component/
    ├── companies-page.test.ts        # NEW
    ├── company-detail.test.ts        # NEW: rename, delete confirm, load-more, tags
    ├── linked-companies.test.ts      # NEW
    ├── person-form.test.ts           # MODIFIED: company picker
    └── app-shell.test.ts             # MODIFIED: nav link + active state
```

**Structure Decision**: Keep the existing single-app layout — one new route file + one new service on the server, two new pages + two new components on the client, all shared contracts in `src/shared/`. This mirrors how every prior feature (tags, task-people, emails) is organized; no new directories or projects are introduced.

## Complexity Tracking

> No constitution violations — table intentionally empty.
