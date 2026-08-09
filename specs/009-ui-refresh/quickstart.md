# Quickstart: UI Refresh (009)

## Prerequisites

- Node >= 22, npm install already run (the SessionStart hook installs dependencies in fresh worktrees).
- This feature adds one dependency: `npm install naive-ui` (a task covers this).

## Run the app

```bash
npm run dev
```

Branch `009-ui-refresh` derives its ports via `scripts/dev-ports.sh`: **API on 3009, UI on 5109** → open http://localhost:5109. The UI proxies `/api` to the server; both restart on change.

## Automated checks (the verification gate runs these on Stop)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`npm test` runs unit + component + integration suites; FR-011 requires the whole thing green. The deploy suite (`npm run test:deploy`) is unaffected by this feature and not part of the loop.

## Manual validation walk (maps to user stories)

1. **Shell (US1)**: Open `/`, `/people`, a task's detail, a person's record — every page shows the top nav (`app-nav`) with the active section marked, dark background, light text. Clicking Board/People navigates.
2. **Dense board (US2)**: Seed ~30 tasks into To Do (create via UI or API loop). The page itself must not scroll vertically; the To Do card list scrolls internally with all four lane headers visible. Empty lanes show the placeholder. "+ Add task" at the bottom of To Do expands to title + note; submitting appends the card at the bottom of To Do; whitespace-only title shows the inline message next to the input. Drag a card to another lane; reload — it stays.
3. **Dialog (US3)**: On a task with two notes, delete one — an in-page dialog appears (no browser popup); cancel keeps both, confirm removes just that note, reload confirms persistence.
4. **People (US4)**: With an empty database, `/people` shows the empty state; creating a person replaces it with the dense list; editing a person's phone in the restyled form persists.
5. **Phone (US5)**: At a 375px-wide viewport: board lanes reachable by horizontal scroll, nav links clickable, creating a person works, no page-level horizontal overflow.

## Acceptance evidence

The `browser-tester` agent drives the scenarios above against http://localhost:5109 and writes screenshots + results to `docs/evidence/009-ui-refresh/`; the `verifier` agent independently re-runs the checks. Contract details (testids, structural guarantees) live in [contracts/ui-contract.md](./contracts/ui-contract.md).

## Reference

- Library decision and design approaches: [research.md](./research.md)
- No data-model changes: [data-model.md](./data-model.md)
- Theme tokens: `src/client/theme.ts` (created by this feature) — the single place to tweak colors/density later.
