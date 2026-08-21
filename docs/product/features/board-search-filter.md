# Feature: board-search-filter

## User story

As Tyler, I want a filter bar on the kanban board — a case-insensitive text search over a card's title, its notes, and the names of the people and companies linked to it, plus a tag filter — so that I can find the card I'm thinking of on a board that has outgrown "scan every lane", instead of reading every card face.

## Acceptance criteria

"Card" means a task on the kanban board (the same entity `create-task` introduced). The configured lanes are To Do, In Progress, Waiting, Done, per `create-task`. Text search is a case-insensitive substring match — no whole-word, fuzzy, or ranked matching — and applies live as you type, with no search button to press. Filtering hides non-matching cards while the four lanes stay in place. "An authorized agent" means an MCP client authenticated per the `mcp-authentik-auth` flow. Copy for the filter bar's controls, indicator, and empty states is illustrative; Tyler can adjust exact wording at acceptance.

All criteria below run against this seeded board (test setup), unless a criterion states otherwise. Tags "VIP", "Q3", and "Prospect" exist, person "Sam Rivera" and company "Acme Inc" exist, and "Prospect" is attached to Sam Rivera only — no card carries it:

| Card | Lane | Notes | Tags | Links |
| --- | --- | --- | --- | --- |
| Follow up with Sam | To Do | "Kickoff call went well" | VIP | person Sam Rivera |
| Write proposal | In Progress | "Waiting on budget numbers" | Q3 | — |
| Review budget | In Progress | — | — | — |
| Book venue | Waiting | — | — | company Acme Inc |
| Prep board deck | Done | — | Q3 | — |
| Send recap | Done | — | Q3 | — |

- **Given** the seeded board with no filter applied
  **When** I open the board
  **Then** a filter bar above the lanes shows an empty search input and a tag selector offering exactly "Q3" and "VIP" (alphabetically) with nothing selected — "Prospect" is absent because no card carries it — all six cards appear in their lanes in their manual order, and no active-filter indicator or clear-filters control is shown

- **Given** the board with no filter applied
  **When** I type "SAM" into the search input, one character at a time
  **Then** the board narrows as I type without my pressing any button, ending with To Do showing only "Follow up with Sam" (matched case-insensitively on its title), In Progress, Waiting, and Done each showing their empty-lane placeholder, and the filter bar showing an active-filter indicator reading "1 of 6 cards" alongside a clear-filters control

- **Given** the board with no filter applied
  **When** I type "budget" into the search input
  **Then** In Progress shows "Write proposal" — matched on its note text "Waiting on budget numbers", not its title — and "Review budget", matched on its title, and the other three lanes show their empty-lane placeholder

- **Given** the board with no filter applied
  **When** I search "rivera", then clear it and search "acme"
  **Then** "rivera" leaves only "Follow up with Sam" visible (matched on its linked person's name, which appears nowhere in its title or notes) and "acme" leaves only "Book venue" visible (matched on its linked company's name)

- **Given** the board with no filter applied
  **When** I search "zebra"
  **Then** all four lanes show their empty-lane placeholder, the board shows a "No cards match" message, and the indicator reads "0 of 6 cards" — the lanes themselves are still displayed

- **Given** the board with no filter applied
  **When** I select tag "Q3" in the tag selector, then also select "VIP"
  **Then** selecting "Q3" alone shows "Write proposal", "Prep board deck", and "Send recap" and nothing else; adding "VIP" additionally shows "Follow up with Sam" — a card matches if it carries **any** selected tag — and the indicator reads "4 of 6 cards"

- **Given** the board filtered to tag "Q3"
  **When** I also type "budget" into the search input
  **Then** only "Write proposal" is visible — the text search and the tag filter both have to match ("Review budget" matches the text but has no tag; "Prep board deck" carries the tag but not the text)

- **Given** the board filtered to tag "Q3" with search text "budget"
  **When** I reload the page, navigate to the People page and back to the board, and then use the clear-filters control
  **Then** the filter survives the reload and the round trip — the search input still reads "budget", "Q3" is still selected, and only "Write proposal" is visible each time — and clearing restores all six cards in their manual order with the search input empty, no tag selected, and no active-filter indicator

- **Given** the board filtered to tag "Q3", so In Progress shows only "Write proposal" and Done shows "Prep board deck" above "Send recap"
  **When** I drag "Write proposal" into Waiting, then try to drag "Send recap" above "Prep board deck" within Done
  **Then** "Write proposal" moves to Waiting and lands at the bottom of that lane (clearing the filter shows Waiting as "Book venue" then "Write proposal"), while the within-lane reorder does not happen — Done still shows "Prep board deck" above "Send recap" after clearing the filter and after a page reload

- **Given** the seeded board
  **When** an authorized agent calls the board-listing MCP tool three times — with a text-search argument "budget", with a tag argument of "Q3", and with both together
  **Then** the first response contains exactly "Write proposal" and "Review budget", the second exactly "Write proposal", "Prep board deck", and "Send recap", and the third exactly "Write proposal" — each response grouping cards under their lane in board order, and a call with neither argument still returns the whole board unchanged

## Out of scope

- Sorting cards or lanes by any field — the manual drag order from `move-task-between-lanes` remains the board's only order. Split to the new `kanban-lane-sorting` stub, which also carries the unresolved question of whether sorting is a transient view or rewrites the persistent manual order.
- Filter facets beyond tags — no linked-person, linked-company, has-linked-emails, or lane facet controls. People and company **names** are reachable through the text search; dedicated facets are recorded in the new `kanban-filter-facets` stub.
- Matching linked email conversation subjects or tag names through the text search — the search covers card title, note text, and linked person/company names only.
- Saved filters, presets, or a filter history — you set the filter fresh each time (it persists until cleared, but there is no way to name and recall one). Recorded in `kanban-filter-facets`.
- Highlighting the matched substring on the card face or showing *why* a card matched — matching cards render exactly as they do today.
- Any change to what a kanban card face displays — cards stay title-only for the fifth consecutive slice; see the `kanban-card-indicators` stub.
- Search, sort, or filter controls on the People, Companies, or Tags lists — split to the new `people-company-list-filter` stub. Email search/filter stays in the existing `email-search-filter` stub.
- Fuzzy or typo-tolerant matching, relevance ranking, boolean operators, quoted phrases, or field-prefixed queries (`tag:VIP`) — plain case-insensitive substring only.
- Filtering by note author, note source ("You" vs "via MCP"), or any date/age of a card.
- Pagination or a result cap — every matching card is shown.
- Touch/mobile drag behavior while filtered — drag stays desktop-only per `move-task-between-lanes`.
- Authentication / multi-user access control.

## Open questions

Interview resolved (2026-08-20), from the `kanban-sort-filter` stub: filtering only, sorting deferred; search covers title, notes, and linked person/company names; tags are the one facet, multi-select matching **any** selected tag; text and tag filters combine with AND; lanes stay visible with non-matching cards hidden; the filter survives reload and navigation until cleared; dragging while filtered moves a card between lanes (appending to the bottom of the destination) but cannot reorder within a lane; the tag selector lists only tags currently attached to at least one card; the filter applies live as you type; the MCP board-listing tool gains the same search and tag arguments.

- **Assumption to confirm:** because the tag selector only lists tags in use on the board, its contents change as cards are tagged and untagged — and a tag that is selected when its last card loses it stays selected (and listed) until cleared, rather than vanishing mid-filter.
- **Assumption to confirm:** search text is trimmed of leading/trailing whitespace before matching, and a whitespace-only search counts as no filter at all.
- **Assumption to confirm:** the active-filter indicator's "N of M cards" count is enough of a signal that a filter is on; no additional banner or lane-header treatment is needed.
- Where the filter is stored (URL, browser storage, server-side preference) is a `/speckit-plan` decision; product-level it only has to survive a reload and navigation away and back, as the criteria exercise.
