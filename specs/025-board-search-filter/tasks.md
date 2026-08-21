# Tasks: board-search-filter

**Input**: Design documents from `/specs/025-board-search-filter/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks are **mandatory** in this repo — Constitution II (Test-First, NON-NEGOTIABLE) requires a failing test before the code that makes it pass. Every implementation task below is preceded by the failing test that drives it; code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demonstrated independently. Phases follow the spec's priorities (P1 → P2 → P3); within the P2 band the order follows plan.md's "Design notes carried into `/speckit-tasks`" (US2 → US5 → US3), because the tag selector and the MCP tool both build directly on the Phase 2 foundation while persistence layers on top of the finished filter state.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task names its exact file path

## Path Conventions

Single-package web app per plan.md: `src/client`, `src/server`, `src/shared`, tests split `tests/unit`, `tests/integration`, `tests/component`. All paths are repository-root relative.

**No schema change, no drizzle migration** — this feature reads existing tables only (data-model.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the worktree is ready; no project initialization is needed (existing repo, existing tooling, no new dependency).

- [X] T001 Verify the worktree baseline is green before any change by running `npm run lint && npm run typecheck && npm test && npm run build` from the repository root, recording that the suite passes on branch `025-board-search-filter` (so later failures are provably this feature's)
- [X] T002 [P] Create the evidence directory `docs/evidence/board-search-filter/` with a `.gitkeep` so browser and MCP evidence has a home (Constitution III)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single shared matching rule and the enriched `/api/board` payload every user story depends on. `matchesBoardFilter` in `src/shared/board-filter.ts` is the only place the matching semantics exist — both `Board.vue` and the MCP `list-board` handler call it, which is what makes SC-006 a property rather than a coincidence.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Add the `BoardTask` and `BoardFilter` interfaces to `src/shared/types.ts` per data-model.md (`BoardTask extends Task` with `tags: Tag[]` and `searchText: string`; `BoardFilter` with `text: string` and `tagIds: number[]`) and re-type `BoardLane.tasks` to `BoardTask[]`, leaving `BoardView` unchanged
- [X] T004 Write failing unit tests for the shared predicate in `tests/unit/board-filter.test.ts` covering: empty/whitespace-only `filter.text` is no text filter (FR-004); trimmed, lowercased substring match against `searchText` (FR-002); empty `filter.tagIds` is no tag filter; a card matching **any** selected tag id (FR-006); text AND tags both required when both are set (FR-008); a card whose `searchText` is only its lowercased title (no notes/links) matching and never erroring (edge case "Cards with no notes, tags, or links"). Confirm the tests FAIL (module does not exist yet)
- [X] T005 Implement `matchesBoardFilter(task, filter)` in `src/shared/board-filter.ts` exactly per data-model.md's matching rule, making T004 pass. The function assumes `task.searchText` is **already lowercased** and lowercases only the query — this builder/predicate contract is asserted by T004
- [X] T006 Extend `tests/integration/board.test.ts` with failing assertions that `GET /api/board` returns guarantees B1–B7 from `contracts/board-api.md`: every configured lane present in order; tasks in `position ASC, id ASC`; every task carries `tags` (name-ordered `COLLATE NOCASE`, `[]` when none); every task carries a lowercased `searchText` built from title + every note's text + every linked person's and company's name, `\n`-joined; a bare task still yields its lowercased title and `tags: []`; existing fields unchanged. Confirm the new assertions FAIL
- [X] T007 Add `listBoardTasksByLane(db, lane)` to `src/server/services/tasks.ts` — reusing the existing `listTasksByLane` ordering and `getTagsForTask` — assembling each task's `tags` and its `searchText` as `[title, ...noteTexts, ...personNames, ...companyNames].join('\n').toLowerCase()`, with a person name composed as `` `${firstName} ${lastName}`.trim() `` (data-model.md field rules)
- [X] T008 Switch `src/server/routes/board.ts` to call `listBoardTasksByLane` instead of `listTasksByLane`, making T006 pass; the endpoint gains no query parameters and performs no writes (B7)

**Checkpoint**: The shared predicate exists and `/api/board` ships everything the client needs to filter without a network round trip. User story implementation can now begin.

---

## Phase 3: User Story 1 - Find a card by typing (Priority: P1) 🎯 MVP

**Goal**: A filter bar above the lanes with a live text search over card title, note text, and linked person/company names, plus the "N of M cards" indicator, the clear-filters control, and the "No cards match" message.

**Independent Test**: Type text into the search input on the seeded board and verify only cards whose title, note text, or linked person/company name contains that text (case-insensitively) remain visible, with all four lanes still displayed.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they FAIL before any implementation task in this phase.

- [X] T009 [P] [US1] Extend `tests/component/board.test.ts` with failing tests for US1 scenarios 1–2: an unfiltered board renders `board-filter-bar` and an empty `board-search-input`, shows all six seeded cards in manual order, and renders **neither** `board-filter-indicator` nor `board-clear-filters` (FR-011, U7); typing "SAM" re-filters on the `input` event with no button press and no fetch, leaving only "Follow up with Sam" visible, the other three lanes showing `lane-empty`, and the indicator reading "1 of 6 cards" alongside the clear control (FR-003, U1)
- [X] T010 [P] [US1] Extend `tests/component/board.test.ts` with failing tests for US1 scenarios 3–5: "budget" leaves "Write proposal" (matched on note text) and "Review budget" (matched on title) visible; "rivera" leaves only "Follow up with Sam" (matched on linked person name) and "acme" only "Book venue" (matched on linked company name); "zebra" renders all four lanes with `lane-empty`, the `board-no-matches` message, and an indicator reading "0 of 6 cards" (FR-009, FR-012)
- [X] T011 [P] [US1] Extend `tests/component/board.test.ts` with a failing test that a whitespace-only search value counts as no filter at all (all six cards visible, no indicator, no clear control) and that " budget " matches exactly the same cards as "budget" (FR-004, U2)

### Implementation for User Story 1

- [X] T012 [US1] Create `src/client/components/BoardFilterBar.vue` with the search input (`data-testid="board-search-input"`, `placeholder="Search cards"`, `NInput`), a container `data-testid="board-filter-bar"` always rendered, the `data-testid="board-filter-indicator"` text `"{N} of {M} cards"` and the `data-testid="board-clear-filters"` `"Clear filters"` button rendered **only** while a filter is active, per `contracts/board-filter-ui.md`. Styling uses `palette.ts` tokens (`--wh-surface`, `--wh-border-subtle`, `--wh-text-primary`) and existing naive-ui primitives — no new dependency
- [X] T013 [US1] Wire the filter into `src/client/components/Board.vue`: a `BoardFilter` `ref`, `filterActive`, `visibleLanes` (every configured lane with `tasks.filter(t => matchesBoardFilter(t, filter))` — lanes are never dropped), `visibleCount`/`totalCount`, and `noMatches` as `computed` values per data-model.md's derived-values table; render `BoardFilterBar` above the lanes and pass `visibleLanes` to `Lane`
- [X] T014 [US1] Render the `data-testid="board-no-matches"` "No cards match" message in `src/client/components/Board.vue` when `filterActive && visibleCount === 0`, keeping all four lanes and their `lane-empty` placeholders on screen (FR-012, U5), making T009–T011 pass
- [X] T015 [US1] Verify no regression to the card face or lane ordering: confirm `src/client/components/TaskCard.vue` is untouched and visible cards keep manual order with no highlighting or match explanation (FR-010, U6), and re-run `npx vitest run tests/component/board.test.ts tests/component/board-page.test.ts`

**Checkpoint**: US1 is fully functional and independently demonstrable — the board is navigable by typing, with the indicator, clear control, and empty state in place.

---

## Phase 4: User Story 2 - Narrow the board by tag (Priority: P2)

**Goal**: A multi-select tag selector listing exactly the tags in use on the board (plus any still-selected tag that has left it), unioning across selected tags and intersecting with the text search.

**Independent Test**: Select tags in the tag selector on the seeded board and verify only cards carrying at least one selected tag remain visible; add search text and verify the two filters intersect.

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Extend `tests/component/board.test.ts` with a failing test for US2 scenario 1: on the seeded board the `board-tag-filter` offers exactly "Q3" and "VIP" in case-insensitive alphabetical order with nothing selected — "Prospect" is absent because no card carries it (FR-005, U3)
- [X] T017 [P] [US2] Extend `tests/component/board.test.ts` with failing tests for US2 scenarios 2–3: selecting "Q3" shows exactly "Write proposal", "Prep board deck", "Send recap"; adding "VIP" additionally shows "Follow up with Sam" with the indicator reading "4 of 6 cards" (union, FR-006); with "Q3" selected, typing "budget" leaves only "Write proposal" visible (intersection, FR-008)
- [X] T018 [P] [US2] Extend `tests/component/board.test.ts` with a failing test for FR-007: when the board is refetched and the last card carrying a selected tag has lost it, that tag stays **selected and listed** in the selector and keeps filtering, rather than vanishing and silently widening the view (R4)

### Implementation for User Story 2

- [X] T019 [US2] Add the tag selector (`data-testid="board-tag-filter"`, multi-select `NSelect` over tag names) to `src/client/components/BoardFilterBar.vue`, taking its options as a prop and emitting selected tag **ids**
- [X] T020 [US2] Add the `availableTags` computed to `src/client/components/Board.vue` — the union of (distinct tags across all board cards) and (tags currently selected), sorted by name case-insensitively — and feed it to `BoardFilterBar`, making T016 and T018 pass
- [X] T021 [US2] Confirm `filterActive` and `visibleLanes` in `src/client/components/Board.vue` account for `tagIds` (active when `text.trim() !== ''` **or** `tagIds.length > 0`; a card visible only when it satisfies both the text and tag conditions via `matchesBoardFilter`), making T017 pass

**Checkpoint**: US1 and US2 both work independently — text search and tag filtering, alone or intersected.

---

## Phase 5: User Story 5 - Agents can filter the board too (Priority: P2)

**Goal**: `list-board` gains optional `search` and `tags` arguments that filter by the same rules as the UI, running the *same* shared predicate.

**Independent Test**: Call `list-board` with a text-search argument, a tag argument, and both, and verify each response contains exactly the expected cards grouped under their lane in board order.

### Tests for User Story 5 ⚠️

- [X] T022 [P] [US5] Extend `tests/integration/mcp-read-tools.test.ts` with failing tests for US5 scenarios 1–4 against the spec's seeded board: `{search:"budget"}` returns exactly "Write proposal" and "Review budget"; `{tags:["Q3"]}` returns exactly "Write proposal", "Prep board deck", "Send recap"; `{search:"budget", tags:["Q3"]}` returns exactly "Write proposal"; `{}` returns the whole board unchanged — each grouped under its lane in configured lane order, lanes with no matches present with `tasks: []` (M7, M8)
- [X] T023 [P] [US5] Extend `tests/integration/mcp-read-tools.test.ts` with failing tests for the remaining rules in `contracts/mcp-list-board.md`: `{search:"   "}` behaves as `{}` (M1); `{search:"  budget  "}` behaves as `{search:"budget"}`; `{search:"rivera"}` returns only "Follow up with Sam" (linked-person match, M2); tag names resolve case-insensitively (M4); `{tags:["Prospect"]}` returns no cards and is **not** an error (M5); the output shape is unchanged — no `tags`/`searchText` leaks into `taskSummarySchema` (output-schema contract); and the tool performs no writes (M10)

### Implementation for User Story 5

- [X] T024 [US5] Add `search: z.string().optional()` and `tags: z.array(z.string()).optional()` to the `list-board` `inputSchema` in `src/server/mcp/tools.ts` and update its description per `contracts/mcp-list-board.md`
- [X] T025 [US5] Implement the handler in `src/server/mcp/tools.ts`: build each lane's cards with `listBoardTasksByLane`, resolve the supplied tag **names** to ids case-insensitively (an unmatched name contributes no id), filter with the shared `matchesBoardFilter`, and project results back to `taskSummarySchema` so `tags`/`searchText` never reach the output — making T022–T023 pass
- [X] T026 [US5] Update the `content[0].text` summary line in `src/server/mcp/tools.ts` to report the number of matching cards so a human-readable client sees the narrowing, leaving `structuredContent` authoritative

**Checkpoint**: An agent and the UI run the identical predicate — SC-006 holds by construction.

---

## Phase 6: User Story 3 - The filter sticks until cleared (Priority: P2)

**Goal**: The active filter survives a page reload and an SPA navigation round trip until the clear-filters control resets it in one action.

**Independent Test**: Apply a text and tag filter, reload and navigate away and back verifying the filter and narrowed board are unchanged each time, then clear and verify the full board returns.

### Tests for User Story 3 ⚠️

- [X] T027 [P] [US3] Add failing unit tests in `tests/unit/board-filter-storage.test.ts` for `readFilter`/`writeFilter`: a round trip through a stubbed `localStorage` under the key `wh.board.filter`; malformed JSON reads as `{text:'', tagIds:[]}`; a missing key reads as `{text:'', tagIds:[]}`; and a `localStorage` that is absent or throws degrades to a non-persistent filter rather than throwing (R3, U14)
- [X] T028 [P] [US3] Extend `tests/component/board.test.ts` with failing tests for US3 scenarios 1–2 against a stubbed `localStorage`: with `{text:"budget", tagIds:[Q3]}` already stored, a freshly mounted Board restores the search input value, the tag selection, and the narrowed board (FR-014, U9); the clear control empties the text, deselects every tag, removes the storage key, and restores all six cards in manual order with no indicator (FR-013, U8, SC-005)

### Implementation for User Story 3

- [X] T029 [US3] Create `src/client/utils/board-filter-storage.ts` exporting `readFilter()`, `writeFilter(filter)`, and `clearFilter()` over `localStorage['wh.board.filter']`, wrapped so an absent or throwing `localStorage` degrades to no persistence rather than breaking the board — making T027 pass
- [X] T030 [US3] Wire persistence into `src/client/components/Board.vue`: read the stored filter on mount before first render of the lanes, `watch` the filter and write on every change, and have the clear-filters handler reset to `{text:'', tagIds:[]}` and remove the key in one action — making T028 pass

**Checkpoint**: US1, US2, US3, and US5 all work; the filter survives reload and navigation.

---

## Phase 7: User Story 4 - Dragging while filtered (Priority: P3)

**Goal**: While filtered, a cross-lane drag appends to the destination lane's **unfiltered** end, and a within-lane reorder is impossible with no request issued at all.

**Independent Test**: With a tag filter applied, drag a card into another lane and verify it appears at the bottom of that lane once the filter is cleared; attempt a within-lane reorder and verify the manual order is unchanged after clearing and after reload.

### Tests for User Story 4 ⚠️

- [X] T031 [P] [US4] Extend `tests/component/board.test.ts` with a failing test for US4 scenario 1: with tag "Q3" active, dropping "Write proposal" on Waiting issues `PUT /api/tasks/:id/placement` with `index` equal to Waiting's **unfiltered** task count (1, appending below "Book venue"), not the filtered/rendered count (FR-015, U10)
- [X] T032 [P] [US4] Extend `tests/component/board.test.ts` with a failing test for US4 scenario 2: with tag "Q3" active, dropping "Send recap" within Done issues **no** `placement` request at all (asserted on the fetch stub) and leaves board state untouched, so the persisted manual order cannot change (FR-016, U11, SC-007)
- [X] T033 [P] [US4] Extend `tests/component/board.test.ts` with a failing test that while a filter is active no `drop-indicator` is rendered in any lane, and that with no filter active the existing drop-indicator and within-lane reorder behaviour are unchanged (U12, non-regression)

### Implementation for User Story 4

- [X] T034 [US4] Add a `filterActive: boolean` prop to `src/client/components/Lane.vue`; when true, suppress `dropIndex` tracking and the `drop-indicator` markup entirely, and drop a `drop` event whose dragged card already lives in this lane **before** emitting — so no request is issued at all (FR-016) — making T032 and T033 pass
- [X] T035 [US4] Pass `filterActive` from `src/client/components/Board.vue` down to each `Lane`, and in `onDrop` use the destination lane's **unfiltered** length (`board.value.lanes[...].tasks.length`) as the index whenever a filter is active, never the rendered/filtered list — making T031 pass and keeping the existing optimistic-move and reconcile machinery untouched

**Checkpoint**: All five user stories are independently functional; filtering never disturbs a hidden card's position.

---

## Phase 8: Polish, Evidence & Verification

**Purpose**: Cross-cutting confirmation and the evidence Constitution III requires. Nothing here changes feature behaviour.

- [X] T036 Run the full gate from the repository root — `npm run lint && npm run typecheck && npm test && npm run build` — and confirm all green, including the pre-existing board, drag, and MCP suites (non-regression)
- [X] T037 Seed the spec's exact board against the running dev API (`npm run dev` → API `http://localhost:3025`, UI `http://localhost:5125`): six cards in the spec's lanes and manual order, notes on "Follow up with Sam" and "Write proposal", tags VIP/Q3/Prospect with Prospect attached to person Sam Rivera only, person Sam Rivera linked to "Follow up with Sam", company Acme Inc linked to "Book venue" — matching the spec's table exactly before any evidence is captured
- [X] T038 Dispatch the `browser-tester` agent against `http://localhost:5125` to walk US1–US4's Given/When/Then scenarios on the seeded board and write screenshots plus results to `docs/evidence/board-search-filter/`, covering at minimum: unfiltered board; mid-type narrowing on "SAM" with "1 of 6 cards"; "budget" showing the note-matched card; "zebra" with four empty lanes and "No cards match"; the tag selector open showing exactly Q3 and VIP; Q3+VIP at "4 of 6 cards"; the board after a reload and after a People round trip with the filter intact; the board after Clear filters; Waiting after a filtered cross-lane drag with the filter cleared (quickstart.md §3)
- [X] T039 [P] Record the MCP-only evidence for US5 (no UI surface) with `npx vitest run tests/integration/mcp-read-tools.test.ts --reporter=verbose 2>&1 | tee docs/evidence/board-search-filter/mcp-list-board.txt` (quickstart.md §4)
- [X] T040 Walk quickstart.md's manual smoke checklist against the seeded board and confirm every line, noting any wording Tyler may want to adjust at acceptance (the "N of M cards" / "No cards match" copy is illustrative per the spec's Assumptions)
- [X] T041 Dispatch the `verifier` agent with `spec.md`, `quickstart.md`, and `docs/evidence/board-search-filter/`, confirming every FR (FR-001–FR-018) and SC (SC-001–SC-007) has both a passing automated check and surface-appropriate evidence; the verifier re-runs the checks itself rather than trusting a summary (Constitution III)
- [ ] T042 Open the PR with a Conventional Commits title, noting explicitly that this feature makes **no schema change and adds no migration** (data-model.md), and let the Claude Code CI review run on the diff

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story** (the shared predicate and the enriched payload are what all five stories are built on)
- **US1 (Phase 3)**: depends on Phase 2 only
- **US2 (Phase 4)**: depends on Phase 2; shares `Board.vue` and `BoardFilterBar.vue` with US1, so it lands after US1 rather than beside it
- **US5 (Phase 5)**: depends on Phase 2 only — **fully independent of the client phases** and can run in parallel with US1/US2 (different files: `src/server/mcp/tools.ts`, `tests/integration/mcp-read-tools.test.ts`)
- **US3 (Phase 6)**: depends on Phase 2 and on the filter state existing in `Board.vue` (T013); persistence of the tag half also assumes US2's `tagIds` are wired (T021)
- **US4 (Phase 7)**: depends on Phase 2 and on `filterActive` existing in `Board.vue` (T013); the test setup uses a tag filter, so it follows US2
- **Polish (Phase 8)**: depends on every story phase intended for this release

### Within Each User Story

- Tests are written and confirmed FAILING before the implementation tasks in that phase (Constitution II)
- Shared types and the predicate before anything that imports them
- Server enrichment before the client that consumes it
- Story complete and checkpointed before moving to the next priority

### Parallel Opportunities

- T002 runs alongside T001; T003 runs alongside T004 (different files)
- Within each story phase, all `[P]`-marked test tasks touch distinct describe blocks or distinct files and can be written together — T009/T010/T011; T016/T017/T018; T022/T023; T027/T028; T031/T032/T033
- **The largest parallel win**: once Phase 2 is done, US5 (Phase 5, server + integration tests) is disjoint from US1–US4 (client + component tests) and can proceed concurrently
- T039 (recording MCP output) is independent of T038 (browser evidence) once T036 is green

## Parallel Example: User Story 1

```bash
# Write US1's three failing component test groups together, then confirm all FAIL:
Task: "Extend tests/component/board.test.ts with failing tests for US1 scenarios 1-2"
Task: "Extend tests/component/board.test.ts with failing tests for US1 scenarios 3-5"
Task: "Extend tests/component/board.test.ts with a failing whitespace-only / trim test"

npx vitest run tests/component/board.test.ts   # expect RED before T012
```

## Parallel Example: Foundational

```bash
Task: "Add BoardTask and BoardFilter to src/shared/types.ts"
Task: "Write failing unit tests in tests/unit/board-filter.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T008) — **critical, blocks everything**
3. Phase 3: US1 (T009–T015)
4. **STOP and VALIDATE**: the board narrows live as you type, with the indicator, clear control, and "No cards match" — independently useful with no other filtering in place
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → shared predicate and enriched `/api/board` in place
2. + US1 → **MVP**: an overgrown board is navigable by typing
3. + US2 → tag filtering, unioned across tags and intersected with text
4. + US5 → agents filter the board exactly as the UI does (SC-006)
5. + US3 → the filter survives reload and navigation until cleared
6. + US4 → drag stays safe while filtered (cross-lane appends, within-lane blocked)
7. + Phase 8 → evidence, verifier, PR

Each step adds value without breaking the previous ones.

---

## Notes

- `[P]` = different files or independent test groups, no dependency on incomplete work
- `[Story]` maps each task to its spec user story for traceability
- Confirm every test FAILS before writing the code that makes it pass — code written before its failing test is discarded, not retrofitted (Constitution II)
- Commit after each task or logical group, Conventional Commits
- Two rules that are easy to get subtly wrong (plan.md): a filtered cross-lane drop index must come from the **unfiltered** destination lane, and a within-lane drop while filtered must be dropped **before** any `fetch`, not merely ignored optimistically
- No `src/server/db/schema.ts` edit, no `npx drizzle-kit generate`, no new file in `drizzle/` — if any task seems to need one, stop: the plan is being deviated from
