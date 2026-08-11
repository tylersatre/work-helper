# Quickstart: email-ui validation

**Feature**: 014-email-ui | **Date**: 2026-08-11 | Validates [spec.md](spec.md) acceptance scenarios via [contracts/](contracts/) and [data-model.md](data-model.md)

## Prerequisites

- Node ≥22, dependencies installed (`npm install` — the worktree SessionStart hook does this).
- Branch `014-email-ui` worktree → dev ports **API 3014 / UI 5114** (derived by `scripts/dev-ports.sh`).
- No real mailbox needed: all automated validation uses `FakeMailProvider`; only Tyler's manual acceptance pass touches real synced mail.

## The gate (every acceptance criterion needs these green)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

This is exactly what the Stop-hook gate (`.claude/hooks/gate.sh`) runs; the `verifier` agent re-runs it independently.

## Run the app with the scenario mailbox

```bash
MAIL_PROVIDER=fake MAIL_AUTH=fake DATABASE_PATH=./data/email-ui-evidence.db npm run dev
```

`MAIL_PROVIDER=fake` serves the extended `dev-seed.ts` mailbox (research R10): the US1 "Pricing question"/"Quote attached" pair with exact spec metadata, 30 conversations for load-more, the script-bearing HTML body, an inline-only-attachment message, unmatched addresses (`ana.alvarez@…` as cc, `jordan.smith@…` as from), and Sam Rivera's second address. A fresh `DATABASE_PATH` starts the store empty — capture empty-state evidence **before** the first sync.

Evidence flow (per `browser-tester` conventions — UI only, screenshots to `<main checkout>/docs/evidence/014-email-ui/`):

1. Open `http://localhost:5114/emails` on the fresh DB → nav active state + "No conversations yet" empty state (US1 sc1).
2. Create people through the People page UI as scenarios need them (sync never creates people): Sam Rivera with `sam.rivera@example.com` (+ `sam.personal@example.com` for US3), Ana Alvarez **without** her address (US4 sc1).
3. Run a sync from the Sync page (fake mailbox, any covering date range) → list scenarios (US1 sc2–3), detail scenarios (US2), person-section scenarios (US3), linking scenarios (US4, including a page reload after each link).

## Story-by-story validation map

| Scenario | Surface | Automated check | Evidence |
|---|---|---|---|
| US1 sc1 — nav + empty state | UI | `emails-page.test.ts`, `app-shell.test.ts`; `email-api.test.ts` empty-store response | browser-tester |
| US1 sc2 — ordering, row fields, indicators | UI | `emails-page.test.ts`; `email-api.test.ts` rollups (incl. inline exclusion) | browser-tester |
| US1 sc3 — 25 + load-more → 30 | UI | `email-api.test.ts` cursor paging; `emails-page.test.ts` load-more presence/absence | browser-tester |
| US2 sc1 — oldest-first, rich rendering, script inert | UI | `email-body.test.ts` + `sanitize-email.test.ts` (script stripped, bold/link kept); `email-conversation-page.test.ts` order | browser-tester (asserts no script-injected content) |
| US2 sc2 — full metadata + attachment + Outlook link | UI | `email-api.test.ts` detail fields; `email-conversation-page.test.ts` rendering | browser-tester |
| US2 sc3 — linked address → person record | UI | `email-conversation-page.test.ts` linked rendering | browser-tester |
| US3 sc1 — 5 newest + roles + show-all + click-through | UI | `email-api.test.ts` roles rollup; `person-email-section.test.ts` | browser-tester |
| US3 sc2 — person-section empty state | UI | `person-email-section.test.ts` | browser-tester |
| US4 sc1 — link via search, persists reload | UI | `email-person-linking.test.ts` via new endpoint | browser-tester (incl. reload) |
| US4 sc2 — create person prefilled, linked | UI | `email-format.test.ts` name split; `email-person-linking.test.ts` | browser-tester (incl. reload) |
| FR-018 — sync records `isInline`; MCP unchanged | API/MCP only | `email-sync-runs.test.ts` (ingestion), `email-read-tools.test.ts` (MCP regression) | recorded test output |
| FR-019 — backfill flags historical rows | API only | `attachment-backfill.test.ts` (match, skip, abort/retry, marker, triggers) | recorded test output |

## Verifying the migration (production policy)

```bash
npx drizzle-kit generate
```

must yield a `drizzle/0001_*.sql` containing only `ALTER TABLE email_attachments ADD COLUMN is_inline ...` and `CREATE TABLE app_state ...` — no table recreation. Confirm both fresh-DB and upgrade paths converge: `tests/integration/db.test.ts` (fresh `:memory:` migration) stays green, and starting the server against a copy of an existing dev DB applies `0001` without data loss. The `0000` baseline is never edited.

## Backfill sanity check (fake mailbox, no real Graph)

Covered end-to-end by `attachment-backfill.test.ts`; to observe it live: sync once against the fake mailbox (stores attachment rows with flags), manually `UPDATE email_attachments SET is_inline = 0; DELETE FROM app_state;` in the dev DB, restart the server → startup trigger re-fetches from the fake provider and restores the flags, then writes the `app_state` marker. On Tyler's server the same happens on first deploy via the persisted MSAL token cache, or after the next sync.

## Expected end state

- All four user stories pass in the browser with screenshots + `results.md` under `docs/evidence/014-email-ui/`.
- Gate green; MCP regression tests prove `list-conversations`/`get-conversation`/`emails-for-person` output is unchanged.
- `git status` shows the schema edit + exactly one new migration file committed together.
