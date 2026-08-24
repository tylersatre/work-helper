# Quickstart: validating card-archive

How to prove this feature works end to end. Details of *what* is being asserted live in `contracts/` and `data-model.md`; this file is the run guide.

## Prerequisites

- Node ≥ 22, dependencies installed (the SessionStart hook does this in a fresh worktree).
- Branch `027-card-archive`.
- `npm run dev` derives ports from the branch prefix: **API `http://localhost:3027`, UI `http://localhost:5127`**.
- The `0005_*` migration (adding `tasks.archived`) is applied automatically at server startup — no manual migration step.

## 1. Automated checks

```bash
npm test                               # full vitest suite
npx vitest run tests/integration/task-archive.test.ts
npx vitest run tests/integration/board.test.ts
npx vitest run tests/integration/mcp-read-tools.test.ts
npx vitest run tests/integration/mcp-archive-tools.test.ts
npx vitest run tests/unit/board-archive-storage.test.ts
npx vitest run tests/component/board.test.ts
npx vitest run tests/component/task-detail.test.ts
npx vitest run tests/component/task-card.test.ts
npm run lint && npm run typecheck && npm run build
```

Expected: all green. The Stop verification gate runs lint/typecheck/test/build anyway; run them yourself before claiming completion (Constitution III).

Coverage map — every acceptance scenario has at least one automated check:

| Spec scenario | Automated check |
| --- | --- |
| US1.1–US1.3 (archive control present, archives immediately, works from any lane) | `tests/component/task-detail.test.ts`, `tests/integration/task-archive.test.ts` |
| US2.1–US2.3 (toggle reveals archived/dimmed/badged, unarchive control, restores active at bottom) | `tests/component/board.test.ts`, `tests/component/task-detail.test.ts`, `tests/integration/task-archive.test.ts` |
| US3.1 (search/tag filter applies to archived cards when shown) | `tests/component/board.test.ts` |
| US4.1–US4.2 (`list-board` include-archived, `archive-card`/`unarchive-card` MCP tools) | `tests/integration/mcp-read-tools.test.ts`, `tests/integration/mcp-archive-tools.test.ts` |
| US5.1 (toggle persists across reload) | `tests/unit/board-archive-storage.test.ts`, `tests/component/board.test.ts` (stubbed `localStorage`) |
| Edge cases (double-archive/unarchive no-ops, toggle-off hides regardless of filter match, notes/links/position untouched) | `tests/integration/task-archive.test.ts` |

## 2. Seed a small board

Create at least two cards across different lanes (e.g. "Follow up with Sam" in To Do, "Write proposal" in In Progress) via the UI or `create-task`, so US1.3's "works the same from any lane" and US3's two-card search-narrowing scenario have real data to exercise. Seeding steps belong in `tasks.md`.

## 3. Browser evidence (UI criteria — US1, US2, US3, US5)

```bash
npm run dev     # API 3027, UI 5127
```

Then dispatch the `browser-tester` agent against `http://localhost:5127` to walk US1, US2, US3, and US5's Given/When/Then scenarios and write screenshots plus results to `docs/evidence/card-archive/`. The agent drives the real board and detail view — it must not stub `fetch` or edit application code.

Minimum shots: a card's detail view showing the archive control next to the lane pills and delete control; the board immediately after archiving, showing the card gone from every lane; the filter bar with `Show archived` off then on, the archived card reappearing dimmed with its "Archived" badge in its original lane position; the archived card's detail view showing the unarchive control; the board right after unarchiving, showing the card active at the bottom of its original lane with `Show archived` off; a search narrowing two archived cards down to the one matching; the board after a reload with `Show archived` still on.

## 4. MCP evidence (US4 — no UI surface)

US4 is reachable only through MCP tools, so its evidence is recorded automated-check output rather than screenshots (Constitution III). Capture the run of both files:

```bash
npx vitest run tests/integration/mcp-read-tools.test.ts tests/integration/mcp-archive-tools.test.ts --reporter=verbose 2>&1 \
  | tee docs/evidence/card-archive/mcp-archive-tools.txt
```

Optionally, cross-check by hand against the running server with an authorized MCP client: call `archive-card` on a card, then `list-board` (no `includeArchived`) and confirm it's absent, then `list-board { includeArchived: true }` and confirm it's present and flagged, then `unarchive-card` and confirm it's active again in both `list-board`'s default response and the web UI — expected shapes are tabulated in `contracts/mcp-tools.md`.
