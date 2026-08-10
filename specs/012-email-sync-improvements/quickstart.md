# Quickstart: Validating Email Sync Improvements

Runnable scenarios proving the feature end-to-end. Contracts: [http-api.md](./contracts/http-api.md), [mcp-tools.md](./contracts/mcp-tools.md); schema: [data-model.md](./data-model.md).

## Prerequisites

- Node >= 22, dependencies installed (the worktree SessionStart hook runs `npm install`).
- Work from this worktree root: `/Users/tyler/work-helper/.claude/worktrees/tidy-sparking-kahan`.
- Branch `012-email-sync-improvements` → dev ports: API **3012**, UI **5112** (`npm run dev` derives them).
- The dev database may be deleted/recreated freely (dev-phase data policy) — the schema change requires a reset.
- No real mailbox needed: automated checks and browser evidence run against `FakeMailProvider` seeding (integration tests construct the app directly; the browser-tester flow uses the same seeded-app harness the UI tests document in `tests/`). Tyler's real-mailbox pass (`npm run mail:signin`, then sync from the page) is manual acceptance only.

## Full verification gate

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all pass; the Stop-hook gate enforces the same four.

## Scenario checks (automated)

Run the feature's test slices individually while implementing:

```bash
npx vitest run tests/integration/email-sync-runs.test.ts   # US1: run history, single-flight, web routes, source attribution, failure recording
npx vitest run tests/integration/email-sync.test.ts        # US2–US4: capture fields, folder coverage/exclusion, refresh + counts
npx vitest run tests/integration/email-read-tools.test.ts tests/integration/mcp-read-tools.test.ts  # FR-010: new fields through MCP read tools
npx vitest run tests/component/sync-page.test.ts tests/component/app-shell.test.ts                  # US1 UI: prefill, validation, busy state, history, nav link
npx vitest run tests/unit                                  # folder pruning, refresh rules, window math
```

Expected outcomes map to acceptance scenarios:

| Spec scenario | Check | Expected |
|---|---|---|
| US1-1 nav + empty state | component: app-shell + sync-page | "Email Sync" link active on `/sync`; pickers prefilled (today−30 → today); "No syncs yet" empty state |
| US1-2 run + history | integration: email-sync-runs | POST → 201, `status: success`, 2 new / 0 updated; GET runs lists it (source `web`) after app restart against the same DB file |
| US1-3 prefill | component + integration | newest successful run's `endDate` returned first by GET runs; page prefills start from it |
| US1-4 validation | integration + component | 400 on missing dates and start>end; no run row; inline message shown |
| US1-5 failure surfaced | integration: email-sync-runs | provider `failImmediately` → 201 with `status: failure` + error text; row persists |
| US1-6 MCP source | integration: MCP sync tests | `sync-emails` run appears in GET runs with source `mcp` and counts |
| US2-1 full capture | integration: email-sync + read tools | seeded "Quote attached" message returns every FR-009 field through `get-conversation` |
| US2-2 indicators | integration: read tools | `list-conversations` entry has `hasUnread: true`, `hasAttachments: true`, participants |
| US3-1 folders | integration: email-sync | 3 new (Inbox/Archive/Projects with those folder names); Junk/Drafts/Deleted Items absent |
| US4-1 refresh | integration: email-sync | overlapping re-sync → 0 new / 1 updated; `isRead`/`sourceFolder` current; subject/body/participants/timestamps byte-identical; no duplicate |
| Edge: already-running | integration: email-sync-runs | concurrent trigger → 409 / tool error; single run row |
| Edge: empty range | integration: email-sync-runs | 201, success, 0 new / 0 updated, history row present |
| Edge: partial failure | integration: email-sync-runs | provider fails mid-run → 201 with `status: failure`, error text, partial newCount in the row; a later overlapping sync stores the remainder with no duplicates |

## Browser evidence (US1, UI-facing)

```bash
npm run dev   # API :3012, UI :5112
```

Then the `browser-tester` agent executes US1 scenarios 1–5 against `http://localhost:5112` (seeded fake-mail app for scenario 2; unreachable-mailbox setup for scenario 5), saving screenshots + results to `docs/evidence/email-sync-improvements/`. The `verifier` agent independently re-runs the gate and cross-checks evidence against every acceptance criterion before the feature is reported done.

## Manual smoke (optional, real mailbox)

```bash
npm run mail:signin   # server-side Graph connect (operator step)
npm run dev
```

Open `http://localhost:5112/sync`, click Sync with the prefilled range, and confirm the result counts and a new history row; verify a message's metadata via an authorized MCP client's `get-conversation`.
