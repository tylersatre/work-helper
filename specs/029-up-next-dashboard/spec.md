# Feature Specification: Up Next Dashboard

**Feature Branch**: `029-up-next-dashboard`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "docs/product/features/up-next-dashboard.md — As Tyler, I want an 'Up Next' dashboard page — a desktop-optimized, glanceable flat list of the top cards to work on next, with quick done and add-note actions right on the list and a view configuration that saves server-side so it follows me across devices — so that a side monitor can always show me what to do next, and acting on a card is one click instead of a trip through the full board."

## Glossary & Shared Definitions

- **Card**: a task on the kanban board (the same entity `create-task` introduced).
- **Configured lanes** (for all scenarios below): Up Next, In Progress, Waiting, Done, in that order. The lane configuration additionally designates Up Next and In Progress as the dashboard's **default lanes** and Done as the **quick-done target lane**; both designations live in the lane config file and are edited and applied by restart, exactly like lanes themselves.
- **Flat list ordering**: cards are ordered by configured lane order first (every card of an earlier lane outranks every card of a later lane), then by manual board order within a lane. The card limit truncates the list after all filters apply.
- **Built-in default view** (in effect until settings are first saved): the config-designated default lanes, no tag or text filter, card limit 5, and display toggles tags / latest note / linked people & companies on with lane off.
- **Filter semantics**: the text search and tag facet reuse `board-search-filter` semantics — case-insensitive substring over card title, note text, and linked person/company names; multi-select tags matching **any** selected tag; all filter parts combining with AND.
- **Saved view**: one server-side saved view for the app's single user; archived cards never appear on the dashboard.
- **Authorized agent**: an MCP client authenticated per the `mcp-authentik-auth` flow.
- Control, popup, and empty-state copy throughout this spec is illustrative; Tyler can adjust exact wording at acceptance.

### Seeded board (test setup for all acceptance scenarios unless stated otherwise)

Tags "VIP" and "Q3" exist; person "Sam Rivera" and company "Acme Inc" exist:

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

## Clarifications

### Session 2026-08-25

- Q: What should the dashboard do when the saved view references a tag that has since been deleted or a lane that is no longer in the lane config? → A: Silently ignore stale entries — apply the filter using only the lanes/tags that still exist; if none of the saved lanes exist anymore, fall back to the config-designated default lanes.
- Q: When a background poll fails (server unreachable, network error), what should the always-on dashboard show? → A: Keep showing the last-good list and retry silently — no visible indication that refreshes are failing.
- Q: Should the background poll also pick up saved-view changes made on another device, or only card changes? → A: Both — a view change made elsewhere applies to an untouched open dashboard within the same 90-second window (an open popup still previews its own pending changes).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glanceable Up Next list (Priority: P1)

Tyler opens the Up Next page from the top navigation and sees, with zero prior setup, one flat top-to-bottom list of the top cards to work on next: cards from the config-designated default lanes, ordered by lane order then manual board order, capped at 5, with each card face showing its title, tags, latest-note snippet, and linked people/companies. A side monitor can sit on this page all day and always show what to do next.

**Why this priority**: This is the feature's core value — a glanceable answer to "what's next?" without opening the full board. Every other story decorates or acts on this list; without it nothing else has a surface to live on.

**Independent Test**: Seed the board, never save any dashboard settings, open the Up Next page via the nav link, and compare the rendered list and card faces against the seeded expectation.

**Acceptance Scenarios**:

1. **Given** the seeded board and no dashboard settings ever saved, **When** I open the Up Next page via an "Up Next" link in the top navigation bar, **Then** the nav marks Up Next as the active section and the page shows exactly 5 cards as one flat top-to-bottom list — "Follow up with Sam", "Write proposal", "Review budget", "Book venue", "Order catering" — with "Send invites" absent (cut by the limit of 5), "Chase invoice" absent (Waiting is not a default lane), "Prep board deck" absent (Done is not a default lane), and "Old duplicate" absent (archived cards never appear).
2. **Given** the dashboard showing the built-in default view, **When** I look at the "Follow up with Sam" card, **Then** it shows its title, the "VIP" chip in the same color it renders everywhere else, a snippet of its latest note "Kickoff call went well" with a relative timestamp, and its linked "Sam Rivera" and "Acme Inc" — but no lane name (the lane toggle defaults off) — while a card with none of those, like "Order catering", shows just its title.

---

### User Story 2 - One-click actions from the list (Priority: P2)

Tyler acts on a card directly from the dashboard: a quick done action moves the card to the designated done lane with no confirmation step, and an add-note control captures a note inline — in both cases without ever leaving the page.

**Why this priority**: "Acting on a card is one click instead of a trip through the full board" is the second half of the user story; the dashboard is read-only furniture without it.

**Independent Test**: From the seeded default view, quick-done one card and add a note to another; verify the board, the task's notes, and the dashboard list all reflect the actions without any navigation away from the page.

**Acceptance Scenarios**:

1. **Given** the dashboard showing the built-in default view, **When** I click the quick done action on "Write proposal"'s card, **Then** with no confirmation step the card moves to the bottom of the Done lane on the board (below "Prep board deck"), it leaves the dashboard, and "Send invites" backfills as the 5th card — all still true after a page reload.
2. **Given** the dashboard showing the built-in default view, **When** I use the add-note control on "Follow up with Sam"'s card, type "Sam replied — pricing approved", and submit, and then try to submit another note that is whitespace-only, **Then** I never leave the dashboard, the card's latest-note snippet now reads "Sam replied — pricing approved", the task's detail view shows it as the newest note labeled "You", and the whitespace-only submit is rejected with a validation message adding nothing.

---

### User Story 3 - Configure the view, saved across devices (Priority: P3)

Tyler tunes what the dashboard shows through two small popups — display toggles in one, filters (lanes, tags, text search, card limit) in the other. Changes preview live on the list behind the open popup, OK saves them as the single server-side view, closing without OK warns before discarding, and the saved view follows Tyler to any other browser or device.

**Why this priority**: The default view already works untouched (Story 1); configuration makes the dashboard fit how Tyler actually triages, and server-side persistence is what makes the side-monitor setup practical across machines.

**Independent Test**: Change display toggles and filters through the popups, verify live preview / OK-save / discard-confirmation behavior, reload, then open the page in a fresh browser session sharing no cookies or storage and verify the same saved view applies.

**Acceptance Scenarios**:

1. **Given** the dashboard showing the built-in default view, **When** I open the display settings popup — which lists four toggles: tags, latest note, linked people/companies (on) and lane (off) — turn lane on and latest note off, and then close the popup without clicking OK, **Then** while the popup is open the cards behind it update immediately ("Follow up with Sam" shows "Up Next" and no note snippet), closing without OK brings up a confirmation warning of unsaved changes, and choosing to discard reverts the cards to the saved display; making the same changes again and clicking OK applies them, and they are still applied after a page reload.
2. **Given** the dashboard showing the built-in default view, **When** I open the filter settings popup, additionally select lane Waiting, set the card limit to 7, and click OK, **Then** while the popup is open the list behind it immediately grows to 7 cards ending with "Send invites" and "Chase invoice", and after OK the 7-card view is the saved view — still shown after a page reload.
3. **Given** the saved view from the previous scenario (lanes Up Next, In Progress, Waiting; limit 7), **When** I open the Up Next page in a fresh browser session that shares no cookies or storage with the first (e.g. a different browser profile), **Then** the saved view applies there too — 7 cards, same filter and display settings — proving settings are stored server-side, not in the browser.
4. **Given** the dashboard showing the built-in default view, **When** I open the filter settings popup, select tag "Q3", and click OK, then reopen it, type "budget" into the text search, and click OK, **Then** after the first save only "Write proposal" is listed ("Prep board deck" also carries Q3 but Done is not a selected lane), and after the second the list is empty with a styled no-match message — the tag and the text must both match, and "Review budget" matches the text but carries no tag.

---

### User Story 4 - Full card detail as an overlay (Priority: P4)

Tyler clicks a card (anywhere but its quick actions) and the card's full detail view opens as an overlay above the dashboard — everything the detail page shows, including lane pills, notes, tags, links, and archive/delete controls. Changes made in the overlay are reflected in the list when it closes, with no full navigation.

**Why this priority**: For anything beyond done/add-note, the overlay is the escape hatch to full card management without losing the dashboard context; it reuses an existing view, so it rounds out the page rather than defining it.

**Independent Test**: Click a card, verify the overlay shows the complete detail view, move the card via a lane pill inside it, close it, and verify the dashboard reflects the move without a page navigation.

**Acceptance Scenarios**:

1. **Given** the dashboard showing the built-in default view, **When** I click the "Order catering" card (not one of its quick actions), then click the "Up Next" lane pill inside what opens, then close it, **Then** the click opened the card's full detail view as an overlay above the dashboard — title, lane pills with In Progress current, notes, tags, linked people/companies/emails, and the archive and delete controls, everything the detail page shows — and after the pill click and close, the dashboard (still on the same page, no full navigation) shows "Order catering" 4th and "Book venue" 5th, matching the card's new spot at the bottom of Up Next.

---

### User Story 5 - The page keeps itself current (Priority: P5)

The dashboard refreshes itself by polling, so changes made elsewhere — another device, the board page, or an AI agent acting through MCP tools — show up on the side monitor within 90 seconds with no interaction.

**Why this priority**: A side monitor that shows stale work items misleads instead of helping; but the page is fully usable with manual reloads, so freshness lands last.

**Independent Test**: With the dashboard open and untouched, move a listed card via the MCP move tool from an authorized agent and watch the list update on its own within 90 seconds.

**Acceptance Scenarios**:

1. **Given** the dashboard open in the built-in default view, **When** an authorized agent calls the MCP move tool to move "Follow up with Sam" to Waiting, and I do not touch the page, **Then** within 90 seconds the dashboard updates on its own — "Follow up with Sam" is gone and the list reads "Write proposal", "Review budget", "Book venue", "Order catering", "Send invites".

---

### Edge Cases

- Lane config without the new designations: the dashboard falls back to the first configured lane as the default lane and the last configured lane as the quick-done target, so existing deployments work before their config is updated.
- Filters matching nothing: the list renders a styled no-match message, not a blank page (Story 3, scenario 4).
- Whitespace-only note submission: rejected with a validation message; nothing is added (Story 2, scenario 2).
- Quick done when the designated done lane is among the filter's selected lanes: the card simply stays visible per the filter in its new position — the dashboard never special-cases it.
- A background poll tick while Tyler is mid-interaction: an open popup's live preview, an in-progress note input, and an open overlay all survive the tick, with list changes applied around them.
- A quick action on a card that was concurrently moved, archived, or deleted elsewhere: the action fails gracefully with a user-visible message and the next refresh shows the true state; it never acts on the wrong card.
- Card limit larger than the number of matching cards: the list simply shows all matches with no padding or error.
- All lanes deselected in the filter popup, or a non-numeric/zero/negative card limit: the popup prevents saving an invalid view (the card limit is a positive integer; exact input mechanics are a planning decision).
- Saved view referencing a deleted tag or a lane no longer in the lane config: stale entries are silently ignored — the filter applies using only the lanes/tags that still exist; if none of the saved lanes exist anymore, the dashboard falls back to the config-designated default lanes.
- A background poll fails (server unreachable, network error): the dashboard keeps showing the last-good list and retries silently on the normal interval — no error state, banner, or indicator; the next successful poll brings the list current.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The top navigation bar MUST include an "Up Next" link that opens the dashboard page and marks Up Next as the active section while on it.
- **FR-002**: The dashboard MUST render matching cards as a single flat top-to-bottom list ordered by configured lane order first, then by manual board order within each lane; it MUST NOT group, drag, or reorder — priority changes happen on the board or via the overlay's lane pills.
- **FR-003**: The card limit MUST truncate the list only after all filters (lanes, tags, text) apply.
- **FR-004**: Archived cards MUST never appear on the dashboard, regardless of filters; the dashboard offers no show-archived toggle.
- **FR-005**: Until settings are first saved, the dashboard MUST show the built-in default view: the config-designated default lanes, no tag or text filter, card limit 5, and display toggles tags / latest note / linked people & companies on with lane off.
- **FR-006**: The lane configuration MUST support designating the dashboard's default lanes and the quick-done target lane, edited in the config file and applied by restart exactly like lanes today; when the designations are absent, the dashboard MUST fall back to the first configured lane as the default lane and the last configured lane as the quick-done target.
- **FR-007**: Each card face MUST always show the card's title, and — per the display toggles — its tag chips (in the same colors they render everywhere else), a snippet of its latest note with a relative timestamp, its linked people and companies, and its lane name; a card without tags, notes, or links shows just its title (plus lane when that toggle is on).
- **FR-008**: A display settings popup MUST offer exactly four toggles — tags, latest note, linked people/companies, lane — reflecting the saved view's current values when opened.
- **FR-009**: A filter settings popup MUST offer lane multi-select, tag multi-select, text search, and card limit, reflecting the saved view's current values when opened; the tag selector lists only tags attached to at least one card, alphabetically, matching the board filter bar; the card limit accepts positive integers and defaults to 5.
- **FR-010**: Filter semantics MUST reuse `board-search-filter` semantics: text search is a case-insensitive substring match over card title, note text, and linked person/company names; multi-select tags match a card carrying **any** selected tag; all filter parts combine with AND.
- **FR-011**: While either popup is open, its pending changes MUST apply live to the list behind it as a preview; clicking OK saves them; closing any other way with unsaved changes MUST raise a confirmation, and choosing to discard MUST revert the list to the saved view.
- **FR-012**: View settings (filters and display toggles together) MUST be stored server-side as one saved view for the app's single user, so the same view applies in any browser session on any device; the saved view has no MCP surface, and the dashboard's settings are fully independent of the board page's filter bar — setting one never touches the other.
- **FR-013**: When no cards match the current view, the dashboard MUST show a styled no-match message.
- **FR-014**: Each card MUST offer a quick done action that, with no confirmation step, moves the card to the bottom of the config-designated quick-done target lane; the dashboard then reflects the move per the current filters (normally the card leaves and the next-ranked card backfills; if the target lane is among the selected lanes the card stays, unspecial-cased).
- **FR-015**: Each card MUST offer an add-note control that captures a note inline without leaving the dashboard; the submitted note becomes the task's newest note attributed to the app's user (shown as "You" in the detail view) and the card's latest-note snippet updates; a whitespace-only submission MUST be rejected with a validation message and add nothing.
- **FR-016**: Quick actions are limited to done and add-note — no archive, delete, tag, or link quick actions on dashboard cards.
- **FR-017**: Clicking a card outside its quick actions MUST open that card's full detail view as an overlay above the dashboard — title, lane pills, notes, tags, linked people/companies/emails, archive and delete controls, everything the detail page shows — and closing the overlay MUST return to the dashboard on the same page (no full navigation) with any changes made in the overlay reflected in the list.
- **FR-018**: The dashboard MUST auto-refresh by polling so that a change made elsewhere appears within 90 seconds with no user interaction; the poll interval is at most 60 seconds. This covers both card changes (including by an authorized MCP agent) and saved-view changes made on another device — an untouched open dashboard adopts a remotely saved view within the same window.
- **FR-019**: A background refresh MUST never clobber in-progress interaction: an open popup's live preview, an in-progress note input, and an open overlay all survive a poll tick, with list changes applied around them. While a popup is open, its pending changes keep driving the preview even if a poll brings a remotely changed saved view; clicking OK still saves the popup's state (last write wins).
- **FR-020**: The dashboard is desktop-optimized; it inherits the app's responsive shell but requires no dedicated phone-width design work.
- **FR-021**: When the saved view references a tag that no longer exists or a lane no longer present in the lane config, the dashboard MUST silently ignore the stale entries and apply the filter using only the lanes/tags that still exist; if none of the saved lanes still exist, it MUST fall back to the config-designated default lanes.
- **FR-022**: When a background poll fails, the dashboard MUST keep showing the last successfully loaded list and retry silently on the normal interval — no error state, banner, or staleness indicator; a failed poll never clears or alters the list, and the next successful poll brings it current.

### Key Entities

- **Dashboard saved view**: the single per-user server-side record of the dashboard configuration — selected lanes, selected tags, text search, card limit, and the four display toggles. Exactly one exists (or none, meaning the built-in default view applies). Independent of the board page's filter state; no MCP surface.
- **Lane configuration designations**: two new designations in the existing lane config file — the dashboard's default lanes (an ordered subset of configured lanes) and the quick-done target lane (one configured lane) — applied by restart like lanes themselves, with defined fallbacks when absent.
- **Card (existing)**: the kanban task the dashboard lists; the dashboard reads its title, lane, manual order, archived state, tags, notes, and linked people/companies/emails, and writes only through the existing done-move and add-note behaviors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With zero configuration ever saved, opening the Up Next page shows the correct top-5 next cards (right cards, right order, no archived cards) on the first load.
- **SC-002**: Marking a card done or adding a note to it takes exactly one interaction sequence on the dashboard itself — no navigation to the board or a detail page, and no confirmation step for quick done.
- **SC-003**: A view change saved on one device appears unchanged in a fresh browser session sharing no cookies or storage, with no manual steps beyond opening the page.
- **SC-004**: A card change made outside the page (board, another device, or an authorized MCP agent), and a saved-view change made on another device, are each reflected on an untouched open dashboard within 90 seconds.
- **SC-005**: Every filter combination of lanes, tags, and text yields exactly the cards satisfying all parts (tags matching any selected tag), truncated to the card limit only after filtering, and an empty result always presents a styled no-match message rather than a blank page.
- **SC-006**: 100% of the acceptance scenarios above pass against the seeded board with evidence per the project's definition of done.

## Assumptions

- The interview of 2026-08-25 (recorded in the product doc) resolved the feature's shape: flat list from config-designated default lanes, two separate settings popups with live preview / OK-save / discard-confirm, server-side single saved view, inline add-note, detail view as overlay, polling auto-refresh.
- The poll interval is at most 60 seconds (the criteria allow 90 seconds for a change to appear); the exact interval is a `/speckit-plan` decision within that bound.
- If the lane config lacks the new designations, the dashboard falls back to the first configured lane as the default lane and the last configured lane as the quick-done target, so existing deployments work before the config is updated.
- The filter popup's tag selector lists only tags attached to at least one card, alphabetically, matching the board filter bar; the card limit is a positive integer defaulting to 5 (input mechanics and any upper bound are `/speckit-plan` decisions).
- If the designated done lane is among the filter's selected lanes, a quick-done'd card simply stays visible per the filter in its new position — the dashboard never special-cases it.
- The latest-note snippet's truncation length and the exact popup layouts are acceptance-time details; where the server stores the settings (and its migration) is a `/speckit-plan` decision.
- Control, popup, and empty-state copy is illustrative; Tyler can adjust exact wording at acceptance.
- Out of scope, per the product doc: new or changed MCP tools; any change to the board page or its filter bar; dragging/reordering on the dashboard; archived cards or a show-archived toggle here; quick actions beyond done and add-note; ranking by anything other than lane + manual order; multiple named views or presets; live push updates; a dedicated mobile pass; lane-config management UI; toasts, animations, or loading skeletons.
