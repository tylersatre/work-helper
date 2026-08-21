# 026-note-tag-task-tools Evidence

Evidence directory: `docs/evidence/026-note-tag-task-tools/`.

## Methodology note

This feature adds 8 new write MCP tools (delete-note, update-task, create-tag, rename-tag, recolor-tag, delete-tag, attach-tag, detach-tag) plus 1 read tool (list-tags) to the work-helper MCP server. The MCP tools themselves are already fully covered by passing integration tests (`tests/integration/mcp-note-tag-task-tools.test.ts`) that exercise them through a real MCP client.

Because the MCP transport requires an Authentik OAuth flow not configured in this local dev environment (same situation as features 021-mcp-move-tasks and 022-mcp-mark-emails-read), the write actions under test were performed by directly invoking the same service functions the MCP tools call, against the live SQLite database the running dev server (UI http://localhost:5126, API http://localhost:3026) reads. The web app has no way to distinguish how a row was written; it only ever reads via the normal REST endpoints (`GET /api/board`, `GET /api/tasks/:id`, `GET /api/people/:id`, `GET /api/tags`). The full MCP protocol path (auth, transport, argument mapping, error formatting) is independently covered by `tests/integration/mcp-note-tag-task-tools.test.ts`'s real MCP-client integration tests. This evidence's job is specifically to prove the kanban board, task detail view, person detail view, and Tags page render and PERSIST (survive a full page reload, per FR-020) what those service calls produce.

Four MCP-equivalent scenarios were pre-seeded before this capture began, as described in the task brief:

1. **delete-note (US1)**: task 1 ("Draft Q3 goals") had "Second note" deleted via `delete-note`, leaving only "First note".
2. **update-task (US4)**: task 2 was renamed from "Book venue (due Aug 20)" to "Book venue (due Sept 5)" via `update-task`.
3. **Tag lifecycle (US2)**: a tag "Renewal" (#F59E0B) was created via `create-tag`, attached to task "Book venue (due Sept 5)" and to person Jordan Smith via `attach-tag`, renamed to "Contract renewal" via `rename-tag`, recolored to #10B981 via `recolor-tag`, then detached from the task only (not the person) via `detach-tag`.
4. **delete-tag (US2 AS5 / SC-006)**: a second tag "Overdue" was created, attached to task "Draft Q3 goals" and to Jordan Smith, then deleted entirely via `delete-tag`.

All four scenarios were driven live via Playwright against http://localhost:5126, with every scenario checked both immediately and after a full, non-SPA page reload (`browser_navigate` back to the same URL) to confirm server-side persistence rather than client-only state.

## Results

| # | Scenario | Result | Screenshot(s) |
| --- | --- | --- | --- |
| 1 | delete-note (US1): task 1 detail shows only "First note", not "Second note" | PASS | pr-screenshots/02-task1-notes-before-reload.png |
| 1 | delete-note (US1) survives a full page reload of the task detail view | PASS | pr-screenshots/03-task1-notes-after-reload.png |
| 2 | update-task (US4): "To Do" lane card reads "Book venue (due Sept 5)" | PASS | pr-screenshots/01-board-initial.png |
| 2 | update-task (US4): task 2 detail heading reads "Book venue (due Sept 5)" | PASS | pr-screenshots/04-task2-title-notags-before-reload.png |
| 2 | update-task (US4) survives a full page reload of both the board and the task detail view | PASS | pr-screenshots/05-task2-title-notags-after-reload.png, pr-screenshots/06-board-after-reload.png |
| 3 | Tags page lists exactly one tag, "Contract renewal", with swatch/text showing #10B981 | PASS | pr-screenshots/07-tags-page-before-reload.png |
| 3 | Jordan Smith's person detail page shows a single "Contract renewal" chip (green, #10B981) | PASS | pr-screenshots/08-jordan-smith-before-reload.png |
| 3 | Task "Book venue (due Sept 5)" detail view shows NO "Contract renewal" chip (detach-tag proof — tag exists elsewhere but is gone from this task) | PASS | pr-screenshots/04-task2-title-notags-before-reload.png |
| 3 | All of the above (Tags page, Jordan Smith chip, task's missing chip) survives a full page reload | PASS | pr-screenshots/10-tags-page-after-reload.png, pr-screenshots/09-jordan-smith-after-reload.png, pr-screenshots/05-task2-title-notags-after-reload.png |
| 4 | delete-tag (US2 AS5 / SC-006): Tags page does NOT list "Overdue" anywhere | PASS | pr-screenshots/07-tags-page-before-reload.png, pr-screenshots/10-tags-page-after-reload.png |
| 4 | Task "Draft Q3 goals" detail view shows no "Overdue" chip | PASS | pr-screenshots/02-task1-notes-before-reload.png, pr-screenshots/03-task1-notes-after-reload.png |
| 4 | Jordan Smith's detail page shows no "Overdue" chip | PASS | pr-screenshots/08-jordan-smith-before-reload.png, pr-screenshots/09-jordan-smith-after-reload.png |

## Narrative

Navigated to `http://localhost:5126` (a fresh, full navigation). The board rendered with the "To Do" lane showing two cards: "Draft Q3 goals" and "Book venue (due Sept 5)" — confirming the `update-task` rename (scenario 2) had already taken visible effect on the board card title, and that neither task had moved out of To Do. In Progress, Waiting, and Done were all empty, as expected (`pr-screenshots/01-board-initial.png`).

Clicking into "Draft Q3 goals" navigated to `/tasks/1`. Its Notes section listed exactly one note, "First note" (attributed to "You", "3 minutes ago"), with no trace of "Second note" — confirming the `delete-note` call (scenario 1) removed only the targeted note. Its Tags section showed no chips at all — the empty "Add tag" input only — confirming no dangling "Overdue" chip (scenario 4's second sub-check) (`pr-screenshots/02-task1-notes-before-reload.png`). A full-navigation reload of `/tasks/1` reproduced an identical accessibility tree: same single note, same absence of any tag chip (`pr-screenshots/03-task1-notes-after-reload.png`).

Navigating to `/tasks/2` showed the heading "Book venue (due Sept 5)" (not "due Aug 20"), confirming the `update-task` rename (scenario 2) at the detail-view level too. Its Tags section showed no chips — confirming the `detach-tag` call (scenario 3) had removed "Contract renewal" from this task specifically, even though the tag itself still exists elsewhere (`pr-screenshots/04-task2-title-notags-before-reload.png`). A full-navigation reload of `/tasks/2`, and separately a full-navigation reload of the board itself, reproduced identical results — the board's To Do lane still read "Book venue (due Sept 5)" and the task detail view still showed the same title with no tag chip (`pr-screenshots/05-task2-title-notags-after-reload.png`, `pr-screenshots/06-board-after-reload.png`).

Navigating to `/tags` showed the tag list contained exactly one entry: "Contract renewal" with a green chip and an adjacent color field reading "#10B981" (visually confirmed as a green swatch matching the hex value) — confirming the `create-tag` → `rename-tag` → `recolor-tag` chain (scenario 3) landed correctly, and that `delete-tag` (scenario 4) fully removed "Overdue" with no dangling entry (`pr-screenshots/07-tags-page-before-reload.png`). A full-navigation reload of `/tags` reproduced the identical single-entry list (`pr-screenshots/10-tags-page-after-reload.png`).

Navigating to `/people/1` (Jordan Smith, confirmed via the People list link) showed a Tags section with exactly one chip, "Contract renewal", rendered in the same green (#10B981) as the Tags page swatch, and no "Overdue" chip — confirming `attach-tag` (scenario 3) attached the tag to the person and that the tag survived its rename/recolor while staying attached, and confirming `delete-tag` (scenario 4) detached "Overdue" from this person too, with `peopleDetached: 1` visibly reflected as zero remaining "Overdue" chips (`pr-screenshots/08-jordan-smith-before-reload.png`). A full-navigation reload of `/people/1` reproduced the identical single-chip state (`pr-screenshots/09-jordan-smith-after-reload.png`).

## Summary

All four seeded scenarios are visible in the rendered UI exactly as specified, and every one of them survives a full, non-SPA page reload, confirming the effects of delete-note, update-task, create-tag, rename-tag, recolor-tag, attach-tag, detach-tag, and delete-tag are correctly persisted server-side and rendered across the kanban board, task detail view, person detail view, and Tags page. The key detach-tag proof (scenario 3) is unambiguous: "Contract renewal" is visible on the Tags page and on Jordan Smith, but absent from the task it was explicitly detached from. The key delete-tag proof (scenario 4) is equally unambiguous: "Overdue" appears nowhere in the app — not on the Tags page, not on "Draft Q3 goals", not on Jordan Smith — with zero dangling chips anywhere, consistent with the tool's reported `peopleDetached: 1, tasksDetached: 1` cleanup.

MCP-only criteria (tool argument validation, error formatting, batch/outcome reporting such as `peopleDetached`/`tasksDetached` counts, the 1-based/0-based or id-vs-name resolution logic) have no web-facing surface and are covered entirely by `tests/integration/mcp-note-tag-task-tools.test.ts`'s real MCP-client integration tests.
