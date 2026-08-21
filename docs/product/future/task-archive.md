# Future: task-archive

## One-liner

A hide-don't-destroy archive flag on cards, in both the web UI and MCP, so leftover import duplicates and dead cards stop being "closed" into Done and polluting it as a record of real completed work.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day; `delete-card` (merged 2026-08-20) deliberately kept deletion web-UI-only ("agents cannot delete cards") with no soft-delete or restore
- **Deferred because:** Tyler chose to stub the audit's recommendations for future work rather than spec immediately
- **Recorded:** 2026-08-21

## Depends on

`delete-card` shipped (establishes that permanent removal exists and is human-only).

## Notes

- Decided 2026-08-21: archive is a both-surfaces feature, and it does not touch the delete-card decision — agents can archive (reversible, hidden not destroyed) but still cannot delete. Archive and delete coexist: archive for cleanup an agent may do, delete for permanent removal only Tyler does.
- Interview questions: where archived cards live (a dedicated archived view, a board toggle, per-lane?); the unarchive flow and where an unarchived card lands (its old lane and position?); whether archiving is allowed from any lane or is Done-adjacent; whether `list-board` hides archived cards by default with an include-archived argument; what happens to the card's links and notes (presumably all kept — that's the point); whether archived cards still match the board filter from `board-search-filter`.
