# Quickstart: Create Task

**Feature**: `001-create-task` | **Date**: 2026-08-06

Validation guide proving the feature end to end. Interfaces referenced
here are specified in [contracts/http-api.md](contracts/http-api.md) and
[contracts/lanes-config.md](contracts/lanes-config.md); entities in
[data-model.md](data-model.md).

## Prerequisites

- Node.js 24 LTS (≥22 works) and npm.
- Repo checked out on branch `001-create-task`.
- `config/lanes.json` present with `["To Do", "In Progress", "Waiting", "Done"]`.

## Setup & gates

```bash
npm install
npm run lint        # ESLint — must pass
npm run typecheck   # vue-tsc --noEmit (covers .ts + .vue SFCs) — must pass
npm test            # Vitest: unit + integration + component — must pass
npm run build       # Vite client build + server compile — must pass
```

These four commands are the verification gate (Stop hook) and must all
succeed before the feature is claimed done.

## Run the app (dev)

```bash
npm run dev
```

Starts the Fastify API and the Vite dev server (client at
`http://localhost:5173`, proxying `/api` to the server). The database
file is created automatically at `./data/work-helper.db` (override with
`DATABASE_PATH`; delete the file to reset to an empty board).

## Validation scenarios

Each maps to an acceptance scenario in [spec.md](spec.md). All five must
also be executed by the `browser-tester` agent against the running dev
server, with screenshot evidence saved under `docs/evidence/create-task/`.

**1. Empty board shows all configured lanes in order (US1-1, SC-004)**
With a fresh database, open the board. Expect four lanes left to right:
"To Do", "In Progress", "Waiting", "Done", each with no cards.

**2. Create a task; it lands in the first lane (US1-2, SC-001)**
Type "Follow up with Sam" in the create-task form and submit. Expect a
card titled "Follow up with Sam" to appear in "To Do" within 5 seconds
(in practice immediately).

**3. Second task joins the lane without disturbing the first (US1-3, FR-006)**
Create "Draft Q3 goals". Expect "To Do" to show both cards, "Follow up
with Sam" unchanged, in creation order.

**4. Tasks survive reload (US2-1, SC-002)**
Reload the page. Expect every previously created card still in "To Do".
(API check: `curl localhost:5173/api/board` shows the tasks.)

**5. Empty / whitespace-only title is rejected (US3-1, SC-003)**
Submit the form with "" and with "   ". Expect no card created (board
unchanged, `/api/board` task count unchanged) and a visible "title is
required" validation message. API check:
`curl -X POST localhost:5173/api/tasks -H 'content-type: application/json' -d '{"title":"   "}'`
returns `400` with `{"error":{"message":"Title is required"}}`.

## Expected automated coverage

- Unit: shared title validation (trim/empty rules), lane-config loader
  validity rules.
- Integration: `GET /api/board` (empty + populated, lane order, task
  order), `POST /api/tasks` (201 shape, lane assignment, 400 rejection,
  nothing persisted on 400) via Fastify `inject` + in-memory SQLite.
- Component: board renders configured lanes in order; form submits a
  valid title; form shows the validation message and blocks submission
  otherwise.
