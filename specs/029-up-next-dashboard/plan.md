# Implementation Plan: Up Next Dashboard

**Branch**: `029-up-next-dashboard` | **Date**: 2026-08-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/029-up-next-dashboard/spec.md`

## Summary

A new `/up-next` page renders a single flat, glanceable list of the top cards to work on next — ordered by configured lane order then manual board order, filtered and capped by a single server-side saved view — with quick-done and inline add-note actions on each card, the full task detail available as an overlay, and a 45-second poll keeping the list current. Technical approach: one new `GET /api/dashboard` endpoint returns all non-archived cards (enriched with tags, latest note, linked people/companies, and the board's `searchText` corpus) plus the lane-config designations and the raw saved view; the client computes the effective view and filters locally, reusing the shared `matchesBoardFilter` predicate verbatim so board-search-filter semantics hold by construction. The saved view persists as a JSON blob in the existing `app_state` table (**no schema migration**), and the lane config file gains two optional, backward-compatible designations (`dashboardDefaultLanes`, `quickDoneLane`) with first-lane/last-lane fallbacks. Quick done and add-note reuse the existing placement and notes endpoints unchanged; the detail overlay reuses the detail page's body, extracted into a `TaskDetail` component. Full decisions with rationale: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x throughout (Node 22 server, Vue 3 `<script setup>` client)

**Primary Dependencies**: Fastify 5, drizzle-orm + better-sqlite3, zod, Vue 3 + vue-router, naive-ui, Vite; MCP server on `@modelcontextprotocol/sdk` (untouched — no new/changed MCP tools per spec)

**Storage**: SQLite via better-sqlite3; saved view in the existing `app_state` key/value table under key `dashboard.view` — no migration; lane designations in `config/lanes.json` (backward-compatible union format, applied by restart)

**Testing**: Vitest — `tests/unit/` (pure logic, config loader), `tests/integration/` (Fastify `app.inject` + in-memory migrated DB; MCP via real SDK client against a listening app), `tests/component/` (@testing-library/vue, jsdom pragma, mocked fetch); browser evidence via the `browser-tester` agent (Playwright MCP) against the dev server

**Target Platform**: self-hosted Docker (Linux), dev on macOS; dark-theme desktop browser

**Project Type**: web application — Fastify API + Vue SPA in one repo (`src/server`, `src/client`, `src/shared`)

**Performance Goals**: poll interval 45s (≤60s bound, change visible ≤90s per SC-004); live popup preview re-filters client-side with zero network requests; single dashboard request per poll tick

**Constraints**: production data exists — no lossy schema changes (this plan needs no migration at all); deployed legacy-array `lanes.json` (bind-mounted volume) must keep booting the app; board page and its filter bar must not change; no new MCP surface; TDD mandatory (red → green)

**Scale/Scope**: single-user personal CRM (one saved view, no auth on `/api/**`); board scale ~tens–hundreds of cards, so returning all non-archived cards in one payload is cheap; ~1 new route module, ~5 new client components, 1 refactor (TaskDetail extraction), 2 extended files (lanes-config, App shell)

## Constitution Check

*GATE: evaluated before Phase 0 research; re-evaluated after Phase 1 design — both passes clean, no violations to justify.*

| Principle | Status | How this plan complies |
| --- | --- | --- |
| I. Spec Is the Source of Truth | PASS | Approved PRD `docs/product/features/up-next-dashboard.md` → spec.md on this branch; plan artifacts trace every decision to an FR/edge case. |
| II. Test-First (NON-NEGOTIABLE) | PASS | quickstart.md §1 enumerates the failing tests to write first per surface (unit loader/view logic, integration routes, component page behavior); `/speckit-tasks` will order red → green; no code precedes its failing test. |
| III. Evidence Over Assertion | PASS | quickstart.md maps every FR/SC to an automated check and lists the browser-tester evidence per story (incl. the two-part Story 5 split: MCP move via integration test + untouched-page poll update in the browser); `verifier` agent re-runs the gate independently. |
| IV. Architecture Constraints | PASS | TypeScript only; MCP server untouched (spec forbids new tools); no ingestion changes; Docker deploy unaffected — legacy config format stays valid so the bind-mounted production `lanes.json` keeps working. |
| V. Small Vertical Slices, Trunk via PR | PASS | One feature branch, lands via PR with CI review; stories P1→P5 are independently testable slices within the branch. |
| Data & migrations | PASS | Zero schema changes: the saved view reuses the existing `app_state` table (research D1). Nothing lossy; no migration file to write, so no immutability risk. |

**Post-design re-check (after Phase 1)**: design added no projects, no new frameworks, no migration, and no MCP surface; the only refactor (TaskDetailPage → TaskDetail component + thin wrapper) follows the existing BoardPage → Board precedent. Gates unchanged: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/029-up-next-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D14 (storage, config format, data flow, poll, popups, overlay, acceptance env)
├── data-model.md        # Phase 1 — DashboardSavedView, LanesConfig, DashboardCard, view-selection functions, state transitions
├── quickstart.md        # Phase 1 — validation guide: gate commands, minimum coverage per FR, browser-evidence setup + checklist
├── contracts/
│   ├── dashboard-api.md # GET /api/dashboard, PUT /api/dashboard/view, reused placement/notes/detail contracts
│   └── lanes-config.md  # Extended lane-config union format, validation, fallbacks
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── types.ts                      # EXTEND: DashboardCard, DashboardSavedView, DashboardResponse
│   ├── validation.ts                 # EXTEND: dashboardSavedViewSchema (shared client-pre-validate + server PUT-validate)
│   └── board-filter.ts               # REUSE as-is: matchesBoardFilter (FR-010 semantics)
├── server/
│   ├── lanes-config.ts               # EXTEND: union file schema, normalized { lanes, dashboard: { defaultLanes, quickDoneLane } } return
│   ├── index.ts                      # EXTEND: pass dashboard lane designations into buildApp
│   ├── app.ts                        # EXTEND: optional dashboardLanes option (first/last fallback inside), decorate, register dashboardRoutes
│   ├── routes/dashboard.ts           # NEW: GET /api/dashboard, PUT /api/dashboard/view
│   └── services/dashboard.ts         # NEW: enriched card projection (reuses tasks-service grouping + searchText builder; adds latest-note projection)
└── client/
    ├── router.ts                     # EXTEND: /up-next route
    ├── App.vue                       # EXTEND: nav link + activeSection branch (before the 'board' fallback)
    ├── pages/
    │   ├── UpNextPage.vue            # NEW: thin page shell (BoardPage precedent)
    │   └── TaskDetailPage.vue        # REFACTOR: thin route wrapper around extracted TaskDetail
    ├── components/
    │   ├── UpNextDashboard.vue       # NEW: fetch/poll/state + popups + overlay orchestration
    │   ├── UpNextCard.vue            # NEW: card face (TagChip reuse), quick-done, inline add-note
    │   ├── UpNextDisplayPopup.vue    # NEW: four display toggles, live preview, OK/confirm-discard
    │   ├── UpNextFilterPopup.vue     # NEW: lanes/tags/text/limit, live preview, OK/confirm-discard, invalid-view guard
    │   └── TaskDetail.vue            # NEW (extracted): detail body with taskId prop + emits instead of router.push
    └── utils/up-next-view.ts         # NEW: pure effective-view / selectCards / tagOptions functions

config/lanes.json                     # UNCHANGED (legacy form — exercises fallback path in dev/deploy)

tests/
├── unit/
│   ├── lanes-config.test.ts          # EXTEND: union format + fallbacks + error messages
│   └── up-next-view.test.ts          # NEW: effective view, stale-entry tolerance, ordering, limit-after-filter, tag options
├── integration/
│   └── dashboard.test.ts             # NEW: GET/PUT contract, enrichment, archived exclusion, corrupt-blob tolerance, MCP-move reflection
└── component/
    ├── app-shell.test.ts             # EXTEND: Up Next nav + active section
    └── up-next-page.test.ts          # NEW: default render, quick actions, popups, overlay, poll non-clobber (fake timers)
```

**Structure Decision**: the repo's established single-app layout (`src/server` Fastify + `src/client` Vue SPA + `src/shared` isomorphic code) is kept; the feature adds one route module + one service on the server, one page + five components + one pure-logic util on the client, and shared types/schema — mirroring how the board and detail features are laid out today. `eslint.config.js` already covers the touched test directories; no config additions beyond the union schema in `lanes-config.ts`.

## Complexity Tracking

No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
