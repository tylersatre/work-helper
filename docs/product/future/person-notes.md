# Future: person-notes

## One-liner

Timestamped notes on a person — the same running-history model as task notes, applied to contacts.

## Origin

- **Source:** out of scope in `docs/product/features/track-people.md` ("notes field, or any activity history on a person") and `docs/product/features/task-notes.md` ("Notes on people or any other entity — task notes only in this slice")
- **Deferred because:** task-notes was scoped to tasks only to stay thin; people notes were never part of that idea, just its obvious neighbor
- **Recorded:** 2026-08-06

## Depends on

`track-people` shipped (people exist) and `task-notes` shipped (establishes the note model this would reuse).

## Notes

No interview has touched this — it exists as a backlog marker only. If picked up, the task-notes decisions (append-only history, delete-only with confirmation, UTC storage with relative + hover-absolute local display, "You"/"via MCP" source labels, basic markdown set) are the natural starting model, but none of that has been confirmed for people. Tyler may also just delete this stub if notes on people aren't wanted.
