# Future: <name>

Copy this file to `docs/product/future/<name>.md` when a feature idea is deferred — usually because a `/new-feature` scope split pushed it out of a slice. Stubs are ideas, not specs: no acceptance criteria here. When the idea is picked up, `/new-feature` turns the stub into a real feature doc and deletes the stub.

## One-liner

<what it is, in one sentence>

## Origin

- **Source:** <the feature doc it was split from, e.g. `docs/product/features/track-people.md`; or `docs/product/brief.md` for core-brief work not yet specced>
- **Deferred because:** <why it didn't make that slice>
- **Recorded:** <YYYY-MM-DD>

## Depends on

<features that must ship first — reference feature docs or other stubs by name — or "None known">

## Notes

<everything already known about desired behavior: decisions made in the interview where it was deferred, constraints, half-formed ideas. Enough that the future `/new-feature` interview doesn't start from zero.>

---

## Example (filled in)

# Future: task-person-roles

## One-liner

Give each person linked to a task a role (e.g. "assignee", "stakeholder") instead of one undifferentiated bucket.

## Origin

- **Source:** split from `docs/product/features/track-people.md`
- **Deferred because:** the first people slice deliberately kept linked people as a role-less bucket to stay thin
- **Recorded:** 2026-08-06

## Depends on

`track-people` shipped (people exist and can be linked to tasks).

## Notes

Tyler explicitly said "no roles yet" — the bucket-first design was a conscious v1 call, not an oversight. Role vocabulary (fixed list vs. free text) was never discussed and needs an interview question.
