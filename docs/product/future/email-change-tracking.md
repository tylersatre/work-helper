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
- Graph delta queries are the likely mechanism (plan-time detail).
