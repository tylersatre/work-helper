# Feature Specification: card-archive

**Feature Branch**: `027-card-archive`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "As Tyler, I want to archive a kanban card — hiding it instead of destroying it, with an unarchive path back — so that leftover import duplicates and dead cards stop having to be 'closed' into Done just to get them off the board, while still being recoverable if I need them." (see `docs/product/features/card-archive.md`)

## User Scenarios & Testing *(mandatory)*

"Card" means a task on the kanban board (the entity `create-task` introduced). The configured lanes are To Do, In Progress, Waiting, Done, per `create-task`. "An authorized agent" means an MCP client authenticated per the `mcp-authentik-auth` flow.

### User Story 1 - Archive a card from its detail view (Priority: P1)

Tyler opens a card he no longer needs active — an import duplicate, or a dead lead — and clicks an archive control in its detail view. There's no confirmation step, because archiving isn't destructive. The card disappears from the board immediately, from whichever lane it was in.

**Why this priority**: This is the feature's core action. Without it there is no way to get a card off the board short of deleting it or dumping it in Done.

**Independent Test**: Open a card's detail view, click the archive control, and verify the card no longer appears in any lane on the board.

**Acceptance Scenarios**:

1. **Given** a card "Follow up with Sam" in the To Do lane, not archived, **When** I open its detail view, **Then** I see an archive control near the title, alongside the existing lane pills and the delete control.
2. **Given** the detail view of "Follow up with Sam", **When** I click the archive control, **Then** the card is archived immediately with no confirmation step, and I'm taken back to the board, where "Follow up with Sam" no longer appears in any lane.
3. **Given** "Write proposal" is active in the In Progress lane, **When** I archive it from its detail view, **Then** it disappears from the board exactly as "Follow up with Sam" did — archiving works the same from any lane, not just Done.

---

### User Story 2 - Reveal and restore an archived card (Priority: P1)

Tyler realizes he wants an archived card back, or just wants to check what's been archived. He flips a "Show archived" toggle in the board's filter bar and archived cards reappear, dimmed and badged, right where they'd be if they were active. He opens one, clicks unarchive, and it's active again.

**Why this priority**: Archiving is only "hiding, not destroying" if there's a reliable way back — this is the other half of the feature's core promise and is what makes it more than a one-way delete.

**Independent Test**: With an archived card, turn on the "Show archived" toggle, verify it reappears dimmed and badged in its lane, open its detail view, click unarchive, and verify it becomes an active card at the bottom of its original lane.

**Acceptance Scenarios**:

1. **Given** "Follow up with Sam" is archived, **When** I turn on the "Show archived" toggle in the filter bar, **Then** "Follow up with Sam" reappears in the To Do lane, rendered dimmed with an "Archived" badge, in its normal position among the lane's other cards.
2. **Given** the "Show archived" toggle is on and "Follow up with Sam" is shown archived in To Do, **When** I open its detail view, **Then** I see an unarchive control in place of the archive control, and its notes and its links to people, companies, and email conversations are unchanged from before archiving.
3. **Given** "Follow up with Sam" is archived, **When** I click the unarchive control, **Then** the card becomes active again immediately, appears at the bottom of the To Do lane (its original lane) even with the "Show archived" toggle off, and its detail view shows the archive control again.

---

### User Story 3 - Archived cards respect the board's search and tag filters (Priority: P2)

With "Show archived" on, Tyler's existing text search and tag filter keep working exactly as they do for active cards — an archived card only shows up when it actually matches what he typed.

**Why this priority**: Without this, turning on "Show archived" would dump every archived card onto the board with no way to narrow them down, undermining `board-search-filter`'s value the moment archived cards are visible.

**Independent Test**: With the "Show archived" toggle on and two archived cards where only one matches a search term, verify only the matching one remains visible.

**Acceptance Scenarios**:

1. **Given** the "Show archived" toggle is on, and archived cards "Follow up with Sam" (title contains "Sam") and "Draft goals" (title does not) both exist, **When** I search "sam" in the board-search-filter's search input, **Then** "Follow up with Sam" still appears (dimmed, badged) and "Draft goals" does not — the text filter applies to archived cards exactly as it does to active ones.

---

### User Story 4 - Agents can archive and unarchive cards through MCP (Priority: P2)

An agent working through the work-helper MCP can archive a stale card and later unarchive it, and can ask the board listing to include or exclude archived cards, matching what Tyler can do in the web UI.

**Why this priority**: Agents are first-class consumers of the board and the `task-archive` stub already decided agents may archive (though not delete); without this, archiving would be a UI-only feature that agents can't clean up after or query around.

**Independent Test**: Call the archive-card MCP tool on an active card, verify it's excluded from the default `list-board` response and included when `list-board` is called with include-archived, then call unarchive-card and verify it's active again in both the default response and the web UI.

**Acceptance Scenarios**:

1. **Given** "Follow up with Sam" is archived, **When** an authorized agent calls the `list-board` MCP tool without an include-archived argument, then calls it again with include-archived, **Then** the first response does not include "Follow up with Sam" in any lane, and the second includes it in its lane, flagged as archived.
2. **Given** "Draft Q3 goals" is active in To Do, **When** an authorized agent calls the archive-card MCP tool for it, then the unarchive-card MCP tool for it, **Then** after archiving it disappears from the board with the toggle off and from `list-board`'s default response, and after unarchiving it reappears in To Do at the bottom, active, in both the web UI and `list-board`'s default response.

---

### User Story 5 - The "Show archived" toggle persists (Priority: P3)

Tyler turns on "Show archived" to track down something he archived, then reloads the page — the toggle stays on and archived cards stay visible, so he doesn't have to re-enable it mid-task.

**Why this priority**: A nice-to-have consistency with `board-search-filter`'s existing persistence; the feature is fully usable without it, just mildly annoying on a reload.

**Independent Test**: Turn on the "Show archived" toggle, reload the page, and verify the toggle is still on and archived cards are still shown.

**Acceptance Scenarios**:

1. **Given** the "Show archived" toggle is on, **When** I reload the page, **Then** the toggle is still on and archived cards are still shown — the toggle persists like `board-search-filter`'s filter.

---

### Edge Cases

- Archiving a card that's already archived (e.g. a stale detail view left open in another tab, or a race with an agent) must not error — it stays archived.
- Unarchiving a card that's already active (same stale-tab/race scenario) must not error — it stays active.
- With the "Show archived" toggle off, an archived card is never shown, even if it would otherwise match an active search or tag filter — the toggle gates visibility before search/tag filtering is applied.
- Turning on "Show archived" when no cards are archived changes nothing visible — no empty-state message specific to archived cards is required beyond the board's existing "no cards match" handling.
- Archiving or unarchiving a card does not change its lane, its manual position relative to other active cards (until unarchive appends it at the bottom), its notes, or any of its links.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The card detail view MUST show an archive control near the title, alongside the existing lane pills and delete control, whenever the card is not archived.
- **FR-002**: Clicking the archive control MUST archive the card immediately, with no confirmation step, and MUST navigate the user back to the kanban board.
- **FR-003**: Archiving MUST behave identically regardless of which lane the card is currently in.
- **FR-004**: By default, the kanban board MUST NOT display archived cards in any lane.
- **FR-005**: The board's filter bar MUST provide a "Show archived" toggle, off by default.
- **FR-006**: When the "Show archived" toggle is on, archived cards MUST appear in their own lane, in their normal manual-order position among that lane's other cards, rendered visually dimmed with an "Archived" badge.
- **FR-007**: The detail view of an archived card MUST show an unarchive control in place of the archive control.
- **FR-008**: Archiving and unarchiving MUST NOT alter a card's notes or its links to people, companies, or email conversations.
- **FR-009**: Clicking the unarchive control MUST restore the card to active state immediately, MUST place it at the bottom of its original lane, and MUST make it visible on the board even with the "Show archived" toggle off.
- **FR-010**: After unarchiving, the card's detail view MUST show the archive control again.
- **FR-011**: When the "Show archived" toggle is on, the board's existing text search and tag filter (`board-search-filter`) MUST apply to archived cards using the same matching rules as active cards.
- **FR-012**: With the "Show archived" toggle off, an archived card MUST remain hidden regardless of whether it would match the active text search or tag filter.
- **FR-013**: The `list-board` MCP tool MUST accept an optional include-archived argument. Without it, the response MUST exclude archived cards, matching the board's default view. With it, the response MUST include archived cards, each flagged as archived, grouped under their lane.
- **FR-014**: The system MUST expose an archive-card MCP tool and an unarchive-card MCP tool that perform the same actions, with the same effects, as the web UI's archive and unarchive controls.
- **FR-015**: The "Show archived" toggle state MUST persist across a page reload.
- **FR-016**: The system MUST NOT provide bulk archive or unarchive of multiple cards at once.
- **FR-017**: The system MUST NOT provide any archive or unarchive affordance on the card face or the board view directly — the controls exist only in the card detail view.
- **FR-018**: The system MUST NOT auto-archive cards under any condition (e.g. a schedule, or time spent in a lane) — archiving MUST always result from an explicit action by a human or an agent.
- **FR-019**: `delete-card` MUST be unaffected by this feature — deletion remains permanent, UI-only, and unavailable to agents; archiving and deleting coexist as separate, independent actions.

### Key Entities

- **Card**: A task on the kanban board (the entity `create-task` introduced), currently in one of the configured lanes (To Do, In Progress, Waiting, Done). Gains an archived/active state that is independent of its lane, its manual position, its notes, and its links to people, companies, and email conversations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can archive a card from its detail view in under 5 seconds, with no confirmation step.
- **SC-002**: 100% of archived cards disappear from every lane on the board by default, and reappear in their originating lane, in their original relative position, when "Show archived" is on.
- **SC-003**: 100% of unarchived cards land at the bottom of their original lane, active, with notes and links exactly matching their pre-archive state.
- **SC-004**: In every tested scenario, the board's text search and tag filter show exactly the expected set of archived and active cards when "Show archived" is on — no extra card shown, no matching card hidden.
- **SC-005**: An agent calling `list-board` without include-archived never receives an archived card; calling it with include-archived always receives every archived card, correctly flagged, in 100% of cases.
- **SC-006**: The "Show archived" toggle's state survives a page reload in 100% of cases.

## Assumptions

- "Near the title, alongside the existing lane pills and the delete control" refers to the card detail view's header area, consistent with where `delete-card`'s and `move-task-from-detail-view`'s controls live.
- "Original position" for a reappearing archived card means the manual-order position it held within its lane at the moment it was archived — archiving does not itself change a card's position, only its visibility.
- Archived state is a boolean-style flag on the card (independent of lane and manual order), not a separate archive log or history; this spec makes no requirement about tracking when or by whom a card was archived.
- Where the "Show archived" toggle's state is persisted (URL, browser storage, server-side preference) is a `/speckit-plan` decision; product-level it only has to survive a page reload, matching `board-search-filter`'s persistence behavior.
- No additional authorization/permission check is needed beyond the existing single-user web access and the `mcp-authentik-auth` flow for agents, since work-helper is a self-hosted, single-user personal CRM.
- Archive and unarchive are synchronous, immediately-reflected actions with no pending/undo window beyond simply archiving or unarchiving again.
- Copy for the archive/unarchive controls and the "Archived" badge is illustrative; Tyler may adjust exact wording at acceptance.

## Out of Scope

- Any change to `delete-card` — deletion remains permanent and UI-only, and archive and delete coexist as separate actions; agents still cannot delete.
- Bulk archive or unarchive of multiple cards at once.
- Archiving or unarchiving from the card face or the board view directly — controls live only in the detail view; a quick action on the card face is a future enhancement.
- A dedicated "Archived" page or view — archived cards are reached only via the board's "Show archived" toggle, not a separate page.
- Auto-archiving on any trigger (schedule, time-in-lane, etc.) — archiving is always a deliberate action, by a human or an agent.
- Any visual indicator on card faces beyond the archived dimmed/badge state (linked-people/notes/tag chips are the separate `kanban-card-indicators` stub).
- Changes to `board-search-filter`'s tag selector or its own persistence mechanism — the "Show archived" toggle is a new, independent control alongside it.

## Dependencies

- `create-task` (cards and the four configured lanes), already landed on `main`.
- `delete-card` (the detail-view control placement convention the archive control follows; the coexisting, unaffected delete action).
- `board-search-filter` (the filter bar the "Show archived" toggle is added to, its text/tag filtering rules, and its reload-persistence pattern).
- The existing `list-board` MCP tool and the `mcp-authentik-auth` flow that authorizes agents calling it and the new archive-card/unarchive-card tools.
- The `task-archive` stub's prior decision that agents may archive and unarchive cards but still cannot delete them.
