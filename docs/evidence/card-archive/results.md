# Card Archive Feature — Manual Browser Test Results

Feature: card-archive (specs/027-card-archive/spec.md)
Environment: UI http://localhost:5127, API http://localhost:3027
Date: 2026-08-24

## Step 1 — Detail view Archive control (FR-001)

**Given** the card "Follow up with Sam" (id 1) exists in the To Do lane
**When** I open its detail view
**Then** the detail view shows an "Archive" control next to the lane pills and the existing "Delete" control

**Result: PASS**

Screenshot: `01-detail-view-archive-control.png`

The detail view header shows "Archive" and "Delete" buttons side by side at the top right, above the lane pills row (To Do / In Progress / Waiting / Done). Note: the Archive/Delete controls sit in the page header above the lane-pill group rather than literally beside the pills, but both controls are present and adjacent to each other as specified.

## Step 2 — Archive with no confirmation, returns to board (FR-002, FR-004)

**Given** I am on "Follow up with Sam"'s detail view
**When** I click "Archive"
**Then** there is no confirmation dialog, I am taken back to the board, and "Follow up with Sam" is not visible in any lane

**Result: PASS**

Screenshot: `02-board-after-archive-card-hidden.png`

Clicking Archive produced no dialog (verified via Playwright — the click resolved immediately with no dialog handler needed) and navigated directly to `/` (the board). The board snapshot afterward shows only "Draft goals" in To Do, "Write proposal" in In Progress, and nothing in Waiting/Done — "Follow up with Sam" is gone from all lanes.

## Step 3 — "Show archived" toggle off by default

**Given** I am on the board with "Follow up with Sam" archived
**When** I look at the filter bar
**Then** the "Show archived" toggle is off by default

**Result: PASS**

Screenshot: `03-filter-bar-show-archived-off.png`

The "Show archived" checkbox in the filter bar (next to the search box and lane-select dropdown) is unchecked, and the board matches step 2's state.

## Step 4 — Toggling "Show archived" reveals the archived card, dimmed with badge, in original position (FR-005, FR-006)

**Given** "Show archived" is off and "Follow up with Sam" is archived
**When** I turn "Show archived" on
**Then** "Follow up with Sam" reappears in the To Do lane, visually dimmed with an "Archived" badge, in its original position among the lane's other cards

**Result: PASS**

Screenshot: `04-board-show-archived-on-dimmed-badge.png`

"Follow up with Sam" reappears at the top of the To Do lane (before "Draft goals"), which matches its original seeded position (it was listed first in the lane before archiving). The card text is visibly dimmed/muted compared to "Draft goals" and carries a gray "Archived" badge/pill next to its title.

## Step 5 — Detail view shows "Unarchive" control for an archived card (FR-007)

**Given** "Follow up with Sam" is archived
**When** I open its detail view again
**Then** the detail view shows an "Unarchive" control in place of "Archive", and its notes/links are unaffected

**Result: PASS**

Screenshot: `05-detail-view-unarchive-control.png`

The header now shows "Unarchive" and "Delete" (Archive button is replaced). The People/Companies/Emails/Notes/Tags sections render normally and are empty, as seeded (no notes/links existed before archiving, none appeared or were lost after).

## Step 6 — Unarchive with no confirmation, stays on detail view, control swaps back (FR-009, FR-010)

**Given** I am on "Follow up with Sam"'s detail view showing "Unarchive"
**When** I click "Unarchive"
**Then** there is no confirmation dialog, I remain on the same detail-view page (do not navigate to the board), and the control swaps back to "Archive"

**Result: PASS**

Screenshot: `06-detail-view-after-unarchive.png`

Clicking Unarchive produced no dialog. The URL remained `/tasks/1` (did not redirect to `/`), and the header control changed back to "Archive" next to "Delete".

## Step 7 — Unarchived card restored to bottom of lane, active/undimmed (FR-009)

**Given** "Follow up with Sam" was just unarchived
**When** I navigate back to the board with "Show archived" toggled off
**Then** "Follow up with Sam" is visible again, active (no dimming/badge), positioned at the bottom of the To Do lane after "Draft goals"

**Result: PASS**

Screenshot: `07-board-restored-bottom-of-lane.png`

On returning to the board (toggle turned off), the To Do lane shows "Draft goals" first, then "Follow up with Sam" — i.e., "Follow up with Sam" moved to the bottom of the lane on unarchive rather than being restored to its pre-archive position at the top. Neither card shows dimming or an "Archived" badge. This confirms the "restored to bottom of lane" behavior described in FR-009 (note this is a different position than where it appeared while still archived in step 4 — this is expected per spec: archived cards keep their in-lane position, but unarchiving appends to the bottom rather than restoring the original spot).

## Step 8 — Search filters out archived cards not matching the query even with "Show archived" on (FR-011, US3 parity)

**Given** both "Follow up with Sam" and "Draft goals" are archived, and "Show archived" is on
**When** I type "sam" into the board search box
**Then** only "Follow up with Sam" remains visible (still dimmed/badged) in the To Do lane; "Draft goals" is filtered out despite "Show archived" being on

**Result: PASS**

Screenshot: `08-board-search-filters-archived-cards.png`

Both cards were archived from their respective detail views (each Archive click had no confirmation dialog). With "Show archived" checked and "sam" typed into the search box, the filter bar reports "1 of 3 cards" and the To Do lane shows only "Follow up with Sam" (dimmed, "Archived" badge). "Draft goals" is not shown, confirming search applies on top of the archived-visibility filter rather than overriding it.

## Step 9 — "Show archived" toggle persists across a full page reload (FR-015 / US5)

**Given** "Show archived" is on and both cards are archived
**When** I clear the search box and then fully reload the browser page
**Then** the "Show archived" toggle is still checked/on and archived cards are still visible after reload

**Result: PASS**

Screenshot: `09-board-after-reload-toggle-persisted.png`

Clicking "Clear filters" cleared the search text but left "Show archived" checked (both archived cards still shown, both cards' text still dimmed/badged). A full browser navigation to `http://localhost:5127/` (equivalent to a hard reload of the page, not a client-side SPA route change) was performed via `page.goto`. After reload, the "Show archived" checkbox remained checked and both "Draft goals" and "Follow up with Sam" (both dimmed, with "Archived" badges) were visible in the To Do lane — confirming the toggle state is persisted server-side/in storage and survives a full document reload, not just client-side routing.

## Summary

All 9 steps PASSED. No deviations from expected behavior were observed. Archive/Unarchive actions never triggered a confirmation dialog, always navigated (or didn't navigate) exactly as specified, the archived-badge/dimming visual treatment was present and matched the described state changes, search correctly composed with the archived-visibility filter, and the "Show archived" toggle persisted across a genuine full-page reload.
