# Feature: calendar-sync

## User story

As Tyler, I want work-helper to pull events from my Outlook calendar into its own store — synced on demand from the Sync page or by an agent, over any past-or-future date range I choose — with each event's full details, recurring meetings stored as linked occurrences, and every organizer and attendee connected through the shared email-address records to the people I track, so that my CRM knows who I meet with as well as who I email, and agents can answer "when did I last meet Sam?" or "who's in my meetings this week?" through the work-helper MCP.

## Acceptance criteria

This feature builds on the connected mailbox from web-mailbox-signin — calendar sync uses the same Microsoft Graph connection and pulls from that mailbox's default calendar. Sync criteria run against a simulated calendar seeded by test setup (the mechanism is a `/speckit-plan` decision); Tyler's manual acceptance pass syncs his real calendar. "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. Date ranges are inclusive of both endpoints (server-local timezone, matching email sync), and an event is in range when any part of it falls within the range. All subjects, people, addresses, dates, and times are illustrative concrete test data; "today" means the day the check runs.

- **Given** the mailbox is connected and no calendar sync has ever run
  **When** I open the Sync page
  **Then** alongside the existing email sync section it shows a calendar sync section with start and end date pickers — start prefilled to 30 days before today, end prefilled to 30 days after today — a Sync button, and a styled empty-state message (e.g. "No syncs yet") where calendar run history would be, with the email section's own prefill and history unchanged

- **Given** the default calendar contains "Pricing review" on 2026-08-14 and "Team offsite" on 2026-08-20, plus "Spring planning" on 2026-06-02, with no calendar sync yet
  **When** I set the range 2026-08-01 to 2026-08-31 and click Sync
  **Then** the Sync button is disabled and an in-progress indicator shows while the run executes, and when it finishes the page reports 2 new events and the calendar run history lists the run with when it ran, the range, source "web", a success status, and counts 2 new / 0 updated — still listed after a page reload — and an authorized agent calling list-events for 2026-08-01 to 2026-08-31 gets exactly "Pricing review" and "Team offsite" in chronological order by start time, with "Spring planning" (outside the range) absent

- **Given** an unsynced event "Pricing review" on 2026-08-14 10:00–10:30 in the default calendar, organized by "Sam Rivera" \<sam.rivera@example.com\>, with required attendee "Tyler Satre" \<tyler@example.com\> (response accepted) and optional attendee ana.alvarez@example.com (no response), location "Conference Room B", a Teams online-meeting join link, Outlook category "Orange category", and body "Agenda: walk through the updated pricing sheet"
  **When** it is synced from the Sync page and an authorized agent fetches it
  **Then** the event shows its subject, start 2026-08-14 10:00 and end 10:30, that it is not all-day and not cancelled, the location, the body text, sam.rivera@example.com as organizer with display name "Sam Rivera", tyler@example.com as a required attendee with display name "Tyler Satre" and response accepted, ana.alvarez@example.com as an optional attendee with no response, the online-meeting join link, category "Orange category", and a link that opens the event in Outlook

- **Given** a person "Sam Rivera" exists with email address sam.rivera@example.com, no person has ana.alvarez@example.com, and the synced event "Pricing review" was organized by "Sam.Rivera@example.com" (different case) with optional attendee ana.alvarez@example.com
  **When** an authorized agent fetches the event and calls events-for-person for Sam Rivera
  **Then** the event's organizer address is shown as linked to person "Sam Rivera" (case-insensitive match), events-for-person returns "Pricing review" identifying sam.rivera@example.com with role organizer, and ana.alvarez@example.com appears on the event with role optional attendee and no linked person

- **Given** the synced event above, with ana.alvarez@example.com stored but linked to no person, and a person "Ana Alvarez" who does not have that address
  **When** I edit Ana Alvarez on the People page, add the email address ana.alvarez@example.com, and save
  **Then** the address is added to her record exactly as adding any address works today, and an authorized agent calling events-for-person for Ana Alvarez now gets "Pricing review", with her address tagged as an optional attendee

- **Given** the default calendar contains a weekly series "Team standup" occurring every Monday 09:00–09:15 and a one-off event "Pricing review" on 2026-08-14, with no calendar sync yet
  **When** I sync the range 2026-08-01 to 2026-08-31
  **Then** the run reports 6 new events — the five Monday occurrences (2026-08-03, 2026-08-10, 2026-08-17, 2026-08-24, 2026-08-31) each stored as its own event with its own date, plus "Pricing review" — and an authorized agent fetching any two standup occurrences sees the same series identifier on both, while "Pricing review" has none

- **Given** the synced event "Pricing review" stored with start 2026-08-14 10:00, location "Conference Room B", and no response from ana.alvarez@example.com, and in Outlook the event has since moved to 2026-08-15 14:00–14:30 in "Room 4" with Ana's response now accepted
  **When** I sync an overlapping range from the Sync page
  **Then** the run reports 0 new / 1 updated, and the stored event shows the new start and end, location "Room 4", and Ana's response accepted, with no duplicate — list-events for the range returns exactly one "Pricing review"

- **Given** the synced occurrence "Team standup" on 2026-08-17, which has since been cancelled in Outlook and no longer appears on the calendar
  **When** I sync the range 2026-08-01 to 2026-08-31
  **Then** the 2026-08-17 occurrence is still stored and now marked cancelled — list-events for the range still returns it, flagged cancelled, while the other occurrences are unchanged — synced events are never removed by calendar changes

- **Given** an authorized agent
  **When** it calls the calendar sync tool with the range 2026-08-01 to 2026-08-31, then calls it with no date range, and then with start 2026-08-20 and end 2026-08-05
  **Then** the first call syncs exactly as a web run does and appears in the calendar run history with source "MCP" and its counts, while the second and third calls each fail with a validation error (a start and end date are required; start must not be after end) with nothing synced and no history entry added

- **Given** synced mail and calendar where jordan.smith@example.com appears in 2 messages and attends 3 events (display name "Jordan Smith"), news@example.com appears in 1 message and no events, morgan.lee@example.com attends 1 event and appears in no messages, none of them linked to a person, and sam.rivera@example.com (linked to person "Sam Rivera") also attends events
  **When** an authorized agent calls the list-unlinked-addresses tool
  **Then** it lists jordan.smith@example.com (2 messages, 3 events), then news@example.com (1 message, 0 events), then morgan.lee@example.com (0 messages, 1 event) — still ordered by message count descending, each row now showing both counts — with sam.rivera@example.com absent because it is linked

## Out of scope

- Any calendar browsing UI — no Events page, no event detail view, no meetings section on person records; events are reachable only through the MCP read tools in this slice. (See the new `calendar-ui` stub.)
- Scheduled or automatic calendar sync — sync runs only when Tyler clicks Sync or an agent calls the tool. (The `email-sync-automation` stub now covers scheduling both sync types.)
- Creating, editing, responding to (accept/decline), or cancelling events — work-helper never modifies Outlook (permanent, same rule as mail).
- Auto-creating people from attendees — permanent per the brief: unmatched addresses are stored unlinked; creating a person is a deliberate act via the UI or MCP tools.
- Calendars beyond the connected mailbox's default calendar — secondary, shared, and other-mailbox calendars are not synced.
- Series-level features beyond the stored series identifier — no series views, recurrence-rule display, or series operations; the identifier exists only so future features can group occurrences.
- Event attachments — neither files nor attachment metadata are stored in this slice.
- A history of event changes — refresh overwrites stored state with current state; no change log. (The `email-change-tracking` stub notes a future change-tracking effort could span mail and calendar.)
- Tagging events — the brief's tagged entities are people, emails, and tasks; extending tags to events would be a deliberate future decision, not stubbed.
- Free-text event search or any MCP surface beyond the calendar sync tool, list-events, get-event, events-for-person, and the extended unlinked-addresses response. (Search candidates stay in `mcp-tool-expansion`.)
- Reminders or notifications about upcoming events.
- Free/busy or availability computation.

## Open questions

Interview resolved (2026-08-12): stored events serve both history and upcoming (sync any range, past or future); the slice is sync + MCP read tools with no browsing UI; source is the connected mailbox's default calendar only; sync is triggered from a calendar section on the Sync page and via an MCP tool; recurring events are stored as individual occurrences carrying a shared series identifier (nothing built on it yet, but it must exist); re-sync refreshes stored events to current state and keeps cancelled/removed events marked cancelled; capture is the full detail set; MCP read tools are list-events, get-event, and events-for-person; attendee-only addresses join the unlinked-address pool with event counts shown while ordering stays by message count descending.

- **Confirmed (2026-08-12):** the calendar range prefill is a rolling window — start 30 days before today, end 30 days after today, on every visit; no watermark like email's, since refresh semantics make re-covering the same dates safe and useful.
- **Confirmed (2026-08-12):** the calendar section has its own run history, same shape as email's — when it ran, the range, source (web or MCP), status, new/updated counts, and error text on failure; newest first, kept forever.
- **Confirmed (2026-08-12):** one sync at a time globally — while an email or calendar sync runs, both web Sync buttons are disabled and a colliding sync tool call of either type is rejected with an "already running" error.
- **Assumption to confirm:** failed calendar runs mirror email's failure handling — recorded in the calendar run history with a failure status and the error text, and a disconnected mailbox produces the same "connect the mailbox on the Sync page" guidance.
- **Assumption to confirm:** calendar sync needs an additional Graph calendar-read permission on the existing sign-in, so after this ships Tyler may need to reconnect the mailbox once; the scope mechanics are a `/speckit-plan` decision. (web-mailbox-signin froze the scope set; this feature deliberately extends it.)
- **Assumption to confirm:** cancellation is detected within the synced range — a stored event whose date falls inside the synced range and which is no longer on (or is marked cancelled in) the calendar becomes cancelled; stored events outside the synced range are untouched by that run.
- **Assumption to confirm:** all-day and multi-day events sync with their all-day flag and full date span, counting as in range when they overlap it.
- **Assumption to confirm:** events-for-person returns events newest-first by start time and includes cancelled events flagged as such, and the unlinked-address list's display name now considers names seen in events as well as mail.
- Tool names, any pagination/limit on list-events, and the exact representation of event times in tool responses are `/speckit-plan` decisions.
- Exact panel copy and page naming (the "Email Sync" nav link may become "Sync" now that the page covers both) are acceptance-time details Tyler can adjust.
