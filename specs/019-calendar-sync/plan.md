# Implementation Plan: Calendar Sync

**Branch**: `019-calendar-sync` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-calendar-sync/spec.md`

## Summary

Pull events from the connected mailbox's default Outlook calendar into work-helper's own store, on demand from a new calendar section on the Sync page or via a new `sync-calendar` MCP tool, over any explicit date range. Events are fetched through Microsoft Graph's `calendarView` endpoint (which expands recurring series into individual occurrences), stored in new `calendar_events` / `calendar_event_participants` tables that share the existing `email_addresses` records for case-insensitive person linking, and exposed to authorized agents through new `list-events`, `get-event`, and `events-for-person` MCP tools plus an extended `list-unlinked-addresses` response. Re-syncs refresh stored events in place and mark in-range disappeared/cancelled events cancelled (never deleting), runs are recorded in a new `calendar_sync_runs` history table, and the existing `SyncCoordinator` single-flight guard is extended to span both sync kinds so only one sync (email or calendar) runs at a time globally.

## Technical Context

**Language/Version**: TypeScript (strict) on Node.js; Vue 3 + Vite frontend; same toolchain as the rest of the repo.

**Primary Dependencies**: Fastify (HTTP API), `@modelcontextprotocol/sdk` 1.30 (MCP server, zod v4 schemas), Drizzle ORM + better-sqlite3, `@azure/msal-node` (device-code auth, file token cache), naive-ui (frontend components). No new dependencies required.

**Storage**: SQLite via Drizzle; three new tables (`calendar_events`, `calendar_event_participants`, `calendar_sync_runs`) added by a new numbered migration (`drizzle/0002_*.sql`, purely additive — production data preserved).

**Testing**: Vitest (`npm test`, TZ pinned to America/Denver). Unit tests for the sync window/refresh/cancellation logic and the Graph calendar provider (via `fetch` stubbing); integration tests booting the real Fastify app with an injected `FakeCalendarProvider` and driving the real MCP client through the OAuth flow (existing harness in `tests/integration/helpers/`); component tests for the Sync page via `@testing-library/vue`.

**Target Platform**: Self-hosted Docker on Tyler's home server (Linux); dev on macOS.

**Project Type**: Web application (single project: `src/server` + `src/client` + shared MCP server in-process).

**Performance Goals**: Single-user scale; a sync over a multi-month range (hundreds of events) completes in seconds; MCP reads answer directly from SQLite with indexed range queries.

**Constraints**: Read-only against Outlook (FR-014 — no Graph write calls, ever); every schema change data-preserving (production DB in use); one sync at a time globally across email + calendar and web + MCP entry points; date ranges inclusive in server-local time, matching email sync.

**Scale/Scope**: One mailbox, one default calendar; ~6 new server files (provider interface, Graph provider, fake provider, sync engine, queries, routes), 4 new/1 extended MCP tools, one extended Vue page, one migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Feature has an approved PRD (`docs/product/features/calendar-sync.md`) and a spec with acceptance criteria (`specs/019-calendar-sync/spec.md`, clarified 2026-08-12); this plan implements only spec'd behavior. | PASS |
| II. Test-First | Every slice lands red→green: failing unit/integration/component tests precede the code; the fake-provider strategy (mirroring `FakeMailProvider`) makes sync behavior fully testable without Graph. | PASS |
| III. Evidence Over Assertion | UI-facing criteria (US1 Sync page scenarios) get browser-tester evidence; MCP/API-only criteria (US2–US7) get recorded automated-check output; verifier confirms both. quickstart.md defines the validation runs. | PASS |
| IV. Architecture Constraints | TypeScript throughout; MCP tools added to the existing official-SDK server; calendar ingestion happens inside the server via Graph (agents consume MCP tools, never ingest); Docker deployment unchanged. | PASS |
| V. Small Vertical Slices, Trunk via PR | One feature branch (`019-calendar-sync`), lands via PR; user stories are independently testable slices in priority order. | PASS |
| Data & migrations | New migration is additive only (three `CREATE TABLE`s); no landed migration touched; fresh and upgraded databases converge on the same schema (covered by `tests/integration/migration-upgrade.test.ts`). | PASS |

**Post-design re-check (after Phase 1)**: PASS — the design adds no new projects, no new frameworks, no lossy schema changes, and no MCP surface beyond the five tools the spec names. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-calendar-sync/
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
├── server/
│   ├── db/
│   │   └── schema.ts                        # + calendarEvents, calendarEventParticipants, calendarSyncRuns
│   ├── services/
│   │   ├── calendar/                        # NEW — mirrors services/email/
│   │   │   ├── provider.ts                  # CalendarProvider interface + CalendarEvent/CalendarWindow types
│   │   │   ├── graph-provider.ts            # GraphCalendarProvider (calendarView + @odata.nextLink paging)
│   │   │   ├── fake-provider.ts             # FakeCalendarProvider (seedable; test + dev)
│   │   │   ├── sync.ts                      # runCalendarSync: upsert, change detection, cancellation marking
│   │   │   ├── queries.ts                   # listEvents, getEvent, eventsForPerson, calendar run queries
│   │   │   └── dev-seed.ts                  # seeded fake calendar for MAIL_PROVIDER=fake dev runs
│   │   ├── email/
│   │   │   ├── graph-auth.ts                # SCOPES gains 'Calendars.Read' (line 5)
│   │   │   ├── sync-coordinator.ts          # single-flight guard extended: triggerCalendar(), isRunning()
│   │   │   └── queries.ts                   # listUnlinkedAddresses gains event counts / resource exclusion
│   │   ├── contact-entries.ts               # isEmailAddressReferenced also checks calendar participants
│   ├── routes/
│   │   ├── calendar-sync.ts                 # NEW — GET/POST /api/calendar-sync/runs
│   │   └── sync-status.ts                   # NEW — GET /api/sync/status (shared in-progress flag)
│   ├── mcp/
│   │   └── tools.ts                         # + sync-calendar, list-events, get-event, events-for-person; extended list-unlinked-addresses
│   ├── app.ts                               # wires calendarProvider into coordinator/routes/MCP context
│   └── index.ts                             # constructs Graph or fake calendar provider alongside mail
├── client/
│   ├── pages/SyncPage.vue                   # + calendar sync section (rolling ±30-day prefill, own history)
│   └── App.vue                              # nav label "Email Sync" → "Sync"
drizzle/
└── 0002_*.sql                               # NEW migration: three CREATE TABLEs

tests/
├── unit/                                    # calendar-sync-window, calendar-refresh-rules, calendar-graph-provider
├── integration/                             # calendar-sync (MCP e2e), calendar-sync-runs (HTTP), calendar-read-tools, mcp-unlinked-addresses (extended)
└── component/                               # sync-page.test.ts extended with calendar section; app-shell nav rename
```

**Structure Decision**: Keep the existing single-project layout. The calendar service directory (`src/server/services/calendar/`) deliberately mirrors `src/server/services/email/` file-for-file (provider interface → Graph impl → fake impl → sync engine → queries), because every architectural question this feature raises — auth injection, paging, windowing, fakes, run recording — already has an answer there. Shared pieces (address records, sync coordinator, contact-entry referencing) are extended in place rather than duplicated.

## Complexity Tracking

No constitution violations; table intentionally empty.
