# Future: calendar-ui

## One-liner

Browse synced calendar events in the web app — an events/calendar surface, an event detail view, and a meetings section on person records, with address-linking controls like email-ui's.

## Origin

- **Source:** split from `docs/product/features/calendar-sync.md`
- **Deferred because:** Tyler chose the sync + MCP read tools slice first, mirroring how email-sync shipped before email-ui; a browsing UI is its own surface with its own rules
- **Recorded:** 2026-08-12

## Depends on

`calendar-sync` shipped (events exist to browse). The `email-ui` feature is the natural pattern to follow.

## Notes

- The calendar-sync interview offered a full browsing UI and a person-page-section-only variant; neither was rejected on the merits — deferred purely for slice thinness.
- Data decided in calendar-sync that a UI can rely on: full capture (start/end, all-day flag, location, body, organizer and attendees with required/optional and response status, online-meeting link, categories, cancelled state, Outlook link), occurrences stored individually with a shared series identifier, cancelled events kept and flagged.
- Undecided and needing an interview: list vs. calendar-grid presentation; whether linking an attendee address to a person (and create-person-from-attendee) happens in event views like email-ui's flows; how cancelled events and the series link display; whether person pages show past meetings, upcoming ones, or both.
