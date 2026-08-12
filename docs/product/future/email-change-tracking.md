# Future: email-change-tracking

## One-liner

Track what happens to synced email after ingestion — deletions, moves, read/unread status, and other mailbox changes — instead of treating the store as a write-once snapshot.

## Origin

- **Source:** split from `docs/product/features/email-sync.md`
- **Deferred because:** the first sync slice deliberately ignores post-sync mailbox changes; Tyler: "for now ignore changes, later on we'll be tracking stuff as it changes"
- **Recorded:** 2026-08-07

## Depends on

`email-sync` shipped. Pairs naturally with `email-sync-automation` (change tracking is most useful when sync runs continuously).

## Notes

- Tyler's phrasing suggests tracking changes over time, not just mirroring current state — whether a deletion in Outlook deletes here or is recorded as an event ("deleted from mailbox on <date>") is the key interview question. The snapshot criterion in email-sync (deleted mail stays intact in work-helper) hints the archive character should survive.
- Candidate changes to track: deletion, folder moves, read/unread, flag/categorize. Which matter to Tyler is undecided.
- Partially eaten by `email-sync-improvements` (specced 2026-08-10): every sync now refreshes an already-stored message's metadata — read state, flags, categories, importance, folder, attachment metadata — to the mailbox's current state, while body/subject/participants stay snapshotted. What remains for this feature: deletions, message edits, recording changes as history/events rather than overwriting current state, and freshness without a manual sync (pairs with `email-sync-automation`).
- Graph delta queries are the likely mechanism (plan-time detail).
- `calendar-sync` (specced 2026-08-12) gives events the same refresh-without-history pattern: re-sync overwrites a stored event's current state (time, location, attendees, responses) and marks cancelled events, but keeps no record of what changed. A change-tracking effort could span mail and calendar together.
