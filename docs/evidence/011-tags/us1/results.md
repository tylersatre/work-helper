# US1 — Inline tagging: results

Feature: 011-tags, User Story 1 (P1). Dev server: UI http://localhost:5111, API http://localhost:3011.

All scenarios below were driven live through the browser against a fresh dev DB. Screenshots referenced are in this same directory.

## Setup

Created task "Follow up with Sam" via the Board page's "+ Add task" control (To Do lane), and person "Sam Rivera" via the People page's create-person form.

## Scenario 1 — Create task and person

**Given/When**: Create a task "Follow up with Sam" (Board) and a person "Sam Rivera" (People).

**Then**: Task appears in To Do lane; Sam Rivera appears in the People list.

**Result: PASS**

Both records were created successfully and confirmed via the UI before proceeding to tagging scenarios.

## Scenario 2 — Create and attach "VIP" tag on the task

**Given**: Task "Follow up with Sam" exists, no tags exist.

**When**: Open the task's detail view, type "VIP" into the tag input, choose the create option.

**Then**: a "VIP" chip appears on the task's detail view — still true after reload.

**Result: PASS**

- Typing "VIP" surfaced a "Create \"VIP\"" option in the suggestion dropdown (screenshot `02a-task-tag-input-create-option.png`).
- Selecting it attached the tag immediately; the "VIP" chip rendered on the task detail view with a remove ("x") affordance (screenshot `02b-task-vip-chip-created.png`).
- Reloading /tasks/1 showed the "VIP" chip still present (screenshot `02c-task-vip-chip-after-reload.png`).
- Chip background color recorded as rgb(59, 130, 246) for later cross-surface comparison.

## Scenario 3 — Attach existing "VIP" tag to a person via case-insensitive suggestion

**Given**: Tag "VIP" exists, attached to task "Follow up with Sam"; person "Sam Rivera" exists with no tags.

**When**: Type "vip" (lowercase) into the tag input on Sam Rivera's detail view and select the suggested existing tag "VIP".

**Then**: Sam Rivera's detail view shows the "VIP" chip, and the people-list row for Sam Rivera also shows the "VIP" chip — same color as the task's "VIP" chip, no duplicate tag created.

**Result: PASS**

- Typing "vip" (lowercase) on Sam Rivera's detail view surfaced only a suggestion button labeled "VIP" — no "Create" option was offered, confirming case-insensitive matching prevented a duplicate-creation offer (screenshot `03a-person-tag-input-suggests-vip-no-create.png`).
- Selecting the suggestion attached the existing tag; Sam Rivera's detail view then showed the "VIP" chip with background color rgb(59, 130, 246) — identical to the task's chip color (screenshot `03b-person-detail-vip-chip.png`).
- The People list row for Sam Rivera showed a "VIP" chip in the Tags column, same color rgb(59, 130, 246) (screenshot `03c-people-list-row-vip-chip.png`).
- No duplicate tag was created — confirmed by identical color/name matching what was created in Scenario 2 (same underlying tag record, not a new one).

## Scenario 4 — Create and attach second tag "Q3" on the task; verify distinct colors and cross-surface consistency

**Given**: Task "Follow up with Sam" has tag "VIP", also attached to person "Sam Rivera".

**When**: Create and attach a second tag "Q3" on the task's detail view.

**Then**: The task shows "VIP" and "Q3" chips in two visibly different colors; the "VIP" chip is the same color on the task detail view, Sam Rivera's detail view, and Sam Rivera's people-list row. Reload confirms all of this survives.

**Result: PASS**

- Created "Q3" via the same create-option flow; task detail then showed both chips: "Q3" background rgb(34, 197, 94) (green) and "VIP" background rgb(59, 130, 246) (blue) — visibly distinct colors (screenshot `04a-task-vip-q3-two-colors.png`).
- Reloaded /tasks/1: both chips and their exact colors persisted (screenshot `04b-task-vip-q3-after-reload.png`).
- Re-checked Sam Rivera's detail view: "VIP" chip still rgb(59, 130, 246), matching the task (screenshot `04c-person-vip-color-matches.png`).
- Re-checked the People list row: "VIP" chip still rgb(59, 130, 246), matching the task and detail view (screenshot `04d-people-list-vip-color-matches.png`).

## Scenario 5 — Detach "VIP" from the task only

**Given**: Task "Follow up with Sam" has tags "VIP" and "Q3"; "VIP" is also attached to person "Sam Rivera".

**When**: Remove "VIP" from the task's detail view via the chip's remove ("x") affordance.

**Then**: The task now shows only "Q3" (confirmed after reload too), while Sam Rivera still has the "VIP" chip.

**Result: PASS**

- Clicked "Remove VIP" on the task detail view; the task's Tags section immediately reduced to only the "Q3" chip (screenshot `05a-task-vip-removed-q3-remains.png`).
- Reloaded /tasks/1: only "Q3" remained — the detach persisted (screenshot `05b-task-q3-only-after-reload.png`).
- Navigated to Sam Rivera's detail view (/people/1): the "VIP" chip was still present and attached — detaching from the task did not affect the person's attachment or delete the tag itself (screenshot `05c-person-still-has-vip.png`).

## Scenario 6 — Reject whitespace-only tag name

**Given**: Tags exist (Q3 attached to the task).

**When**: On the task's detail view, type only spaces into the tag input and submit (Enter).

**Then**: A visible "A name is required" validation message appears, and no tag is created (chip list unchanged).

**Result: PASS**

- Typing three spaces into the "Add tag" input produced no suggestion/create dropdown at all (correctly offering no create option for an effectively empty name).
- Pressing Enter to submit surfaced an inline alert reading "A name is required" (screenshot `06a-whitespace-only-validation-message.png`).
- The task's chip list remained unchanged (only "Q3"), confirmed both immediately and after a page reload (screenshot `06b-task-chips-unchanged-after-reload.png`) — no tag was created.

## Summary

| # | Scenario | Result |
|---|----------|--------|
| 1 | Create task and person | PASS |
| 2 | Create + attach "VIP" on task, survives reload | PASS |
| 3 | Case-insensitive suggestion attaches existing "VIP" to person, same color, no duplicate | PASS |
| 4 | Create + attach "Q3", distinct colors, cross-surface color consistency, survives reload | PASS |
| 5 | Detach "VIP" from task only; person's "VIP" untouched | PASS |
| 6 | Whitespace-only tag name rejected with "A name is required" | PASS |

All 6 acceptance scenarios for User Story 1 (inline tagging) PASS.
