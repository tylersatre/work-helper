# Implementation Plan: Email Sync Improvements

**Branch**: `012-email-sync-improvements` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-email-sync-improvements/spec.md`

## Summary

Give email sync a web home and a complete capture. A new Email Sync page (nav link, date pickers prefilled since the last successful run, single-flight Sync button, persistent run history) triggers the same server-side sync the MCP `sync-emails` tool uses; both paths record every run in a new `sync_runs` table. Sync itself is extended three ways: it captures the full message metadata (display names, both timestamps, read state, importance, flag, categories, attachment metadata, folder name, Outlook web link, internet message ID), it covers every mail folder except Junk/Deleted Items/Drafts via Graph folder enumeration, and it refreshes the metadata of already-stored messages on re-sync while keeping subject/body/participants snapshotted. The MCP read tools expose all the new data.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >= 22 (`"type": "module"`, tsx in dev)

**Primary Dependencies**: Fastify 5 (HTTP API + static SPA serving), Vue 3.5 + vue-router 4 + naive-ui (client), drizzle-orm 0.45 + better-sqlite3 (storage), `@modelcontextprotocol/sdk` 1.30 (MCP server), zod 4 (validation/tool schemas), `@azure/msal-node` (Graph auth, already wired)

**Storage**: SQLite via drizzle-orm / better-sqlite3. Development-phase policy: schema is edited in place in `src/server/db/schema.ts` and the dev database is reset — no migration files.

**Testing**: Vitest (`tests/unit`, `tests/component` with jsdom + @testing-library/vue, `tests/integration` against a real Fastify app + in-memory SQLite + `FakeMailProvider`); browser evidence via the `browser-tester` agent (Playwright MCP) against `npm run dev` (feature 012 → API port 3012, UI port 5112)

**Target Platform**: Self-hosted Docker (Linux server), single Node process serving API + SPA + MCP

**Project Type**: Web application — single repo, single `src/` tree split `src/server` / `src/client` / `src/shared`

**Performance Goals**: Single-user scale. A sync run of a few hundred messages completes within one HTTP request (the web page awaits the POST; no background jobs, no live progress per spec). Attachment-metadata fetches add at most one extra Graph request per message that has attachments.

**Constraints**: At most one sync run active system-wide (in-process coordinator — the app is a single Node process); Microsoft Graph v1.0 endpoints only; snapshot rule — subject, body, participants immutable after first sync; `sync-emails` MCP tool input contract and validation behavior unchanged; run history is append-only and never pruned

**Scale/Scope**: One mailbox (Tyler's), thousands of stored messages, tens of mail folders; three new UI surfaces (nav link, Sync page, history list), two new HTTP endpoints, one new table + one extended table + one new child table, four MCP tools touched (1 write path, 3 read schemas)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Spec is the source of truth | PASS | Feature doc `docs/product/features/email-sync-improvements.md` (approved, on `main`) → spec.md on this branch; plan derives only from those. |
| II | Test-first | PASS | Plan orders every slice failing-test-first: unit (window/folder pruning/refresh), integration (routes, coordinator, capture, MCP schemas) and component (SyncPage) tests precede implementation; `/speckit-tasks` will encode red→green pairs. |
| III | Evidence over assertion | PASS | UI-facing criteria (US1 scenarios 1–5) get browser-tester evidence in `docs/evidence/email-sync-improvements/`; MCP-only criteria (US1 scenario 6, US2–US4) get recorded automated-check output; verifier re-runs both. |
| IV | Architecture constraints | PASS | Ingestion stays inside the server (Graph provider); the web page and MCP tool are both mere triggers of the same server-side sync service — agents remain consumers, never the ingestion path. Official MCP SDK only. TypeScript throughout. Docker target unchanged. |
| V | Small vertical slices, trunk via PR | PASS | Four independently testable user stories (P1 page → P2 capture → P3 folders → P4 refresh), one branch, lands via PR with Conventional Commits. |
| — | Data & migrations (dev phase) | PASS | Schema changes edit `schema.ts` in place (`source_folder` enum → text, new columns, two new tables); dev DB is reset. No migration files, no backfill — pre-feature rows gain fields via the refresh or a reset, per spec assumption. |

**Post-Phase-1 re-check**: PASS — no design artifact introduces a new framework, a second process, migration files, or an agent-side ingestion path. No violations to justify; Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-email-sync-improvements/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── http-api.md      # New /api/email-sync endpoints
│   └── mcp-tools.md     # Changed MCP tool schemas (sync-emails, read tools)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── db/
│   │   └── schema.ts                      # EXTEND: email_messages metadata columns, source_folder → text; NEW: sync_runs, email_attachments tables
│   ├── services/email/
│   │   ├── provider.ts                    # EXTEND: MailMessage gains metadata fields; MailProvider gains listFolders(); folder identified by id+name, not enum
│   │   ├── graph-provider.ts              # EXTEND: wider $select, folder enumeration (well-known id resolution + recursive childFolders), attachment metadata fetch
│   │   ├── sync.ts                        # EXTEND: all-folder iteration, metadata capture, refresh-on-existing, new/updated counts
│   │   ├── sync-coordinator.ts            # NEW: single-flight guard + run recording (sync_runs), shared by web route and MCP tool
│   │   └── queries.ts                     # EXTEND: message metadata in getConversation/emailsForPerson; unread/attachment indicators (+ participants) in listConversations; NEW listSyncRuns
│   ├── routes/
│   │   └── email-sync.ts                  # NEW: GET /api/email-sync/runs, POST /api/email-sync/runs
│   ├── mcp/
│   │   └── tools.ts                       # EXTEND: sync-emails routes through coordinator (source "mcp"); read-tool output schemas gain new fields
│   └── app.ts                             # EXTEND: register email-sync routes, construct/decorate shared SyncCoordinator
├── client/
│   ├── App.vue                            # EXTEND: "Email Sync" nav link + active-section handling
│   ├── router.ts                          # EXTEND: /sync route
│   └── pages/
│       └── SyncPage.vue                   # NEW: date pickers with prefill, Sync button, busy state, result, run history list + empty state
└── shared/
    └── (no changes expected)

tests/
├── unit/                                  # folder-tree pruning, refresh field rules, window math (existing email-cursor/body-text stay green)
├── component/
│   ├── app-shell.test.ts                  # EXTEND: nav link + active state
│   └── sync-page.test.ts                  # NEW: prefill, validation, busy state, result, history render/empty state
└── integration/
    ├── helpers/fake-mail-provider.ts      # EXTEND: folder tree, metadata fields, attachments on seeds
    ├── email-sync.test.ts                 # EXTEND: capture, folders, refresh, counts
    ├── email-sync-runs.test.ts            # NEW: run history persistence, single-flight, web routes, source attribution
    └── email-read-tools.test.ts / mcp-read-tools.test.ts  # EXTEND: new fields through MCP read tools
```

**Structure Decision**: Keep the existing single-project layout — one Fastify server (`src/server`) serving the Vue SPA (`src/client`) and the MCP endpoint, with shared types in `src/shared`. This feature adds files inside the established `services/email`, `routes`, and `pages` directories; no new top-level structure.

## Complexity Tracking

> No constitution violations — table intentionally empty.
