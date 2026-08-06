# Future: move-task-between-lanes

## One-liner

Move a task card from one kanban lane to another, so a task can progress past the lane it was created in.

## Origin

- **Source:** split from `docs/product/features/create-task.md` (its Out of scope explicitly lists "Dragging or otherwise moving a card between lanes")
- **Deferred because:** deferred purely to keep the first slice (create a task, see it on the board) thin — it's a core kanban interaction (the product brief names "dragging cards between lanes" as part of the kanban concept), not a maybe
- **Recorded:** 2026-08-06

## Depends on

`create-task` shipped (it has — landed via PR #1, commit d7e5ae3).

## Notes

- The real lane set is To Do, In Progress, Waiting, Done, read from a config file — both decided in the create-task interview and recorded in that doc's open-questions answers.
- New tasks always land in the first configured lane, so moving cards is the only way a task will ever reach the other lanes — until this ships, In Progress, Waiting, and Done are unreachable.
- Nothing was decided about the interaction itself. Open interview questions:
  - Drag-and-drop vs. a move menu (or both)?
  - Where does a card land in the destination lane's ordering after a move?
