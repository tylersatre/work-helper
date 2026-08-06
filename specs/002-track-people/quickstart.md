# Quickstart: Track People — validation guide

**Branch**: `002-track-people` | **Date**: 2026-08-06

Runnable scenarios proving the feature end-to-end. Contract details live in [contracts/http-api.md](./contracts/http-api.md); entities and validation rules in [data-model.md](./data-model.md).

## Prerequisites

```bash
npm install                    # includes the new vue-router dependency
cat config/person-fields.json  # expect e.g. ["Nickname"] (US5) — [] disables extra fields
npm run dev                    # Fastify API on :3000, Vite client on :5173
```

For a clean slate, remove `data/work-helper.db` before starting (dev DB is disposable) — it is recreated and migrated on server start.

## Automated gates (must all pass before any manual validation counts)

```bash
npm run lint
npm run typecheck
npm test          # unit + integration + component, incl. the 11 contract obligations
npm run build
```

## API smoke (curl against the dev server)

```bash
# Create two people — expect 201 each
curl -sS -X POST localhost:3000/api/people -H 'content-type: application/json' \
  -d '{"firstName":"Sam","lastName":"Rivera","email":"sam.rivera@example.com","phone":"555-0100"}'
curl -sS -X POST localhost:3000/api/people -H 'content-type: application/json' \
  -d '{"firstName":"Ana","lastName":"Alvarez","email":"ana.alvarez@example.com"}'

# Directory order — expect Alvarez before Rivera
curl -sS localhost:3000/api/people

# Validation — expect 400 "First and last name are required"
curl -sS -X POST localhost:3000/api/people -H 'content-type: application/json' -d '{"firstName":"  "}'

# Case-insensitive email conflict — expect 409 "That email is already in use"
curl -sS -X POST localhost:3000/api/people -H 'content-type: application/json' \
  -d '{"firstName":"Sam2","lastName":"Rivera","email":"Sam.Rivera@example.com"}'

# Search by email fragment — expect only Ana Alvarez
curl -sS 'localhost:3000/api/people?q=ana.alvarez@'

# Task detail + linking (create a task first; note the returned ids)
curl -sS -X POST localhost:3000/api/tasks -H 'content-type: application/json' -d '{"title":"Follow up with Sam"}'
curl -sS -X POST localhost:3000/api/tasks/1/people -H 'content-type: application/json' -d '{"personId":1}'
curl -sS localhost:3000/api/tasks/1                 # expect people to contain Sam Rivera
curl -sS -X DELETE localhost:3000/api/tasks/1/people/1   # expect people empty again

# Delete cascade — link person 1 to two tasks, delete person, re-check both details
curl -sS -X DELETE localhost:3000/api/people/1      # expect 204
```

## Browser scenarios (`browser-tester` agent — evidence to `docs/evidence/track-people/`)

Run against the Vite dev URL. One evidence set (screenshots + results) per user story; scenario wording follows the spec's acceptance scenarios.

1. **US1 — directory**: open People page → create Sam Rivera (all four fields) → row shows name, email, phone → reload → row persists → create Ana Alvarez → Alvarez listed above Rivera → submit blank-name form → validation message, no row added → submit `Sam.Rivera@example.com` → email-in-use message, no row added.
2. **US2 — record & edit**: open Sam Rivera's record → all fields shown → change phone to 555-0199 → save → reload → 555-0199 persists → edit Ana's email to Sam's → rejected with message, Ana's record unchanged.
3. **US3 — task linking**: from the kanban board click "Follow up with Sam" card → detail view shows title + empty linked-people section with search box → type `sam` → select Sam Rivera → appears in linked list → type `ana.alvarez@` → result shows Ana's name *and* email → remove Sam from the task → gone from linked list, still on People page. Verify the board card face itself looks unchanged (FR-017) and the detail view offers no task-field editing (FR-016).
4. **US4 — delete everywhere**: link Sam to two tasks → delete Sam on People page → gone from the people list and from both tasks' detail views.
5. **US5 — extra fields**: with `["Nickname"]` configured, the create form shows a Nickname input → create Sam with Nickname "Sammy" → record shows it → reload → still shown.

**Edge checks** (fold into the closest story's run): two blank-email people coexist; re-saving a person without changing their email succeeds; re-selecting an already-linked person does not duplicate them; a very long name/email does not break the list, record, or linked-people layouts.

## Acceptance criteria → check mapping

| Spec item | Automated check | Browser evidence |
|-----------|-----------------|------------------|
| US1 (FR-001..005) | `tests/integration/people.test.ts`, `tests/component/people-page.test.ts`, contract obligations 1–4 | Scenario 1 |
| US2 (FR-006, FR-007) | `tests/integration/people.test.ts` (obligation 5), `tests/component/person-form.test.ts` | Scenario 2 |
| US3 (FR-012..017) | `tests/integration/task-people.test.ts`, `people-search.test.ts` (obligations 6–8), `tests/component/task-detail.test.ts`, `task-card.test.ts` | Scenario 3 |
| US4 (FR-008) | `tests/integration/person-delete.test.ts` (obligation 9) | Scenario 4 |
| US5 (FR-009..011) | `tests/unit/person-fields-config.test.ts`, obligations 10–11, `tests/component/person-form.test.ts` | Scenario 5 |

Done means: every row has both columns green, independently confirmed by the `verifier` agent (constitution III) — assertions without command output or screenshots do not count.
