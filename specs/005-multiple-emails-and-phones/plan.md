# Implementation Plan: Multiple Emails and Phones per Person

**Branch**: `005-multiple-emails-and-phones` | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-multiple-emails-and-phones/spec.md`

## Summary

Replace the single `email`/`phone` columns on `people` with two child tables, `person_emails` and `person_phones`, each row holding one value plus an `is_primary` flag, with DB-level uniqueness (case-insensitive for emails via `lower(value)`, exact text for phones) and a partial unique index guaranteeing at most one primary per person per type. A single drizzle migration creates the tables, carries every existing single email/phone over as that person's primary entry, and drops the old columns (verified by an automated carry-over test on seeded data — there is no production data). The service layer gains add/edit/mark-primary/remove operations that run in transactions and enforce the exactly-one-primary invariant (first entry becomes primary; removing the primary promotes the lowest-id survivor); REST sub-resource routes expose them under `/api/people/:id/emails` and `/api/people/:id/phones`. Person payloads now carry full `emails`/`phones` arrays; the people list and the MCP tools (`search-people`, `get-person`, `get-task`) present the primary values so their output schemas keep their existing shape. On the client, a generic `ContactEntryList` component (used twice on `PersonDetailPage`) handles all entry management, `PersonForm` keeps its single email/phone inputs for create only and hides them for edit, and the create flow now rejects duplicate phones as well as duplicate emails. Full decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥ 22, ESM throughout (existing project settings)

**Primary Dependencies**: Fastify 5, drizzle-orm ^0.45 + better-sqlite3, zod ^4.4, Vue 3 + vue-router (all existing); **no new dependencies**

**Storage**: SQLite via drizzle — two new tables `person_emails` and `person_phones` (value, `is_primary`, FK to `people` with cascade delete); the `people.email` and `people.phone` columns are migrated into them and dropped in the same migration (0004)

**Testing**: vitest — unit tests for the entry-value schema (trim/blank rejection); integration tests for the sub-resource routes, uniqueness/promotion/invariant behavior, the changed create/update person flows, MCP tool primary projection, and a migration carry-over test that replays migrations 0000–0003 on a raw SQLite handle, seeds legacy rows, applies 0004, and asserts the primary entries; component tests for the entry lists, the person detail page (primary display and entry-list mounts), and the trimmed edit form; `browser-tester` agent evidence for the user stories

**Target Platform**: self-hosted Docker, single-user web app (unchanged)

**Project Type**: single web application — Fastify server + Vue 3 SPA in one package (unchanged)

**Performance Goals**: single-user system, no throughput targets; entry counts per person are single-digit, so list rendering and uniqueness checks are trivial index lookups

**Constraints**: phone values are compared as exact stored text — no normalization ("555-0100" ≠ "5550100"); email uniqueness is case-insensitive via SQLite `lower()` (ASCII case folding, same as the existing `people_email_unique` index it replaces); values are trimmed before validation and comparison; an entry never conflicts with itself (edits exclude the entry's own id); MCP tool output schemas must not change shape — `email`/`phone` fields carry the primary values (FR-012); the edit-person form loses its email/phone inputs entirely (FR-015); people search keeps its existing reach (name + primary email substring) — matching non-primary addresses is explicitly out of scope

**Scale/Scope**: one user, tens of people, single-digit entries per person; 8 new REST endpoints, 2 new tables, 1 new Vue component, 0 new MCP tools

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-research | Post-design |
|---|---|---|---|
| I | Spec is the source of truth | PASS — PRD `docs/product/features/multiple-emails-and-phones.md` → `/speckit-specify` → `spec.md` with clarifications resolved 2026-08-07 | PASS — every table, route, and component traces to an FR; out-of-scope list respected (no labels, no multi-entry create inputs, no normalization, no new MCP tools, no search-by-any-address) |
| II | Test-first (non-negotiable) | PASS — plan commits to failing-test-first; every behavior (uniqueness, promotion, migration carry-over) is assertable via vitest before code exists | PASS — [quickstart.md](quickstart.md) names the test surfaces; contracts specify exact status codes, messages, and payload shapes to assert against |
| III | Evidence over assertion | PASS — acceptance split defined: vitest integration + component tests, browser-tester evidence per user story into `docs/evidence/multiple-emails-and-phones/`, verifier confirms both | PASS — evidence plan concretized in quickstart, including the seeded-data migration test standing in for production-data verification per the 2026-08-07 clarification |
| IV | Architecture constraints | PASS — TypeScript throughout; no MCP framework changes (existing `@modelcontextprotocol/sdk` server, tool schemas unchanged); no email ingestion touched; Docker deployment unaffected | PASS — design adds only drizzle tables, Fastify routes, and Vue components; MCP tools keep their contracts and gain primary projection only |
| V | Small vertical slices, trunk via PR | PASS — one branch `005-multiple-emails-and-phones`, lands via PR; P1 (emails) is independently shippable, P2 (phones) mirrors it, P3 (validation) rides on both | PASS — no scope growth during design; the generic entry component keeps the phone slice thin |

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-multiple-emails-and-phones/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D11
├── data-model.md        # Phase 1 — person_emails/person_phones tables, read models, invariants, migration
├── quickstart.md        # Phase 1 — run + validate guide, evidence map
├── contracts/
│   ├── http-api.md      # Phase 1 — entry sub-resource routes + changed person routes
│   └── mcp-tools.md     # Phase 1 — unchanged tool shapes, primary-value projection
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── db/
│   │   ├── schema.ts                  # MODIFIED — drop email/phone from people; add personEmails, personPhones
│   │   └── index.ts                   # unchanged (migrations auto-run)
│   ├── services/
│   │   ├── people.ts                  # MODIFIED — create/update split, read model with entry arrays + primary projection
│   │   └── contact-entries.ts         # NEW — add/edit/markPrimary/remove for both entry types, uniqueness + promotion
│   ├── routes/
│   │   └── people.ts                  # MODIFIED — entry sub-resource endpoints, phone-conflict on create, trimmed update
│   └── mcp/
│       └── tools.ts                   # MODIFIED — project primary email/phone into existing tool outputs
├── shared/
│   ├── types.ts                       # MODIFIED — ContactEntry; Person carries emails[]/phones[]
│   └── validation.ts                  # MODIFIED — entryValueSchema; create vs update person schemas
└── client/
    ├── components/
    │   ├── ContactEntryList.vue       # NEW — generic add/edit/mark-primary/remove list, used for emails and phones
    │   └── PersonForm.vue             # MODIFIED — contact inputs shown only in create mode
    └── pages/
        ├── PeoplePage.vue             # MODIFIED — rows show primary email/phone from entry arrays
        └── PersonDetailPage.vue       # MODIFIED — two ContactEntryList sections; edit form without email/phone

drizzle/
└── 0004_*.sql                         # NEW — tables + carry-over + column drop (single migration)

tests/
├── unit/validation.test.ts            # MODIFIED — entry value trim/blank cases
├── integration/
│   ├── contact-entries.test.ts        # NEW — add/edit/primary/remove/uniqueness/promotion via routes
│   ├── migration-carry-over.test.ts   # NEW — seeded legacy DB through migration 0004 (SC-002)
│   ├── people.test.ts                 # MODIFIED — create with phone conflict, update without email/phone
│   └── mcp-read-tools.test.ts         # MODIFIED — primary projection in search-people/get-person/get-task
└── component/
    ├── contact-entry-list.test.ts     # NEW — list rendering, primary marker, validation messages
    ├── person-detail-page.test.ts     # NEW — primary display, entry-list mounts, contact-less edit form
    ├── person-form.test.ts            # MODIFIED — create keeps contact inputs, edit hides them
    └── people-page.test.ts            # MODIFIED — primary values in rows
```

**Structure Decision**: Keep the existing single-package layout. The feature is a vertical slice through the established layers — drizzle schema/migration → service (`contact-entries.ts` new, `people.ts` reshaped) → Fastify routes → shared types → Vue components — with no new architectural elements.
