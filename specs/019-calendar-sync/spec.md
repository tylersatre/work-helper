# Feature Specification: Calendar Sync

**Feature Branch**: `019-calendar-sync`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: `docs/product/features/calendar-sync.md` — pull events from Tyler's Outlook calendar into work-helper's own store, synced on demand from the Sync page or by an agent over any chosen date range, with full event details, recurring meetings stored as linked occurrences, and organizers/attendees connected through shared email-address records to tracked people, so agents can answer "when did I last meet Sam?" and "who's in my meetings this week?" through the work-helper MCP.

## Clarifications

### Session 2026-08-12

- Q: When a synced event's attendee list includes resource mailboxes like conference rooms or equipment, how should work-helper handle them? → A: Store them as participants with a distinct "resource" role; addresses seen only as resources are excluded from unlinked-address discovery.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sync calendar events on demand from the Sync page (Priority: P1)

Tyler opens the Sync page, which now has a calendar sync section alongside the existing email sync section. He picks a date range (prefilled to a rolling window from 30 days before today to 30 days after today), clicks Sync, watches the run's progress, and sees the result — how many events were newly stored and how many updated — recorded in a calendar run history that persists forever.

**Why this priority**: Without a working sync there are no stored events, and nothing else in this feature can function. This is the core ingestion path and the minimum viable slice.

**Independent Test**: With a connected mailbox and a calendar containing known events, sync a range from the Sync page and verify the reported counts, the run history entry, and that only in-range events were stored.

**Acceptance Scenarios**:

1. **Given** the mailbox is connected and no calendar sync has ever run, **When** Tyler opens the Sync page, **Then** alongside the existing email sync section it shows a calendar sync section with start and end date pickers — start prefilled to 30 days before today, end prefilled to 30 days after today — a Sync button, and a styled empty-state message (e.g. "No syncs yet") where calendar run history would be, with the email section's own prefill and history unchanged.
2. **Given** the default calendar contains "Pricing review" on 2026-08-14 and "Team offsite" on 2026-08-20, plus "Spring planning" on 2026-06-02, with no calendar sync yet, **When** Tyler sets the range 2026-08-01 to 2026-08-31 and clicks Sync, **Then** the Sync button is disabled and an in-progress indicator shows while the run executes, and when it finishes the page reports 2 new events and the calendar run history lists the run with when it ran, the range, source "web", a success status, and counts 2 new / 0 updated — still listed after a page reload — and an authorized agent listing events for 2026-08-01 to 2026-08-31 gets exactly "Pricing review" and "Team offsite" in chronological order by start time, with "Spring planning" (outside the range) absent.
3. **Given** an email or calendar sync is currently running, **When** Tyler views the Sync page or an agent calls either sync tool, **Then** both web Sync buttons are disabled and the colliding sync call of either type is rejected with an "already running" error — one sync at a time globally.

---

### User Story 2 - Agents read complete event details (Priority: P1)

An authorized agent fetches a synced event and gets the full picture: subject, start and end times, all-day and cancelled flags, location, body text, organizer and attendees with display names, roles, and response statuses, the online-meeting join link, the category, and a link that opens the event in Outlook.

**Why this priority**: The stored events are only as useful as the detail captured. Full-detail capture is what lets agents answer real questions about meetings, and it must be right from the first synced event.

**Independent Test**: Seed one event with every detail populated, sync it, and fetch it through the MCP read tools, verifying every field round-trips.

**Acceptance Scenarios**:

1. **Given** an unsynced event "Pricing review" on 2026-08-14 10:00–10:30 in the default calendar, organized by "Sam Rivera" \<sam.rivera@example.com\>, with required attendee "Tyler Satre" \<tyler@example.com\> (response accepted) and optional attendee ana.alvarez@example.com (no response), location "Conference Room B", a Teams online-meeting join link, Outlook category "Orange category", and body "Agenda: walk through the updated pricing sheet", **When** it is synced from the Sync page and an authorized agent fetches it, **Then** the event shows its subject, start 2026-08-14 10:00 and end 10:30, that it is not all-day and not cancelled, the location, the body text, sam.rivera@example.com as organizer with display name "Sam Rivera", tyler@example.com as a required attendee with display name "Tyler Satre" and response accepted, ana.alvarez@example.com as an optional attendee with no response, the online-meeting join link, category "Orange category", and a link that opens the event in Outlook.

---

### User Story 3 - Events connect to tracked people (Priority: P2)

Organizer and attendee email addresses on synced events flow through the same shared email-address records used by synced mail, so events link to the people Tyler tracks — case-insensitively — and an agent can ask for a person's events. Addresses that match no person are stored unlinked, and linking one later (by adding the address to a person exactly as today) immediately connects the person to already-synced events.

**Why this priority**: This is the CRM payoff — "who I meet with" joined to "who I email" — but it depends on US1/US2 having stored events to link.

**Independent Test**: Sync an event whose organizer address belongs to an existing person and whose attendee address belongs to no one; verify the organizer link, the unlinked attendee, and that adding the attendee address to a person retroactively connects the event.

**Acceptance Scenarios**:

1. **Given** a person "Sam Rivera" exists with email address sam.rivera@example.com, no person has ana.alvarez@example.com, and the synced event "Pricing review" was organized by "Sam.Rivera@example.com" (different case) with optional attendee ana.alvarez@example.com, **When** an authorized agent fetches the event and asks for Sam Rivera's events, **Then** the event's organizer address is shown as linked to person "Sam Rivera" (case-insensitive match), the person-events query returns "Pricing review" identifying sam.rivera@example.com with role organizer, and ana.alvarez@example.com appears on the event with role optional attendee and no linked person.
2. **Given** the synced event above, with ana.alvarez@example.com stored but linked to no person, and a person "Ana Alvarez" who does not have that address, **When** Tyler edits Ana Alvarez on the People page, adds the email address ana.alvarez@example.com, and saves, **Then** the address is added to her record exactly as adding any address works today, and an authorized agent asking for Ana Alvarez's events now gets "Pricing review", with her address tagged as an optional attendee.

---

### User Story 4 - Recurring meetings stored as linked occurrences (Priority: P2)

A recurring series syncs as individual occurrences — each with its own date and details — that all carry a shared series identifier, so future features can group them while today each occurrence stands alone.

**Why this priority**: Recurring meetings dominate real calendars; without per-occurrence storage, questions like "when did I last meet Sam?" break. The series identifier is a small addition that must exist now to avoid rework later.

**Independent Test**: Seed a weekly series and a one-off event, sync a month, and verify each occurrence is its own event, the occurrence count is right, occurrences share a series identifier, and the one-off has none.

**Acceptance Scenarios**:

1. **Given** the default calendar contains a weekly series "Team standup" occurring every Monday 09:00–09:15 and a one-off event "Pricing review" on 2026-08-14, with no calendar sync yet, **When** Tyler syncs the range 2026-08-01 to 2026-08-31, **Then** the run reports 6 new events — the five Monday occurrences (2026-08-03, 2026-08-10, 2026-08-17, 2026-08-24, 2026-08-31) each stored as its own event with its own date, plus "Pricing review" — and an authorized agent fetching any two standup occurrences sees the same series identifier on both, while "Pricing review" has none.

---

### User Story 5 - Re-sync refreshes events and preserves history (Priority: P2)

Syncing a range that was synced before refreshes stored events to their current state — moved times, changed locations, updated responses — without creating duplicates, and events that were cancelled or removed from the calendar stay stored, marked cancelled. Synced events are never deleted by calendar changes.

**Why this priority**: Calendars churn constantly; without refresh semantics the store rots within days. Preservation of cancelled events is what makes the store a trustworthy history.

**Independent Test**: Sync an event, change it (and cancel another) in the calendar, re-sync the same range, and verify counts, updated fields, the cancelled flag, and the absence of duplicates.

**Acceptance Scenarios**:

1. **Given** the synced event "Pricing review" stored with start 2026-08-14 10:00, location "Conference Room B", and no response from ana.alvarez@example.com, and in Outlook the event has since moved to 2026-08-15 14:00–14:30 in "Room 4" with Ana's response now accepted, **When** Tyler syncs an overlapping range from the Sync page, **Then** the run reports 0 new / 1 updated, and the stored event shows the new start and end, location "Room 4", and Ana's response accepted, with no duplicate — listing events for the range returns exactly one "Pricing review".
2. **Given** the synced occurrence "Team standup" on 2026-08-17, which has since been cancelled in Outlook and no longer appears on the calendar, **When** Tyler syncs the range 2026-08-01 to 2026-08-31, **Then** the 2026-08-17 occurrence is still stored and now marked cancelled — listing events for the range still returns it, flagged cancelled, while the other occurrences are unchanged — synced events are never removed by calendar changes.

---

### User Story 6 - Agents trigger calendar sync via MCP (Priority: P2)

An authorized agent runs a calendar sync itself by calling the sync tool with an explicit date range. Valid calls sync exactly as a web run does and land in the same run history marked with source "MCP"; calls with a missing or inverted range fail validation with nothing synced and no history entry.

**Why this priority**: Agent-triggered sync is what lets agents self-serve fresh data, but it reuses the sync engine from US1, so it lands after the web path works.

**Independent Test**: Call the sync tool with a valid range, with no range, and with start after end; verify the successful run's history entry and the two validation failures' lack of side effects.

**Acceptance Scenarios**:

1. **Given** an authorized agent, **When** it calls the calendar sync tool with the range 2026-08-01 to 2026-08-31, then calls it with no date range, and then with start 2026-08-20 and end 2026-08-05, **Then** the first call syncs exactly as a web run does and appears in the calendar run history with source "MCP" and its counts, while the second and third calls each fail with a validation error (a start and end date are required; start must not be after end) with nothing synced and no history entry added.

---

### User Story 7 - Unlinked-address discovery spans mail and calendar (Priority: P3)

The existing unlinked-address discovery now counts calendar participation too: addresses seen only as event attendees join the pool, every row shows both a message count and an event count, ordering stays by message count descending, and linked addresses stay excluded.

**Why this priority**: A discovery-quality improvement that rounds out the feature; valuable, but nothing else depends on it.

**Independent Test**: Seed mail and events with overlapping and disjoint address sets, one linked address among them, and verify the tool's rows, both counts, ordering, and the linked address's absence.

**Acceptance Scenarios**:

1. **Given** synced mail and calendar where jordan.smith@example.com appears in 2 messages and attends 3 events (display name "Jordan Smith"), news@example.com appears in 1 message and no events, morgan.lee@example.com attends 1 event and appears in no messages, none of them linked to a person, and sam.rivera@example.com (linked to person "Sam Rivera") also attends events, **When** an authorized agent calls the unlinked-addresses tool, **Then** it lists jordan.smith@example.com (2 messages, 3 events), then news@example.com (1 message, 0 events), then morgan.lee@example.com (0 messages, 1 event) — still ordered by message count descending, each row now showing both counts — with sam.rivera@example.com absent because it is linked.

---

### Edge Cases

- Sync attempted while the mailbox is disconnected: the run fails with the same "connect the mailbox on the Sync page" guidance email sync gives, and the failure is recorded in the calendar run history with its error text.
- A sync run fails partway (connection lost, provider error): the run is recorded in history with a failure status and error text, mirroring email sync's failure handling.
- All-day and multi-day events: stored with their all-day flag and full date span, and counted as in range whenever any part of their span overlaps the requested range — including events that start before the range or end after it.
- An event moved to a date outside the synced range since it was stored: it is no longer on the calendar within the range, so that run marks it cancelled; a later sync covering its new date refreshes it to current (not cancelled) state.
- Cancellation detection is bounded by the synced range: stored events whose dates fall outside the range are never touched by a run, so they cannot be spuriously marked cancelled.
- An attendee address with no display name anywhere: the address still stores, links case-insensitively, and appears in unlinked-address discovery without a display name.
- An event with no attendees (a solo appointment): syncs with organizer only.
- An event with resource attendees (a booked conference room, equipment): each resource is stored as a participant with the resource role; an address seen only as a resource never appears in unlinked-address discovery, but one that also appears as a person-style participant or in mail is listed normally.
- A single occurrence of a recurring series that was individually moved or modified: it syncs as its own occurrence with its actual (exceptional) details, still carrying the series identifier.
- Date-range endpoints are interpreted inclusively in the server-local timezone, matching email sync's convention.
- The same event appearing in overlapping syncs of different ranges: refreshed each time, never duplicated.

## Requirements *(mandatory)*

### Functional Requirements

**Sync page**

- **FR-001**: The Sync page MUST show a calendar sync section alongside the existing email sync section, containing start and end date pickers, a Sync button, and a calendar run history area, without changing the email section's prefill or history.
- **FR-002**: The calendar date pickers MUST prefill on every visit to a rolling window: start 30 days before today, end 30 days after today.
- **FR-003**: Before any calendar sync has run, the calendar history area MUST show a styled empty-state message.
- **FR-004**: Clicking Sync MUST run a calendar sync over the chosen inclusive range; while it runs the Sync button is disabled and an in-progress indicator shows; on completion the page reports the new and updated event counts.
- **FR-005**: Every finished calendar sync run (success or failure, web or agent) MUST be recorded in a calendar run history entry showing when it ran, the range, the source (web or MCP), the status, new/updated counts, and error text on failure — newest first, kept forever, and still present after a page reload.
- **FR-006**: Only one sync (email or calendar) may run at a time globally: while either runs, both web Sync buttons MUST be disabled, and a colliding sync tool call of either type MUST be rejected with an "already running" error.

**Sync behavior**

- **FR-007**: A calendar sync MUST pull events from the connected mailbox's default calendar whose time span overlaps any part of the requested range, endpoints inclusive, interpreted in the server-local timezone.
- **FR-008**: Each synced event MUST store: subject, start and end date-times, all-day flag, cancelled flag, location, body text, organizer (email address and display name), each attendee's email address, display name, role (required, optional, or resource — resource covering room and equipment mailboxes), and response status, the online-meeting join link, the category, and a link that opens the event in Outlook — any of which may be absent on the source event.
- **FR-009**: Recurring series MUST be stored as individual occurrences, each its own event with its own date and details, all carrying a shared series identifier; non-recurring events carry none.
- **FR-010**: Re-syncing MUST refresh already-stored events to their current calendar state without creating duplicates; a run reports an event as new when first stored and as updated when its stored details changed.
- **FR-011**: A stored event whose date falls inside the synced range and which is no longer on (or is marked cancelled in) the calendar MUST be marked cancelled and retained; synced events are never deleted by calendar changes, and stored events outside the synced range are untouched by that run.
- **FR-012**: All-day and multi-day events MUST sync with their all-day flag and full date span.
- **FR-013**: A failed sync run MUST be recorded in the calendar run history with a failure status and the error text; a disconnected mailbox MUST produce the same "connect the mailbox on the Sync page" guidance as email sync.
- **FR-014**: work-helper MUST never modify the Outlook calendar — no creating, editing, responding to, or cancelling events.

**People linking**

- **FR-015**: Organizer and attendee addresses MUST flow through the same shared email-address records as synced mail, matching people case-insensitively; addresses matching no person are stored unlinked, and no person is ever auto-created from an event.
- **FR-016**: Adding an email address to a person through any existing flow MUST immediately connect that person to already-synced events where the address appears, with no re-sync required.

**Agent (MCP) surface**

- **FR-017**: All calendar tools MUST require an authorized agent per the existing MCP authorization flow.
- **FR-018**: A calendar sync tool MUST accept an explicit start and end date and behave exactly as a web-triggered run, recorded with source "MCP"; a call missing either date, or with start after end, MUST fail with a validation error, sync nothing, and add no history entry.
- **FR-019**: A list-events tool MUST return the stored events in a given inclusive range in chronological order by start time, including cancelled events flagged as such.
- **FR-020**: A get-event tool MUST return a single stored event with the full detail set of FR-008, each participant address showing its linked person when one exists.
- **FR-021**: An events-for-person tool MUST return the events where any of the person's email addresses appears as organizer or attendee, identifying the matching address and its role, ordered newest-first by start time, including cancelled events flagged as such.
- **FR-022**: The unlinked-addresses tool MUST include addresses seen only as event participants, show each address's message count and event count, keep ordering by message count descending, continue excluding linked addresses, exclude addresses seen only in the resource role (conference rooms, equipment — not people), and consider display names seen in events as well as mail.

### Key Entities

- **Calendar event**: One stored occurrence from the default calendar — subject, start/end, all-day and cancelled flags, location, body, category, online-meeting join link, Outlook link, and an optional series identifier shared with sibling occurrences. Identity is stable across re-syncs so refreshes update rather than duplicate.
- **Event participant**: The connection between an event and an email address — the organizer, or an attendee with a required, optional, or resource role and a response status, plus the display name seen on the event. Resource participants (rooms, equipment) are stored like any other attendee but their addresses, when seen only as resources, are excluded from unlinked-address discovery.
- **Email address** *(existing, shared)*: The same records mail uses; an address may be linked to a person or unlinked, and one address record now accumulates both mail and calendar appearances.
- **Person** *(existing)*: Reached from events only through linked email addresses; never auto-created by sync.
- **Calendar sync run**: One history entry — when it ran, the requested range, source (web or MCP), status, new/updated counts, error text on failure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a connected mailbox, Tyler can complete his first calendar sync — open the Sync page, accept the prefilled range, click Sync, and see the reported counts — with no input beyond choosing the range, and the run's history entry survives a page reload.
- **SC-002**: 100% of the default calendar's events overlapping a synced range are retrievable by an authorized agent immediately after the run, each with every populated detail field intact.
- **SC-003**: Re-syncing any previously synced range produces zero duplicate events, and 100% of in-range calendar changes (moves, detail edits, response changes, cancellations) are reflected in the store after the run.
- **SC-004**: Once a person's email address is on their record, an authorized agent can answer "when did I last meet this person?" and "who's in my meetings this week?" with a single query each, with no manual event-to-person linking step ever performed.
- **SC-005**: Every sync run ever executed — web or agent, success or failure — is visible in the calendar run history with its source, range, status, and counts.
- **SC-006**: No stored event is ever lost to calendar-side changes: events cancelled or removed after sync remain retrievable, flagged cancelled.

## Assumptions

- The mailbox connection from web-mailbox-signin exists and works; calendar sync reuses that connection and reads only the connected mailbox's default calendar.
- Reading the calendar requires an additional read permission on the existing sign-in, so after this ships Tyler may need to reconnect the mailbox once; how the permission set is extended is a `/speckit-plan` decision. (web-mailbox-signin froze the scope set; this feature deliberately extends it.)
- Failed calendar runs mirror email sync's failure handling: recorded in the calendar run history with a failure status and error text, with the same disconnected-mailbox guidance.
- Cancellation detection is bounded by the synced range, as specified in FR-011.
- All-day and multi-day events count as in range when any part of their span overlaps the range.
- events-for-person returns events newest-first by start time and includes cancelled events flagged as such; the unlinked-address display name considers names seen in events as well as mail.
- Automated sync checks run against a simulated calendar seeded by test setup (mechanism is a `/speckit-plan` decision); Tyler's manual acceptance pass syncs his real calendar.
- Tool names, any pagination or limit on list-events, and the exact representation of event times in tool responses are `/speckit-plan` decisions; the names used here (list-events, get-event, events-for-person) are working names from the product brief.
- Exact panel copy and page naming (e.g. renaming the "Email Sync" nav link to "Sync") are acceptance-time details Tyler can adjust.
- "Today" in prefill rules means the day the page is visited; date ranges are inclusive of both endpoints in the server-local timezone, matching email sync.

## Out of Scope

- Any calendar browsing UI — no Events page, no event detail view, no meetings section on person records; events are reachable only through the MCP read tools in this slice. (See the `calendar-ui` stub.)
- Scheduled or automatic calendar sync — sync runs only when Tyler clicks Sync or an agent calls the tool. (The `email-sync-automation` stub covers scheduling both sync types.)
- Creating, editing, responding to, or cancelling events — work-helper never modifies Outlook (permanent, same rule as mail).
- Auto-creating people from attendees — unmatched addresses are stored unlinked; creating a person is a deliberate act via the UI or MCP tools (permanent per the brief).
- Calendars beyond the connected mailbox's default calendar — secondary, shared, and other-mailbox calendars are not synced.
- Series-level features beyond the stored series identifier — no series views, recurrence-rule display, or series operations.
- Event attachments — neither files nor attachment metadata.
- A history of event changes — refresh overwrites stored state; no change log. (See the `email-change-tracking` stub.)
- Tagging events.
- Free-text event search or any MCP surface beyond the calendar sync tool, list-events, get-event, events-for-person, and the extended unlinked-addresses response.
- Reminders or notifications about upcoming events.
- Free/busy or availability computation.

## Dependencies

- **web-mailbox-signin**: the connected mailbox and its sign-in flow; this feature extends its read permissions.
- **mcp-authentik-auth**: "an authorized agent" means an MCP client authenticated per that flow.
- **email-ui / people records**: the shared email-address records, case-insensitive person linking, and the People page address-editing flow that retroactive linking rides on.
- **mcp-people-tools**: the existing unlinked-addresses tool whose response this feature extends.
