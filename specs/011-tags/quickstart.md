# Quickstart: Validating Tags

Runnable scenarios proving the feature end-to-end. Contracts: [contracts/http-api.md](./contracts/http-api.md), [contracts/mcp-tools.md](./contracts/mcp-tools.md); entities: [data-model.md](./data-model.md).

## Prerequisites

- Node.js ≥ 22, dependencies installed (`npm install` — the worktree SessionStart hook normally already did this).
- Fresh dev DB after the schema change: `rm -f ./data/work-helper.db` (the regenerated baseline migration recreates it on server start; dev-phase policy, no data to preserve).
- Dev servers: `npm run dev` — on branch `011-tags` the API listens on **3011** and the UI on **5111** (`http://localhost:5111`).

## Automated checks (the gate)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Targeted suites while iterating:

```bash
npx vitest run tests/unit/tag-*.test.ts                 # name/color validation, auto-color cycling
npx vitest run tests/integration/tags.test.ts           # /api/tags CRUD, ordering, conflicts
npx vitest run tests/integration/tag-attachments.test.ts # attach/detach/cascade on people + tasks
npx vitest run tests/integration/mcp-read-tools.test.ts # tags in get-person / get-task (US3 evidence)
npx vitest run tests/component                          # TagInput, TagChip, TagsPage, detail/list surfaces
```

(Exact test file names are settled in tasks.md; the mapping of suites to layers is the contract here.)

## Scenario walkthroughs (browser, port 5111)

### US1 — inline tagging (P1)

1. Create a task "Follow up with Sam" (Board) and a person "Sam Rivera" (People).
2. Open the task's detail view → type `VIP` in the tag input → choose the create option. **Expect**: a "VIP" chip on the task; still there after reload.
3. Open Sam Rivera's detail → type `vip` (lowercase). **Expect**: suggestion shows existing "VIP" (no create option); selecting it puts the "VIP" chip on the person and on Sam's row in the people list, same color as on the task.
4. Back on the task, create and attach `Q3`. **Expect**: "VIP" and "Q3" chips in visibly different colors; colors identical across every surface; survives reload.
5. Remove "VIP" from the task. **Expect**: task shows only "Q3"; Sam Rivera still has "VIP"; survives reload.
6. Try to create a tag with only spaces. **Expect**: "A name is required" validation message, nothing created.

### US2 — Tags page (P2)

1. With no tags, open **Tags** in the top nav. **Expect**: nav marks Tags active; styled "No tags yet" empty state.
2. Create `Roadmap` from the Tags page create control. **Expect**: chip listed with an auto-assigned color, zero attachments; persists after reload.
3. Seed usage (VIP on 2 records, Q3 on 1, Alpha/Beta on none). **Expect**: list order VIP, Q3, Alpha, Beta — most-used first, alphabetical ties.
4. Rename VIP → `Key client`. **Expect**: renamed everywhere (Tags page, task detail, person detail, people list); rename to `q3` rejected with "That tag name is already in use".
5. Recolor Q3 to a preset swatch, then to a custom color. **Expect**: chip color updates everywhere after each change; custom color survives reload.
6. Delete `Key client` — cancel first, then confirm. **Expect**: in-app dialog states "attached to 1 person and 1 task"; cancel changes nothing; confirm removes the tag from every surface; still gone after reload.

### US3 — agent surface (P3, no browser)

Covered by the MCP integration suite (recorded output is the evidence — criteria reachable only through MCP tools): tag a person and a task, then `get-person` returns `tags: ["VIP"]` and `get-task` returns `tags: ["Q3", "VIP"]` — names only, no colors or ids, through an authenticated MCP client as in the existing `mcp-read-tools` tests.

Manual spot-check alternative: connect any authorized MCP client through the mcp-authentik-auth flow and call `get-person` / `get-task` on the tagged records.

## Evidence

Browser evidence for US1/US2 acceptance scenarios → `docs/evidence/011-tags/` via the `browser-tester` agent; US3 evidence is the recorded `mcp-read-tools` test output; `verifier` agent independently re-runs the gate and confirms both before the PR.
