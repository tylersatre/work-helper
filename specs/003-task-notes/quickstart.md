# Quickstart: Task Notes — validation guide

**Branch**: `003-task-notes` | **Date**: 2026-08-06

Runnable scenarios proving the feature end-to-end. Contract details live in [contracts/http-api.md](./contracts/http-api.md); entities and validation rules in [data-model.md](./data-model.md).

## Prerequisites

```bash
npm install    # includes the new markdown-it dependency
npm run dev    # Fastify API on :3000, Vite client on :5173
```

For a clean slate, remove `data/work-helper.db` before starting (dev DB is disposable) — it is recreated and migrated on server start, which also applies the new `task_notes` migration.

The MCP-note seed below uses the `sqlite3` CLI — preinstalled on macOS; install it (`apt-get install sqlite3` / `brew install sqlite3`) if the environment lacks it.

## Automated gates (must all pass before any manual validation counts)

```bash
npm run lint
npm run typecheck
npm test          # unit + integration + component, incl. the 11 contract obligations
npm run build
```

## API smoke (curl against the dev server)

```bash
# Create a task with a first note — expect 201
curl -sS -X POST localhost:3000/api/tasks -H 'content-type: application/json' \
  -d '{"title":"Prep board deck","note":"Kickoff call went well"}'

# Detail — expect notes to contain exactly the one note, source "ui" (note the returned task id)
curl -sS localhost:3000/api/tasks/1

# Create a task without a note — expect 201, then notes: [] in its detail
curl -sS -X POST localhost:3000/api/tasks -H 'content-type: application/json' -d '{"title":"Book flights"}'
curl -sS localhost:3000/api/tasks/2

# Add two notes from the detail-view path — expect 201 each
curl -sS -X POST localhost:3000/api/tasks/1/notes -H 'content-type: application/json' -d '{"text":"First note"}'
curl -sS -X POST localhost:3000/api/tasks/1/notes -H 'content-type: application/json' -d '{"text":"Second note"}'

# Ordering — expect Second note before First note (newest first)
curl -sS localhost:3000/api/tasks/1

# Validation — expect 400 "Note text is required"
curl -sS -X POST localhost:3000/api/tasks/1/notes -H 'content-type: application/json' -d '{"text":"   "}'

# Delete a note — expect 204, then its absence from the detail
curl -sS -X DELETE localhost:3000/api/tasks/1/notes/2
curl -sS localhost:3000/api/tasks/1

# Wrong-task note id — expect 404 "Note not found"
curl -sS -X DELETE localhost:3000/api/tasks/2/notes/3
```

## Seeding an MCP note (US5 — no MCP tools exist yet)

Insert directly into the dev DB, per the spec's assumption that only seeding can create `"mcp"` notes this slice:

```bash
sqlite3 data/work-helper.db \
  "INSERT INTO task_notes (task_id, text, source, created_at) VALUES (1, 'Synced from assistant', 'mcp', strftime('%s','now')*1000);"
```

For the "2 days ago" timestamp check (US1-3), seed with `(strftime('%s','now') - 2*24*60*60)*1000` as `created_at`.

## Browser scenarios (`browser-tester` agent — evidence to `docs/evidence/task-notes/`)

Run against the Vite dev URL with the Playwright context's `timezoneId` pinned to `'America/Denver'`, so the local-time hover assertions are deterministic regardless of where the tests run. One evidence set (screenshots + results) per user story; scenario wording follows the spec's acceptance scenarios. Native `confirm` dialogs are handled via Playwright's dialog handling. Timestamp-string assertions here and in the automated tests compare after normalizing U+202F (the narrow no-break space some ICU builds emit before AM/PM) to a regular space, so the spec's pinned "Aug 4, 2026, 12:00 PM" literal holds across Node and Chromium ICU versions.

1. **US1 — add & revisit**: open a task's detail view → type "Waiting on budget numbers" → submit → note appears labeled "You" with a relative timestamp → reload → note persists → add "Second note" → it sits above the first → seed a note 2 days old → its label reads "2 days ago" and hovering shows the absolute local date/time (e.g. a note stored at 2026-08-04T18:00:00Z hovers as "Aug 4, 2026, 12:00 PM" with the browser in America/Denver) → submit whitespace-only input → validation message "Note text is required", no note added. Record the elapsed time from opening the detail view to the first note appearing in the list — evidence toward SC-001's 15-second bound.
2. **US2 — creation-time note**: on the board, create "Prep board deck" with note "Kickoff call went well" → card appears in "To Do" → its detail shows exactly one note, "You", "just now" → create "Book flights" with the note field blank → its detail shows an empty notes section with the add-note input present.
3. **US3 — delete with safety net**: on a task with "First note" and "Second note", delete "First note" and accept the confirm dialog → gone, "Second note" untouched, still gone after reload → start deleting "Second note" but dismiss the dialog → it remains, unchanged.
4. **US4 — markdown**: add the spec's markdown note (`**Urgent:** call *Sam* about [pricing](https://example.com/pricing) — see \`deck.pdf\`` plus the two-item list) → bold "Urgent:", italic "Sam", "pricing" hyperlinked to https://example.com/pricing, `deck.pdf` in code formatting, a two-item bulleted list — zero raw markdown characters visible. Then add a second note exercising the rest of the FR-008 set — a `## Recap` heading, a two-item numbered list, and a fenced code block — and confirm each renders as its formatted element (heading, ordered list, code block), so browser evidence covers every supported construct (SC-005).
5. **US5 — provenance labels**: with a seeded `source: "mcp"` note "Synced from assistant" and a UI-added note on the same task, the detail view shows "via MCP" on the seeded note and "You" on the other, each with its timestamp; delete the MCP note behind the same confirm dialog to prove uniform deletion.

**Edge checks** (fold into the closest story's run): a note containing `<script>alert(1)</script>` and an `<img onerror=...>` renders as inert literal text (US1 or US4 run); a stray unclosed `**` renders as ordinary text without breaking the list (US4); deleting a task's only note returns the section to the empty state with the input still present (US3); a long note with a code block shows in full, untruncated (US4); the kanban board and card faces look identical before and after the feature — no count, badge, or icon (US2 run, FR-013/SC-006); no edit affordance appears on any note (all runs, FR-012).

## Acceptance criteria → check mapping

| Spec item | Automated check | Browser evidence |
|-----------|-----------------|------------------|
| US1 (FR-003..006, FR-010) | `tests/integration/task-notes.test.ts` (obligations 1–5), `tests/unit/time.test.ts`, `tests/component/task-notes.test.ts`, `task-detail.test.ts` | Scenario 1 |
| US2 (FR-001, FR-002) | `tests/integration/tasks.test.ts` (obligations 6–7), `tests/component/create-task-form.test.ts` | Scenario 2 |
| US3 (FR-011, FR-012) | `tests/integration/task-notes.test.ts` (obligations 8–9, 11), `tests/component/task-notes.test.ts` (confirm & cancel branches) | Scenario 3 |
| US4 (FR-008, FR-009) | `tests/unit/markdown.test.ts` (constructs, HTML/script inert, `javascript:` links refused), `tests/component/task-notes.test.ts` | Scenario 4 |
| US5 (FR-007) | `tests/integration/task-notes.test.ts` (obligation 10), `tests/component/task-notes.test.ts` (label mapping) | Scenario 5 |
| FR-013 / SC-006 | no card-component changes in the diff; existing `tests/component/task-card.test.ts` and `board.test.ts` still green | Scenario 2 board check |
| SC-001 | structurally met — single-round-trip endpoints, no step beyond typing and submitting (plan Technical Context) | Scenario 1 timed add-note flow |

Done means: every row has both columns green, independently confirmed by the `verifier` agent (constitution III) — assertions without command output or screenshots do not count.
