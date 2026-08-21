# Phase 0 Research: board-search-filter

All unknowns below were raised by the spec (which explicitly defers filter-state storage to `/speckit-plan`) or by the Technical Context. Each is resolved here; no `NEEDS CLARIFICATION` remains.

## R1: Where does the filtering happen — client-side or server-side?

**Decision**: Both, from one shared pure predicate. `/api/board` returns each card enriched with the material it can be matched on (`searchText` + `tags`); the Vue board filters in a `computed` with no network call per keystroke. The MCP `list-board` tool builds the same enriched cards server-side and runs the *same* shared predicate from `src/shared/board-filter.ts`.

**Rationale**: SC-002 requires the board to update within one typed character, which a fetch-per-keystroke cannot guarantee and would need debouncing that the spec forbids ("no separate search step"). FR-005's tag selector must list exactly the tags in use *on the board*, which the client can only derive if it already holds every card's tags. FR-015 needs the *true* destination-lane length while cards are hidden, which the client only has if it holds the unfiltered board. Meanwhile FR-017/FR-018 need real server-side filtering for agents. Putting the matching rule in `src/shared/` and calling it from both surfaces is what makes SC-006 ("an agent receives exactly the same set of cards the UI shows") a testable property rather than two implementations that must be kept in sync by hand.

**Alternatives considered**:

- *Server-side only, `/api/board?q=&tags=` re-fetched per keystroke*: rejected — a round trip per character, and hiding cards server-side destroys the unfiltered lane lengths that FR-015 and FR-016 depend on.
- *Client-side only, MCP filters with its own SQL*: rejected — two matching implementations, and SC-006 becomes an assertion instead of a shared unit.
- *SQLite FTS5*: rejected — the spec pins plain case-insensitive substring matching with no ranking, fuzziness, or phrase support; FTS would be a schema change for behaviour nobody asked for.

## R2: What exactly does `/api/board` add to each card?

**Decision**: Each board card gains `tags: Tag[]` and `searchText: string`. `searchText` is a server-built, already-lowercased concatenation of the card's title, every note's text, and the display names of every linked person and company, joined by `\n`. Matching is `searchText.includes(trimmedQuery.toLowerCase())`.

**Rationale**: A precomputed blob keeps the payload smaller than shipping raw notes and links, keeps field assembly (which fields are searchable) in exactly one place on the server, and makes the shared predicate trivial and total — a card with no notes or links simply has a shorter blob, never an error (spec edge case "Cards with no notes, tags, or links"). `tags` must stay structured (id, name, colour) because the tag selector renders and matches on it. The card *face* is unchanged (FR-010); this is payload, not display.

**Alternatives considered**: returning `notes: string[]`, `people: []`, `companies: []` per card and concatenating in the client — rejected as more bytes plus duplicated assembly logic across the UI and MCP paths.

## R3: Where is the active filter persisted?

**Decision**: `localStorage`, under the single key `wh.board.filter`, holding `{"text": string, "tagIds": number[]}`. Read on Board mount, written on every change, cleared by the clear-filters control. Unparseable or malformed stored JSON is treated as "no filter" and overwritten.

**Rationale**: FR-014 demands survival across *both* a reload and an SPA navigation round trip. A URL query string survives a reload but is lost the moment the user visits `/people` (US3 scenario 1 requires both legs). Server-side `app_state` survives both but makes a view preference a database write and adds a round trip before first paint, for a value the spec explicitly calls "never part of a card's stored data". `localStorage` satisfies both legs with no schema change and no server involvement. Tag *ids* rather than names are stored so a tag rename does not silently drop the filter.

**Alternatives considered**: URL query params (fails the navigation leg); `sessionStorage` (lost when the tab is reopened — weaker than "until it is cleared"); server `app_state` (network dependency and a DB write for view state).

**Note**: this is the codebase's first `localStorage` use, so access is wrapped in a small `readFilter`/`writeFilter` pair that tolerates the API being absent or throwing (private-mode Safari, a jsdom environment without it), degrading to a non-persistent filter rather than breaking the board.

## R4: FR-007 — a selected tag whose last card loses it

**Decision**: the tag selector's option list is the union of (tags in use on the board) and (tags currently selected), sorted alphabetically case-insensitively; selection state is never pruned by a board refetch.

**Rationale**: this is exactly the spec's stated behaviour — the tag "stays selected and listed in the selector until the filter is cleared, rather than vanishing mid-filter and silently widening the view". Deriving the list purely from board tags would drop the option out from under the user and, because a dropped selection would also stop filtering, widen the visible set with no action from them.

## R5: Drag while filtered (FR-015 / FR-016)

**Decision**: Board passes a `filterActive` boolean down to each Lane. When it is true the lane suppresses the drop-position indicator entirely, ignores a drop whose card already lives in that lane (FR-016 — no request is issued at all, so the persisted order cannot change), and for a cross-lane drop emits an index equal to the destination lane's **unfiltered** card count, appending it (FR-015).

**Rationale**: the existing `computeDropIndex` maps a pointer Y to a position among *rendered* cards; with cards hidden that index is meaningless against the persisted order, which is precisely why the spec forbids within-lane reordering while filtered. Appending is the one placement that is well defined without seeing the whole lane. Because Board holds the unfiltered board, the true length is available with no extra round trip, and the existing optimistic-move and reconcile machinery in `Board.vue` is reused unchanged.

**Alternatives considered**: making cards non-draggable while filtered (rejected — US4 requires cross-lane moves to keep working); computing the index from visible neighbours' real positions (rejected — the spec deliberately does not want a hidden card's position disturbed).

## R6: MCP `list-board` argument shape

**Decision**: two optional inputs — `search: z.string().optional()` and `tags: z.array(z.string()).optional()` (tag **names**, matched case-insensitively). An omitted or whitespace-only `search` is no text filter; an omitted or empty `tags` array is no tag filter; a name matching no tag simply matches no card rather than erroring. The output schema keeps its shape — lanes in configured order, each with its matching tasks in board order — so existing callers are unaffected (FR-018).

**Rationale**: agents refer to tags the way Tyler does, by name; `search-people` already sets the precedent of a plain string `query` argument, and `attach-tag-to-task` already accepts a tag by name. Contributing nothing for an unknown name matches the "any selected tag" union semantics of FR-006 and avoids an error path the spec never asked for. Both inputs being optional makes FR-018's "whole board unchanged when neither is supplied" the natural default.

## R7: Testing approach

**Decision**: four layers, all under the existing `vitest` setup and in TDD order.

- `tests/unit/board-filter.test.ts` — the shared predicate and the `searchText` matching rules (trim, case-insensitivity, whitespace-only, missing fields).
- `tests/integration/board.test.ts` (extended) — `/api/board` returns `tags` and `searchText` built from title, notes, and linked person/company names.
- `tests/integration/mcp-read-tools.test.ts` (extended) — `list-board` with `search`, with `tags`, with both, and with neither (US5's four scenarios verbatim).
- `tests/component/board.test.ts` (extended, jsdom) — filter bar rendering, live narrowing, tag selector contents, indicator and clear control, "No cards match", persistence against a stubbed `localStorage`, and the two drag-while-filtered guards.

**Rationale**: this mirrors how every existing board behaviour is already covered in this repo. The component tests are where the UI acceptance scenarios (US1–US4) become automated checks, with `browser-tester` evidence layered on top per Constitution III; US5 is MCP-only, so its evidence is recorded automated-check output.
