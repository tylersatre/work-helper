# Implementation Plan: UI Refresh

**Branch**: `009-ui-refresh` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-ui-refresh/spec.md`

## Summary

Rebuild the web app's presentation layer on Naive UI (a Vue 3, TypeScript-first component library with built-in dark theming) in a dense, data-forward, dark-only style: a shared app shell with a top navigation bar, a full-viewport board with internally scrolling lanes and an inline "+ Add task" control in To Do, an in-app dialog replacing the browser confirm for note deletion, empty states for lanes and the People list, and phone-width usability. The hand-rolled drag-and-drop implementation (Board/Lane/TaskCard DOM structure, drop-index math, optimistic save chain) is preserved as-is and restyled; no server, database, or MCP change of any kind. See [research.md](./research.md) for the library decision and all design approaches.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node >= 22, Vue 3.5 single-file components

**Primary Dependencies**: Vue 3.5 + vue-router 4 + Vite 8 (existing); **Naive UI (new, the component library — decision in research.md R1)**; Fastify 5, Drizzle + better-sqlite3, `@modelcontextprotocol/sdk` (existing, untouched)

**Storage**: SQLite via Drizzle — **no schema changes**; this feature is presentation-layer only

**Testing**: Vitest 4 — unit (`tests/unit`), component via Testing Library + jsdom (`tests/component`), integration (`tests/integration`); browser evidence via the `browser-tester` agent (Playwright MCP) against the dev server; deploy suite (`tests/deploy`) unaffected

**Target Platform**: Self-hosted Docker; modern desktop browsers primary, phone-width (375px) usability required; dev ports for this feature: API 3009, UI 5109 (derived from the `009-` branch prefix by `scripts/dev-ports.sh`)

**Project Type**: Single TypeScript web project — Vue SPA (`src/client`) + Fastify API/MCP server (`src/server`) + shared types (`src/shared`)

**Performance Goals**: No new quantitative targets; the board must stay smooth to drag with 30+ cards in a lane, and the added library must not meaningfully slow dev startup or the production build (tree-shaken imports only)

**Constraints**: Dark theme only (no toggle); dense/data-forward visual direction; the hand-rolled drag-and-drop DOM structure and save-chain logic must be preserved (restyled, not replaced); behavior changes limited to the three named upgrades (inline add form, styled confirm dialog, empty states); the server-rendered MCP password page is untouched; all existing automated tests must keep passing (adapted only where a named upgrade changes the UI they drive)

**Scale/Scope**: 4 pages + app shell, 9 Vue components, ~10 component test files to adapt/extend; single user (Tyler)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec Is the Source of Truth | ✅ Pass | Plan derives from `specs/009-ui-refresh/spec.md`, itself from the Tyler-approved PRD `docs/product/features/ui-refresh.md`. |
| II. Test-First (NON-NEGOTIABLE) | ✅ Pass | Every behavioral change (shell nav, inline add control, dialog, empty states, full-height layout, phone usability) gets a failing component/integration test before code. Pure visual styling (colors, spacing) has no unit-testable behavior; it is pinned by the structural assertions in tests plus browser evidence, per the spec's split between automated criteria and Tyler's manual pass. |
| III. Definition of Done: Evidence Over Assertion | ✅ Pass | All UI criteria get browser-tester evidence in `docs/evidence/009-ui-refresh/`; FR-011's regression gate is the full suite run recorded as automated-check output; verifier re-runs both. |
| IV. Architecture Constraints | ✅ Pass | TypeScript throughout; no MCP framework change (MCP untouched entirely); no ingestion change; Docker build unaffected (Naive UI is a normal npm dependency bundled by Vite). Frontend stays Vue 3 + Vite per standing decision. |
| V. Small Vertical Slices, Trunk via PR | ✅ Pass | One feature branch `009-ui-refresh`, lands via PR with CI review; Conventional Commits. |

**Post-Phase-1 re-check**: ✅ Pass — the design adds one npm dependency and touches only `src/client` plus component tests; no constitution principle is affected by the Phase 1 artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/009-ui-refresh/
├── plan.md              # This file
├── research.md          # Phase 0: library choice + design approaches
├── data-model.md        # Phase 1: no data changes (documented) + UI view-state
├── quickstart.md        # Phase 1: run/validate guide
├── contracts/
│   └── ui-contract.md   # Phase 1: stable testids/roles + "no API/MCP changes" statement
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/client/                       # ALL feature work happens here
├── main.ts                       # + Naive UI providers wiring
├── theme.ts                      # NEW: dark theme overrides (design tokens)
├── App.vue                       # app shell: top nav bar, active marking, dark background
├── router.ts                     # unchanged (same 4 routes)
├── pages/
│   ├── BoardPage.vue             # drops the top-level CreateTaskForm; board fills viewport
│   ├── TaskDetailPage.vue        # restyled
│   ├── PeoplePage.vue            # restyled + empty state
│   └── PersonDetailPage.vue      # restyled
├── components/
│   ├── Board.vue                 # restyled (full-height flex, horizontal overflow); DnD logic untouched
│   ├── Lane.vue                  # restyled (internal scroll, header, empty placeholder, To Do add control slot)
│   ├── TaskCard.vue              # restyled; DnD handlers untouched
│   ├── CreateTaskForm.vue        # becomes the inline "+ Add task" lane-footer control
│   ├── TaskNotes.vue             # restyled; delete flows through confirm dialog
│   ├── NoteItem.vue              # window.confirm() removed → emits delete-request to dialog
│   ├── LinkedPeople.vue          # restyled
│   ├── PersonForm.vue            # restyled, inline validation placement
│   └── ContactEntryList.vue      # restyled
src/server/                       # UNTOUCHED (incl. MCP password page)
src/shared/                       # UNTOUCHED
tests/
├── component/                    # adapted for Naive UI rendering + new behavior tests (TDD)
├── unit/                         # unchanged (drop-index, validation, etc. still pass)
├── integration/                  # unchanged (API behavior identical)
└── deploy/                       # unchanged
docs/evidence/009-ui-refresh/     # browser-tester evidence for acceptance
```

**Structure Decision**: Keep the existing single-project layout; the feature is confined to `src/client` (plus its component tests and `package.json` for the new dependency). No new directories beyond `src/client/theme.ts` and the evidence folder.

## Complexity Tracking

No constitution violations — table not needed.
