# Feature: up-next-dashboard

## User story

As Tyler, I want an "Up Next" dashboard page — a desktop-optimized, glanceable flat list of the top cards to work on next, with quick done and add-note actions right on the list and a view configuration that saves server-side so it follows me across devices — so that a side monitor can always show me what to do next, and acting on a card is one click instead of a trip through the full board.

## Acceptance criteria

"Card" means a task on the kanban board (the same entity `create-task` introduced). For these criteria the configured lanes are Up Next, In Progress, Waiting, Done (in that order), and the lane config additionally designates Up Next and In Progress as the dashboard's **default lanes** and Done as the **quick-done target lane** — both designations live in the lane config file, edited and applied by restart like lanes themselves. The dashboard is a single flat list: cards are ordered by configured lane order first (every card of an earlier lane outranks every card of a later lane), then by manual board order within a lane, with the card limit truncating the list after all filters apply. The built-in default view, in effect until settings are first saved: the config-designated default lanes, no tag or text filter, card limit 5, and display toggles tags / latest note / linked people & companies on with lane off. The filter's text search and tag facet reuse `board-search-filter` semantics — case-insensitive substring over card title, note text, and linked person/company names; multi-select tags matching **any** selected tag; all filter parts combining with AND. Archived cards never appear on the dashboard. View settings are one saved view for the app's single user, stored server-side. "An authorized agent" means an MCP client authenticated per the `mcp-authentik-auth` flow. Control, popup, and empty-state copy is illustrative; Tyler can adjust exact wording at acceptance.

All criteria run against this seeded board (test setup), unless a criterion states otherwise. Tags "VIP" and "Q3" exist; person "Sam Rivera" and company "Acme Inc" exist:

| Card | Lane | Tags | Notes | Links |
| --- | --- | --- | --- | --- |
| Follow up with Sam | Up Next (1st) | VIP | "Kickoff call went well" | person Sam Rivera, company Acme Inc |
| Write proposal | Up Next (2nd) | Q3 | — | — |
| Review budget | Up Next (3rd) | — | "Waiting on budget numbers" | — |
| Book venue | In Progress (1st) | — | — | — |
| Order catering | In Progress (2nd) | — | — | — |
| Send invites | In Progress (3rd) | — | — | — |
| Chase invoice | Waiting (1st) | VIP | — | — |
| Prep board deck | Done (1st) | Q3 | — | — |
| Old duplicate | Up Next, archived | — | — | — |

- **Given** the seeded board and no dashboard settings ever saved
  **When** I open the Up Next page via an "Up Next" link in the top navigation bar
  **Then** the nav marks Up Next as the active section and the page shows exactly 5 cards as one flat top-to-bottom list — "Follow up with Sam", "Write proposal", "Review budget", "Book venue", "Order catering" — with "Send invites" absent (cut by the limit of 5), "Chase invoice" absent (Waiting is not a default lane), "Prep board deck" absent (Done is not a default lane), and "Old duplicate" absent (archived cards never appear)

- **Given** the dashboard showing the built-in default view
  **When** I look at the "Follow up with Sam" card
  **Then** it shows its title, the "VIP" chip in the same color it renders everywhere else, a snippet of its latest note "Kickoff call went well" with a relative timestamp, and its linked "Sam Rivera" and "Acme Inc" — but no lane name (the lane toggle defaults off) — while a card with none of those, like "Order catering", shows just its title

- **Given** the dashboard showing the built-in default view
  **When** I open the display settings popup — which lists four toggles: tags, latest note, linked people/companies (on) and lane (off) — turn lane on and latest note off, and then close the popup without clicking OK
  **Then** while the popup is open the cards behind it update immediately ("Follow up with Sam" shows "Up Next" and no note snippet), closing without OK brings up a confirmation warning of unsaved changes, and choosing to discard reverts the cards to the saved display; making the same changes again and clicking OK applies them, and they are still applied after a page reload

- **Given** the dashboard showing the built-in default view
  **When** I open the filter settings popup, additionally select lane Waiting, set the card limit to 7, and click OK
  **Then** while the popup is open the list behind it immediately grows to 7 cards ending with "Send invites" and "Chase invoice", and after OK the 7-card view is the saved view — still shown after a page reload

- **Given** the saved view from the previous criterion (lanes Up Next, In Progress, Waiting; limit 7)
  **When** I open the Up Next page in a fresh browser session that shares no cookies or storage with the first (e.g. a different browser profile)
  **Then** the saved view applies there too — 7 cards, same filter and display settings — proving settings are stored server-side, not in the browser

- **Given** the dashboard showing the built-in default view
  **When** I open the filter settings popup, select tag "Q3", and click OK, then reopen it, type "budget" into the text search, and click OK
  **Then** after the first save only "Write proposal" is listed ("Prep board deck" also carries Q3 but Done is not a selected lane), and after the second the list is empty with a styled no-match message — the tag and the text must both match, and "Review budget" matches the text but carries no tag

- **Given** the dashboard showing the built-in default view
  **When** I click the quick done action on "Write proposal"'s card
  **Then** with no confirmation step the card moves to the bottom of the Done lane on the board (below "Prep board deck"), it leaves the dashboard, and "Send invites" backfills as the 5th card — all still true after a page reload

- **Given** the dashboard showing the built-in default view
  **When** I use the add-note control on "Follow up with Sam"'s card, type "Sam replied — pricing approved", and submit, and then try to submit another note that is whitespace-only
  **Then** I never leave the dashboard, the card's latest-note snippet now reads "Sam replied — pricing approved", the task's detail view shows it as the newest note labeled "You", and the whitespace-only submit is rejected with a validation message adding nothing

- **Given** the dashboard showing the built-in default view
  **When** I click the "Order catering" card (not one of its quick actions), then click the "Up Next" lane pill inside what opens, then close it
  **Then** the click opened the card's full detail view as an overlay above the dashboard — title, lane pills with In Progress current, notes, tags, linked people/companies/emails, and the archive and delete controls, everything the detail page shows — and after the pill click and close, the dashboard (still on the same page, no full navigation) shows "Order catering" 4th and "Book venue" 5th, matching the card's new spot at the bottom of Up Next

- **Given** the dashboard open in the built-in default view
  **When** an authorized agent calls the MCP move tool to move "Follow up with Sam" to Waiting, and I do not touch the page
  **Then** within 90 seconds the dashboard updates on its own — "Follow up with Sam" is gone and the list reads "Write proposal", "Review budget", "Book venue", "Order catering", "Send invites"

## Out of scope

- Any new or changed MCP tools — the dashboard is a pure UI view over data agents already reach via `list-board`; the saved view settings have no MCP surface.
- Any change to the board page or its filter bar — the dashboard's filter and the board's filter are fully independent settings; setting one never touches the other.
- Dragging or reordering on the dashboard — priority is the board's manual order; changing it happens by dragging on the board (or moving lanes via the overlay's pills).
- Archived cards on the dashboard, or a show-archived toggle here — the board's toggle from `card-archive` is the only archived-cards view.
- Quick actions beyond done and add-note — no archive, delete, tag, or link quick actions on dashboard cards.
- Ranking by anything other than lane + manual order — due dates and priority fields don't exist (see the `task-fields` stub); when they ship, joining this dashboard's display and filters is their natural follow-on.
- Multiple named views or presets — one saved view; board-side saved presets remain in the `kanban-filter-facets` stub.
- Live push updates — polling auto-refresh only in this slice.
- A dedicated mobile pass — desktop-optimized by explicit request; the page inherits the app's responsive shell but no phone-width design work.
- Lane-config management UI — the default-lanes and done-lane designations are edited in the config file and applied by restart, exactly like lanes today.
- Toasts, animations, or loading skeletons — still the `ui-polish` stub.

## Open questions

Interview resolved (2026-08-25): default view is the top 5 cards from the config-designated default lanes (Tyler's Up Next, filling from In Progress); flat list ordered by configured lane order then manual order; quick done moves to the config-designated done lane; filter knobs are lanes, tags, text search, and card limit; display and filter settings live in two separate small popups that preview changes live behind the popup, save on OK, and confirm before discarding unsaved changes; settings persist server-side across devices; card faces show tags, latest-note snippet, and linked people/companies by default with lane as a default-off toggle; notes add inline on the card; clicking a card opens the full detail view as an overlay; the page auto-refreshes by polling.

- **Assumption to confirm:** the poll interval is at most 60 seconds (the criteria allow 90 seconds for a change to appear); the exact interval is a `/speckit-plan` decision within that bound.
- **Assumption to confirm:** a background refresh never clobbers what you're doing — an open popup's live preview, an in-progress note input, and an open overlay all survive a poll tick, with list changes applied around them.
- **Assumption to confirm:** if the lane config lacks the new designations, the dashboard falls back to the first configured lane as the default lane and the last configured lane as the done target, so existing deployments work before the config is updated.
- **Assumption to confirm:** the filter popup's tag selector lists only tags attached to at least one card, alphabetically, matching the board filter bar; the card limit is a positive integer defaulting to 5 (input mechanics and any upper bound are `/speckit-plan` decisions).
- **Assumption to confirm:** if the designated done lane is among the filter's selected lanes, a quick-done'd card simply stays visible per the filter in its new position — the dashboard never special-cases it.
- The latest-note snippet's truncation length and the exact popup layouts are acceptance-time details; where the server stores the settings (and its migration) is a `/speckit-plan` decision.
