# Quickstart: validating task-fields

How to prove this feature works end to end. Details of *what* is being asserted live in `contracts/` and `data-model.md`; this file is the run guide.

## Prerequisites

- Node ≥ 22, dependencies installed (the SessionStart hook does this in a fresh worktree).
- Branch `030-task-fields`.
- `npm run dev` derives ports from the branch prefix: **API `http://localhost:3030`, UI `http://localhost:5130`**.
- The `0007_*` migration (adding `tasks.dueDate/priority/effort/description`) is applied automatically at server startup — no manual migration step.

## 1. Automated checks

```bash
npm test                               # full vitest suite
npx vitest run tests/integration/tasks.test.ts
npx vitest run tests/integration/mcp-read-tools.test.ts
npx vitest run tests/integration/mcp-note-tag-task-tools.test.ts
npx vitest run tests/unit/validation.test.ts
npx vitest run tests/unit/time.test.ts
npx vitest run tests/component/create-task-form.test.ts
npx vitest run tests/component/task-detail.test.ts
npx vitest run tests/component/task-card.test.ts
npm run lint && npm run typecheck && npm run build
```

Expected: all green. The Stop verification gate runs lint/typecheck/test/build anyway; run them yourself before claiming completion (Constitution III).

Coverage map — every acceptance scenario has at least one automated check:

| Spec scenario | Automated check |
| --- | --- |
| US1.1–US1.2 (create-task form sets/leaves-blank all four fields) | `tests/component/create-task-form.test.ts`, `tests/integration/tasks.test.ts` |
| US2.1–US2.2 (due date set/clear, badge appears/disappears, survives reload) | `tests/component/task-detail.test.ts`, `tests/component/task-card.test.ts`, `tests/integration/tasks.test.ts` |
| US2.3 (priority/effort change, no card-face indicator) | `tests/component/task-detail.test.ts`, `tests/component/task-card.test.ts` |
| US2.4 (description markdown round-trip: bold/italic/link/list) | `tests/component/task-detail.test.ts` |
| US3.1–US3.3 (MCP create-task/update-task field parity, invalid enum rejection, clear via MCP) | `tests/integration/mcp-note-tag-task-tools.test.ts`, `tests/integration/mcp-read-tools.test.ts` |
| Edge cases (past due date accepted, unstyled badge, no priority/effort/description on card face, MCP validation leaves values unchanged, clear persists) | `tests/integration/tasks.test.ts`, `tests/component/task-card.test.ts` |

## 2. Seed data

Create at least two tasks via the UI or `create-task`:

- "Book venue" — due date, priority, effort, and a markdown description all set (to exercise US1.1 and the rendered-description scenario).
- "Draft budget" — all four fields left blank (to exercise the unset-state scenarios and confirm no due-date badge).

Seeding steps belong in `tasks.md`.

## 3. Browser evidence (UI criteria — US1, US2)

```bash
npm run dev     # API 3030, UI 5130
```

Then dispatch the `browser-tester` agent against `http://localhost:5130` to walk US1 and US2's Given/When/Then scenarios and write screenshots plus results to `docs/evidence/task-fields/`. The agent drives the real board and detail view — it must not stub `fetch` or edit application code.

Minimum shots: the create-task form expanded with all four new inputs filled in; the created card's detail view showing all four set values (description rendered, not raw markdown); a second task's detail view showing all four fields in their unset state with a label and a control for each; the detail view after setting a due date, next to the board showing the new due-date badge on that card; the detail view after clearing that due date, next to the board showing the badge gone, both after a page reload; the detail view after changing priority and effort, showing the board card face with no priority/effort indicator; the description in edit mode (raw textarea) and then saved (rendered bold/italic/link/list); two board cards side by side, one with a due-date badge and one without.

## 4. MCP evidence (US3 — no UI surface)

US3 is reachable only through MCP tools, so its evidence is recorded automated-check output rather than screenshots (Constitution III). Capture the run of both files:

```bash
npx vitest run tests/integration/mcp-read-tools.test.ts tests/integration/mcp-note-tag-task-tools.test.ts --reporter=verbose 2>&1 \
  | tee docs/evidence/task-fields/mcp-task-fields.txt
```

Optionally, cross-check by hand against the running server with an authorized MCP client: call `create-task` with all four fields set, then `get-task` and `list-board` and confirm both return the same four values; call `update-task` changing all four fields in one call, then again to clear only `dueDate`, and confirm the UI detail view reflects each change after a reload; call `update-task` (or `create-task`) with `priority: "Critical"` and confirm it's rejected with the task's priority left unchanged — expected shapes are tabulated in `contracts/mcp-tools.md`.
