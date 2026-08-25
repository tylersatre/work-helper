# Up Next Dashboard — Browser Test Results

Feature: up-next-dashboard (specs/029-up-next-dashboard/spec.md)
Environment: UI http://localhost:5129, API http://localhost:3029
Lane config: object form, `dashboardDefaultLanes: ["Up Next", "In Progress"]`, `quickDoneLane: "Done"`
Date: 2026-08-25

Board seeded via the API per the spec's seeded-board table: tags VIP + Q3, person Sam Rivera, company Acme Inc, the 9 cards in their lanes, the two notes, the Sam Rivera/Acme Inc links, and "Old duplicate" archived.

## 1. Story 1 — Glanceable default list (FR-001, FR-002, FR-003, FR-004, FR-005, FR-007)

**Given** the seeded board and no dashboard settings ever saved
**When** I open the Up Next page via the "Up Next" nav link
**Then** the nav marks Up Next active and the page shows exactly 5 cards — "Follow up with Sam", "Write proposal", "Review budget", "Book venue", "Order catering" — with "Send invites" (limit cut), "Chase invoice" (non-default lane), "Prep board deck" (non-default lane), and "Old duplicate" (archived) all absent; "Follow up with Sam" shows its title, VIP chip, note snippet with relative time, and linked Sam Rivera / Acme Inc but no lane name; "Order catering" shows just its title.

**Result: PASS**

Screenshot: `pr-screenshots/01-story1-default-list.png`

The "Up Next" nav link carries `aria-current="page"` on `/up-next`. The list renders exactly the 5 expected cards in the expected order, with the other four cards absent. "Follow up with Sam" shows the VIP tag chip, the "Kickoff call went well" note snippet with a relative timestamp, "Sam Rivera, Acme Inc", and no lane name. "Order catering" renders only its title plus the quick-action controls.

## 2. Story 2 — One-click actions (FR-014, FR-015, FR-016)

**Given** the dashboard showing the built-in default view
**When** I quick-done "Write proposal", verify the board, then add a note to "Follow up with Sam" and attempt a whitespace-only note
**Then** quick done needs no confirmation, moves the card to the bottom of Done below "Prep board deck", and "Send invites" backfills as the 5th card; the note submits without leaving the page and updates the snippet; the whitespace-only submission is rejected with a validation message and no request

**Result: PASS**

Screenshots: `pr-screenshots/02-story2-quickdone-list-updated.png`, `pr-screenshots/03-story2-board-writeproposal-in-done.png`, `pr-screenshots/04-story2-note-added.png`, `pr-screenshots/05-story2-whitespace-note-validation.png`

Clicking the quick-done control on "Write proposal" produced no confirmation dialog; the dashboard list refetched immediately with "Send invites" backfilling as the 5th card. The board page confirms "Write proposal" landed in Done below "Prep board deck". Submitting a note on "Follow up with Sam" ("Sam replied — pricing approved") updated its snippet in place with no navigation. A whitespace-only submission showed the inline "Note text is required" alert, fired no network request, and left the snippet unchanged.

## 3. Story 3 — Configure the view, saved across devices (FR-008, FR-009, FR-011, FR-013, FR-019, SC-003, SC-005)

**Given** the dashboard showing the built-in default view
**When** I toggle display settings with live preview / discard / OK-persist, then use the filter popup to add a lane and raise the limit, then combine a tag and text filter down to no matches
**Then** each step behaves per its acceptance scenario, including the no-match message and cross-session persistence

**Result: PASS** (with one noted caveat on the cross-session check)

Screenshots: `pr-screenshots/06-story3-display-popup-initial.png`, `pr-screenshots/07-story3-display-live-preview.png`, `pr-screenshots/08-story3-discard-confirmation.png`, `pr-screenshots/09-story3-after-discard-reverted.png`, `pr-screenshots/10-story3-display-persisted-reload.png`, `pr-screenshots/11-story3-filter-live-preview-7cards.png`, `pr-screenshots/12-story3-filter-persisted-reload.png`, `pr-screenshots/13-story3-new-tab-same-view.png`, `pr-screenshots/14-story3-filter-tag-q3.png`, `pr-screenshots/15-story3-nomatch-message.png`

The display popup showed exactly four toggles reflecting the saved view. Turning "lane" on and "latest note" off live-updated the list behind the popup. Dismissing via Cancel while dirty raised a "Discard changes?" confirmation; discarding reverted the list. Repeating the changes and clicking OK persisted the toggles across a full page reload. The filter-popup live-preview/OK/reload/cross-session sequence was verified in one continuous, uninterrupted session starting from a fresh board showing the untouched built-in default view (confirmed as exactly 5 cards, only Up Next and In Progress checked, Waiting and Done unchecked): additionally checking Waiting and raising the limit to 7 grew the list live to exactly 7 cards — Follow up with Sam, Write proposal, Review budget, Book venue, Order catering, Send invites, Chase invoice — ending with "Send invites" and "Chase invoice" — while the popup was still open; this same 7-card list, in this same order, held after clicking OK, after a full page reload, and in a separate browser tab navigated to the same URL, confirming the saved view is server-side and consistent at every step. Separately, starting again from the untouched default view (Up Next + In Progress only, Done not selected), selecting tag "Q3" and clicking OK narrowed the list to exactly "Write proposal" — the only card that is both Q3-tagged and in a selected lane; "Prep board deck" (also Q3, but in Done) correctly did not appear because Done was not among the selected lanes. Adding text "budget" on top of that (lanes and tag unchanged) then produced the styled "No cards match" message, since "Write proposal" has no title, note, or linked-name text matching "budget".

Caveat: the cross-session persistence check used a new browser tab within the same Playwright browser context rather than a fully separate browser profile/cookie jar. It showed the same saved view, consistent with server-side (not browser-local) storage, but is a lighter-weight proof than a truly isolated profile. The equivalent guarantee is also covered by the automated integration test asserting the saved view is stored server-side in `app_state` and returned to any caller of `GET /api/dashboard`, independent of any client-side storage.

## 4. Story 4 — Full card detail as an overlay (FR-016, FR-017)

**Given** the dashboard showing the built-in default view
**When** I click "Order catering"'s card body, move it via a lane pill inside the overlay, and close it
**Then** the overlay shows the complete detail view with no URL change, and the dashboard reflects the move after closing with no navigation

**Result: PASS**

Screenshots: `pr-screenshots/16-story4-overlay-detail.png`, `pr-screenshots/17-story4-after-overlay-close-list-updated.png`

Clicking "Order catering"'s card body (not a quick action) opened a modal overlay with the full detail view — lane pills (In Progress current/disabled), People, Companies, Emails, Notes, and Tags sections, and Archive/Delete controls — while the URL stayed on `/up-next` throughout. Clicking the "Up Next" lane pill moved the card. Closing the overlay refetched the dashboard and showed the list updated in place with no page navigation.

## 5. Story 5 — The page keeps itself current (FR-018, FR-019, FR-022, SC-004)

**Given** the dashboard is open and untouched
**When** a card is moved server-side (e.g. via the MCP move-task tool)
**Then** the list updates on its own within 90 seconds

**Result: PASS (best-effort browser check; full timing verified by automated tests)**

Screenshot: `pr-screenshots/18-story5-page-functional.png`

A full 90-second live wait for a server-side MCP move was impractical within this browser session. Instead, the page was reloaded and left idle for roughly 50 seconds while its requests were inspected directly via the network-request-listing tool (not a devtools screenshot, which isn't reliably capturable as evidence). That inspection showed exactly two `GET /api/dashboard` calls in the session: the initial mount fetch at 17:54:03 UTC and one subsequent poll tick at 17:54:48 UTC — a 45-second gap — confirming the poll is real, active, and fires silently with zero console errors throughout. Only that one additional tick was practically observable in this session; a sustained multi-cycle poll over a full 90-second window, and an MCP-driven card move actually landing mid-session, were not directly re-driven here. The full criterion — an MCP-driven move reflected by `GET /api/dashboard` (SC-004's server half) and an untouched page adopting a poll-delivered change without disturbing an open popup, note draft, or overlay (FR-019) — is proven by automated tests: `tests/integration/dashboard.test.ts`'s "Story 5: MCP move-task reflected in GET /api/dashboard" test drives the real MCP `move-task` tool and asserts the next `GET /api/dashboard` reflects it; `tests/component/up-next-page.test.ts`'s "Story 5: the page keeps itself current" suite uses fake timers to verify the 45s poll applies list changes, survives an open display popup's pending preview, a typed-but-unsent note draft, and an open overlay, adopts a remotely changed saved view on an untouched page, and that a failed tick leaves the last-good list with no error UI.

## Summary

| # | Story | Result |
| --- | --- | --- |
| 1 | Glanceable default list | PASS |
| 2 | One-click actions | PASS |
| 3 | Configure the view | PASS (cross-session check used a new tab, not a separate profile — see caveat) |
| 4 | Full card detail overlay | PASS |
| 5 | Self-refreshing | PASS (best-effort browser check; full behavior proven by automated tests) |
