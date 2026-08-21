# Feature Specification: board-search-filter

**Feature Branch**: `025-board-search-filter`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "As Tyler, I want a filter bar on the kanban board — a case-insensitive text search over a card's title, its notes, and the names of the people and companies linked to it, plus a tag filter — so that I can find the card I'm thinking of on a board that has outgrown 'scan every lane', instead of reading every card face." (see `docs/product/features/board-search-filter.md`)

## User Scenarios & Testing *(mandatory)*

All scenarios below run against this seeded board unless a scenario states otherwise. Tags "VIP", "Q3", and "Prospect" exist, person "Sam Rivera" and company "Acme Inc" exist, and "Prospect" is attached to Sam Rivera only — no card carries it:

| Card | Lane | Notes | Tags | Links |
| --- | --- | --- | --- | --- |
| Follow up with Sam | To Do | "Kickoff call went well" | VIP | person Sam Rivera |
| Write proposal | In Progress | "Waiting on budget numbers" | Q3 | — |
| Review budget | In Progress | — | — | — |
| Book venue | Waiting | — | — | company Acme Inc |
| Prep board deck | Done | — | Q3 | — |
| Send recap | Done | — | Q3 | — |

### User Story 1 - Find a card by typing (Priority: P1)

Tyler opens a board that has grown past the point where he can scan every lane. A filter bar sits above the lanes with a search input. He types what he remembers about the card — a word from its title, a phrase from a note he wrote on it, or the name of the person or company it's about — and the board narrows live as he types, hiding cards that don't match while all four lanes stay in place. An indicator tells him how much of the board he's currently seeing.

**Why this priority**: This is the core of the feature. Text search alone makes an overgrown board navigable and is independently useful with no other filtering in place.

**Independent Test**: Type text into the search input on the seeded board and verify only cards whose title, note text, or linked person/company name contains that text (case-insensitively) remain visible, with the lanes still displayed.

**Acceptance Scenarios**:

1. **Given** the seeded board with no filter applied, **When** I open the board, **Then** a filter bar above the lanes shows an empty search input, all six cards appear in their lanes in their manual order, and no active-filter indicator or clear-filters control is shown.
2. **Given** the board with no filter applied, **When** I type "SAM" into the search input one character at a time, **Then** the board narrows as I type without my pressing any button, ending with To Do showing only "Follow up with Sam" (matched case-insensitively on its title), In Progress, Waiting, and Done each showing their empty-lane placeholder, and the filter bar showing an active-filter indicator reading "1 of 6 cards" alongside a clear-filters control.
3. **Given** the board with no filter applied, **When** I type "budget" into the search input, **Then** In Progress shows "Write proposal" — matched on its note text "Waiting on budget numbers", not its title — and "Review budget", matched on its title, and the other three lanes show their empty-lane placeholder.
4. **Given** the board with no filter applied, **When** I search "rivera", then clear it and search "acme", **Then** "rivera" leaves only "Follow up with Sam" visible (matched on its linked person's name, which appears nowhere in its title or notes) and "acme" leaves only "Book venue" visible (matched on its linked company's name).
5. **Given** the board with no filter applied, **When** I search "zebra", **Then** all four lanes show their empty-lane placeholder, the board shows a "No cards match" message, and the indicator reads "0 of 6 cards" — the lanes themselves are still displayed.

---

### User Story 2 - Narrow the board by tag (Priority: P2)

Tyler wants to see only the cards carrying one or more tags. The filter bar offers a tag selector listing exactly the tags currently attached to at least one card on the board. He selects one or more; cards carrying any selected tag stay visible. When he also has search text entered, both conditions must hold.

**Why this priority**: Tags are the one facet Tyler asked for and they answer a different question than text search ("show me everything for Q3"), but the board is already navigable with text search alone.

**Independent Test**: Select tags in the tag selector on the seeded board and verify only cards carrying at least one selected tag remain visible; add search text and verify the two filters intersect.

**Acceptance Scenarios**:

1. **Given** the seeded board with no filter applied, **When** I open the board, **Then** the tag selector offers exactly "Q3" and "VIP" (alphabetically) with nothing selected — "Prospect" is absent because no card carries it.
2. **Given** the board with no filter applied, **When** I select tag "Q3" in the tag selector, then also select "VIP", **Then** selecting "Q3" alone shows "Write proposal", "Prep board deck", and "Send recap" and nothing else; adding "VIP" additionally shows "Follow up with Sam" — a card matches if it carries **any** selected tag — and the indicator reads "4 of 6 cards".
3. **Given** the board filtered to tag "Q3", **When** I also type "budget" into the search input, **Then** only "Write proposal" is visible — the text search and the tag filter both have to match ("Review budget" matches the text but has no tag; "Prep board deck" carries the tag but not the text).

---

### User Story 3 - The filter sticks until cleared (Priority: P2)

Tyler sets a filter, wanders off to the People page, comes back, and reloads the browser — the filter is still exactly as he left it, so he doesn't lose his place mid-task. When he's done, one clear-filters control puts the whole board back.

**Why this priority**: A filter that silently resets on navigation makes multi-step work (open a card, come back, open the next) frustrating, but the feature is still usable without persistence.

**Independent Test**: Apply a text and tag filter, reload the page and navigate away and back, verifying the filter and the narrowed board are unchanged each time, then use the clear-filters control and verify the full board returns.

**Acceptance Scenarios**:

1. **Given** the board filtered to tag "Q3" with search text "budget", **When** I reload the page, and separately navigate to the People page and back to the board, **Then** the filter survives both — the search input still reads "budget", "Q3" is still selected, and only "Write proposal" is visible each time.
2. **Given** the board filtered to tag "Q3" with search text "budget", **When** I use the clear-filters control, **Then** all six cards are restored in their manual order, the search input is empty, no tag is selected, and no active-filter indicator is shown.

---

### User Story 4 - Dragging while filtered (Priority: P3)

With a filter applied Tyler can still move a card to a different lane — it lands at the bottom of the destination lane, because the filtered view can't show him where within the lane he'd be dropping it. Reordering a card within its own lane is not available while filtered, so a hidden card's position is never silently disturbed.

**Why this priority**: Filtering must not break the existing drag behavior, but this is a guard on an existing capability rather than new value.

**Independent Test**: With a tag filter applied, drag a card into another lane and verify it appears at the bottom of that lane once the filter is cleared; attempt a within-lane reorder and verify the manual order is unchanged after clearing and after reload.

**Acceptance Scenarios**:

1. **Given** the board filtered to tag "Q3", so In Progress shows only "Write proposal" and Done shows "Prep board deck" above "Send recap", **When** I drag "Write proposal" into Waiting, **Then** "Write proposal" moves to Waiting and lands at the bottom of that lane — clearing the filter shows Waiting as "Book venue" then "Write proposal".
2. **Given** the same filtered board, **When** I try to drag "Send recap" above "Prep board deck" within Done, **Then** the within-lane reorder does not happen — Done still shows "Prep board deck" above "Send recap" after clearing the filter and after a page reload.

---

### User Story 5 - Agents can filter the board too (Priority: P2)

An agent working through the work-helper MCP can narrow the board the same way Tyler can, so it can answer "what's on the board about the budget" without pulling every card and filtering client-side.

**Why this priority**: Agents are first-class consumers of the board; without this they see an all-or-nothing board listing while the UI has filtering.

**Independent Test**: Call the board-listing MCP tool with a text-search argument, a tag argument, and both, and verify each response contains exactly the expected cards grouped by lane.

**Acceptance Scenarios**:

1. **Given** the seeded board, **When** an authorized agent calls the board-listing MCP tool with a text-search argument "budget", **Then** the response contains exactly "Write proposal" and "Review budget", grouped under their lane in board order.
2. **Given** the seeded board, **When** an authorized agent calls the board-listing MCP tool with a tag argument of "Q3", **Then** the response contains exactly "Write proposal", "Prep board deck", and "Send recap", grouped under their lane in board order.
3. **Given** the seeded board, **When** an authorized agent calls the board-listing MCP tool with both a text-search argument "budget" and a tag argument of "Q3", **Then** the response contains exactly "Write proposal".
4. **Given** the seeded board, **When** an authorized agent calls the board-listing MCP tool with neither argument, **Then** the whole board is returned unchanged.

---

### Edge Cases

- **Whitespace-only search**: a search input containing only spaces counts as no text filter at all; leading and trailing whitespace is trimmed before matching, so " budget " matches the same cards as "budget".
- **A selected tag stops being used**: if the last card carrying a selected tag loses that tag while the filter is on, the tag stays selected and listed in the selector until the filter is cleared, rather than vanishing mid-filter and silently widening the view.
- **Empty board or no tags in use**: with no cards on the board, or no card carrying any tag, the filter bar is still shown; the tag selector simply offers nothing to select.
- **Every card hidden**: filtering to zero matches still shows all four lanes with their empty-lane placeholders plus a "No cards match" message — the board never collapses to a blank page.
- **A card stops matching while filtered**: a card edited (or moved by an agent) so it no longer matches the active filter disappears from the filtered view on the next render, with the "N of M cards" count following.
- **Cards with no notes, tags, or links**: a card matches on whatever fields it does have; missing notes/links are simply not searched, never an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The kanban board MUST display a filter bar above the lanes, containing a text search input and a tag selector.
- **FR-002**: The text search MUST match a card if the (whitespace-trimmed) search text appears, case-insensitively, as a substring of the card's title, any of its note text, or the name of any person or company linked to it.
- **FR-003**: The text search MUST apply live as the user types, with no button to press to run it.
- **FR-004**: A whitespace-only or empty search input MUST count as no text filter.
- **FR-005**: The tag selector MUST list, in alphabetical order, exactly the tags currently attached to at least one card on the board — tags that exist but carry no card MUST NOT be offered.
- **FR-006**: The tag filter MUST allow multiple tags to be selected at once, and MUST match a card that carries **any** selected tag.
- **FR-007**: A tag that is selected when the last card carrying it loses that tag MUST remain selected and listed until the filter is cleared.
- **FR-008**: When both a text search and one or more tags are active, a card MUST be visible only if it matches the text search **and** carries at least one selected tag.
- **FR-009**: Filtering MUST hide non-matching cards while keeping all four configured lanes (To Do, In Progress, Waiting, Done) displayed, each showing its empty-lane placeholder when it has no visible cards.
- **FR-010**: Visible cards MUST keep their existing manual order and their current card face — no highlighting of matched text, no match explanation, no added card content.
- **FR-011**: While any filter is active, the filter bar MUST show an active-filter indicator reading "N of M cards" (N visible, M total on the board) alongside a clear-filters control; with no filter active, neither MUST be shown.
- **FR-012**: When a filter is active and no card matches, the board MUST show a "No cards match" message with the indicator reading "0 of M cards".
- **FR-013**: The clear-filters control MUST reset the search input to empty and deselect all tags in one action, restoring every card in its manual order.
- **FR-014**: The active filter (search text and selected tags) MUST persist across a page reload and across navigating away from the board and back, until it is cleared.
- **FR-015**: While a filter is active, dragging a card to a different lane MUST move it and place it at the bottom of the destination lane.
- **FR-016**: While a filter is active, reordering a card within its own lane MUST NOT be possible, and the lane's persisted manual order MUST be unchanged by the attempt.
- **FR-017**: The board-listing MCP tool MUST accept an optional text-search argument and an optional tag argument that filter results by the same rules as FR-002, FR-006, and FR-008.
- **FR-018**: The board-listing MCP tool MUST group returned cards under their lane in board order, and MUST return the whole board unchanged when neither filter argument is supplied.

### Key Entities

- **Card (task)**: the kanban card introduced by `create-task`; carries a title, an ordered position within a lane, note text, tags, and links to people and companies. Filtering only reads these; it never modifies them.
- **Tag**: an existing named tag attachable to cards and to people/companies. Only tags attached to at least one card participate in the board's tag selector.
- **Person / Company**: existing CRM records linkable to a card. Their **names** are searchable through the card's text search.
- **Active filter**: the current search text plus the set of selected tags — a view-level state that survives reload and navigation until cleared, and is never part of a card's stored data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can locate a specific known card on the seeded board by typing a fragment of its title, its notes, or its linked person/company name, in a single interaction with no button press.
- **SC-002**: The board updates to the filtered result within one typed character — the user never has to wait for or trigger a separate search step.
- **SC-003**: For every scenario in this spec, the set of visible cards is exactly the expected set — no extra card is shown and no matching card is hidden.
- **SC-004**: Applying a filter, reloading, and navigating away and back leaves the filter and the visible card set identical all three times.
- **SC-005**: Clearing the filter restores all cards in exactly the manual order they had before the filter was applied, in one action.
- **SC-006**: An agent calling the board-listing MCP tool with search and tag arguments receives exactly the same set of cards the UI shows for the equivalent filter.
- **SC-007**: No filtering action changes any card's stored lane or manual position except an explicit cross-lane drag, which appends to the destination lane.

## Assumptions

- "Card" means a task on the kanban board (the entity `create-task` introduced); the configured lanes are To Do, In Progress, Waiting, Done per `create-task`.
- Text matching is plain case-insensitive substring matching — no whole-word, fuzzy, ranked, boolean, quoted-phrase, or field-prefixed (`tag:VIP`) matching.
- Search text is trimmed of leading and trailing whitespace before matching, and a whitespace-only search counts as no filter at all (assumption to confirm at acceptance).
- The tag selector's contents change as cards are tagged and untagged, and a selected tag whose last card loses it stays selected and listed until the filter is cleared (assumption to confirm at acceptance).
- The "N of M cards" indicator is sufficient signal that a filter is active — no additional banner or lane-header treatment is needed (assumption to confirm at acceptance).
- Copy for the filter bar's controls, indicator, and empty states ("N of M cards", "No cards match") is illustrative; Tyler may adjust exact wording at acceptance.
- "An authorized agent" means an MCP client authenticated per the existing `mcp-authentik-auth` flow; this feature adds no authentication or access-control behavior of its own.
- Where the active filter is stored (URL, browser storage, server-side preference) is a `/speckit-plan` decision; product-level it only has to survive a reload and a navigation round trip.
- Drag behavior remains desktop-only per `move-task-between-lanes`; touch/mobile drag while filtered is not addressed.
- Every matching card is shown — there is no pagination and no result cap; boards are personal-CRM sized.
- The existing kanban card face is unchanged by this feature (title-only), per the `kanban-card-indicators` stub.

## Out of Scope

- Sorting cards or lanes by any field — manual drag order remains the board's only order (split to the `kanban-lane-sorting` stub, which also carries the question of whether sorting is transient or rewrites the manual order).
- Filter facets beyond tags — no linked-person, linked-company, has-linked-emails, or lane facet controls (recorded in the `kanban-filter-facets` stub). Person and company *names* remain reachable through the text search.
- Matching linked email conversation subjects or tag names through the text search.
- Saved filters, presets, or filter history (recorded in `kanban-filter-facets`).
- Highlighting the matched substring or showing *why* a card matched.
- Any change to what a kanban card face displays (`kanban-card-indicators` stub).
- Search, sort, or filter controls on the People, Companies, or Tags lists (`people-company-list-filter` stub); email search/filter stays in the existing `email-search-filter` stub.
- Fuzzy or typo-tolerant matching, relevance ranking, boolean operators, quoted phrases, field-prefixed queries.
- Filtering by note author, note source ("You" vs "via MCP"), or any date/age of a card.
- Pagination or a result cap.
- Touch/mobile drag behavior while filtered.
- Authentication / multi-user access control.

## Dependencies

- `create-task` (cards and the four configured lanes), `task-notes` (note text), `tags` (tag attachment), `track-people` and `companies` (linked person/company names) — all already landed on `main`.
- `move-task-between-lanes` and `mcp-move-tasks` (existing manual drag order and lane moves, whose behavior FR-015 and FR-016 constrain while filtered).
- The existing board-listing MCP tool (`list-board`) and the `mcp-authentik-auth` flow that authorizes agents calling it.
