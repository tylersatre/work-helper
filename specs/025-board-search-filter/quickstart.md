# Quickstart: validating board-search-filter

How to prove this feature works end to end. Details of *what* is being asserted live in `contracts/` and `data-model.md`; this file is the run guide.

## Prerequisites

- Node ≥ 22, dependencies installed (the SessionStart hook does this in a fresh worktree).
- Branch `025-board-search-filter`.
- `npm run dev` derives ports from the branch prefix: **API `http://localhost:3025`, UI `http://localhost:5125`**.

## 1. Automated checks

```bash
npm test                       # full vitest suite
npx vitest run tests/unit/board-filter.test.ts
npx vitest run tests/integration/board.test.ts
npx vitest run tests/integration/mcp-read-tools.test.ts
npx vitest run tests/component/board.test.ts
npm run lint && npm run typecheck && npm run build
```

Expected: all green. The Stop verification gate runs lint/typecheck/test/build anyway; run them yourself before claiming completion (Constitution III).

Coverage map — every acceptance scenario has at least one automated check:

| Spec scenario | Automated check |
| --- | --- |
| US1.1–US1.5 (search, live typing, notes match, linked-name match, no matches) | `tests/component/board.test.ts` |
| US2.1–US2.3 (selector contents, tag union, intersect with text) | `tests/component/board.test.ts` |
| US3.1–US3.2 (persistence, clear) | `tests/component/board.test.ts` with a stubbed `localStorage` |
| US4.1–US4.2 (cross-lane append, within-lane blocked) | `tests/component/board.test.ts` (asserts the `placement` request body / its absence) |
| US5.1–US5.4 (MCP `list-board` filters) | `tests/integration/mcp-read-tools.test.ts` |
| Trim / whitespace-only / missing fields | `tests/unit/board-filter.test.ts` |
| `/api/board` enrichment (B3–B5) | `tests/integration/board.test.ts` |

## 2. Seed the spec's board

The spec's scenarios all run against one seeded board (six cards, tags VIP/Q3/Prospect, person Sam Rivera, company Acme Inc). Seed it against the running dev API before any manual or browser check — via the UI, or by POSTing to the existing task/tag/link endpoints. The seeding steps belong in `tasks.md`; what matters here is that the board matches the spec's table exactly before evidence is captured, since every expected result is stated in terms of it.

## 3. Browser evidence (UI criteria — US1–US4)

```bash
npm run dev     # API 3025, UI 5125
```

Then dispatch the `browser-tester` agent against `http://localhost:5125` to walk US1–US4's Given/When/Then scenarios and write screenshots plus results to `docs/evidence/board-search-filter/`. The agent drives the real board — it must not stub `fetch` or edit application code.

Minimum shots: unfiltered board; mid-type narrowing on "SAM" with the "1 of 6 cards" indicator; "budget" showing the note-matched card; "zebra" showing four empty lanes plus "No cards match"; tag selector open showing exactly Q3 and VIP; Q3+VIP at "4 of 6 cards"; the board after a reload and after a People round trip with the filter intact; the board after Clear filters; Waiting after a filtered cross-lane drag with the filter cleared.

## 4. MCP evidence (US5 — no UI surface)

US5 is reachable only through the MCP tool, so its evidence is recorded automated-check output rather than screenshots (Constitution III). Capture the run of the four `list-board` cases:

```bash
npx vitest run tests/integration/mcp-read-tools.test.ts --reporter=verbose 2>&1 \
  | tee docs/evidence/board-search-filter/mcp-list-board.txt
```

Optionally, cross-check by hand against the running server with an authorized MCP client, calling `list-board` with `{search:"budget"}`, `{tags:["Q3"]}`, both, and `{}` — expected results are tabulated in `contracts/mcp-list-board.md`.

## 5. Verification gate

Dispatch the `verifier` agent with the spec, this quickstart, and the evidence directory. It re-runs the checks itself rather than trusting a summary, and confirms every FR and SC has both a passing check and surface-appropriate evidence.

## Manual smoke checklist

- [ ] Board with no filter shows six cards, no indicator, no clear control.
- [ ] Typing `SAM` narrows live to one card; indicator reads `1 of 6 cards`.
- [ ] `budget` shows `Write proposal` (note match) and `Review budget` (title match).
- [ ] `rivera` → `Follow up with Sam`; `acme` → `Book venue`.
- [ ] `zebra` → four empty lanes and `No cards match`, indicator `0 of 6 cards`.
- [ ] Tag selector offers exactly `Q3`, `VIP`; `Prospect` absent.
- [ ] `Q3` + `VIP` → four cards; `Q3` + text `budget` → only `Write proposal`.
- [ ] Reload and a People round trip both keep the filter and the narrowed board.
- [ ] Clear filters restores all six cards in their original manual order.
- [ ] Filtered drag of `Write proposal` into Waiting lands it below `Book venue`.
- [ ] Filtered within-lane drag in Done changes nothing, including after a reload.
