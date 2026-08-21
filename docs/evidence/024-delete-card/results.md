# Browser Evidence: Delete Card

Walked against the running dev server (UI/API http://localhost:5124, feature branch `024-delete-card`) per `quickstart.md`'s three scenarios.

## US1 — Delete with confirmation

Created card "Evidence Card US1 Delete" in To Do, opened its detail view.

1. **Delete control appears near the title, alongside the lane pills** — PASS. [us1-01-detail-view-with-delete-control.png](us1-01-detail-view-with-delete-control.png). A `Delete` button (`data-testid="delete-card-button"`) renders next to the card title, above the lane pills.
2. **Clicking it opens a confirmation dialog naming the card, warning it can't be undone, without deleting yet** — PASS. [us1-02-confirmation-dialog-open.png](us1-02-confirmation-dialog-open.png). Dialog (`data-testid="delete-card-dialog"`) titled "Delete this card?" with body `"Evidence Card US1 Delete" will be permanently deleted. This can't be undone.`. A second tab confirmed the card was still present on the board while the dialog was open: [us1-03-board-still-shows-card-while-dialog-open.png](us1-03-board-still-shows-card-while-dialog-open.png).
3. **Confirming deletes the card and navigates back to the board, gone from every lane** — PASS. [us1-04-board-after-deletion-card-gone.png](us1-04-board-after-deletion-card-gone.png). URL landed on `/`; all four lanes show no tasks.

## US2 — Cancel a delete in progress

Created card "Evidence Card US2 Cancel" in To Do, opened its detail view.

1. **Delete control and dialog open as in US1** — PASS. [us2-01-detail-view-before-cancel.png](us2-01-detail-view-before-cancel.png), [us2-02-confirmation-dialog-open.png](us2-02-confirmation-dialog-open.png).
2. **Clicking Cancel closes the dialog with no network delete call and the detail view unchanged** — PASS. [us2-03-after-cancel-detail-view-unchanged.png](us2-03-after-cancel-detail-view-unchanged.png). Network log across the interaction showed only `GET`/`POST` requests (board fetch, task creation, task detail, tags) — no `DELETE` request was ever issued. Title and lane on the detail view were unchanged.
3. **Card still exists on the board in its original lane** — PASS. [us2-04-board-card-still-present.png](us2-04-board-card-still-present.png). "Evidence Card US2 Cancel" remains the only card, still in To Do.

## US3 — Deleting a card leaves linked data untouched

Created card "Evidence Card US3 Linked Data" in To Do, linked a new person "Evie Testperson" via the card's People section.

1. **Card shows the linked person before delete** — PASS. [us3-01-card-with-linked-person.png](us3-01-card-with-linked-person.png).
2. **Deleting via the confirmation flow removes the card from the board** — PASS. [us3-02-after-delete-board-card-gone.png](us3-02-after-delete-board-card-gone.png). "Evidence Card US3 Linked Data" no longer appears in any lane after confirming.
3. **The linked person still exists on the People page, unaffected** — PASS. [us3-03-people-page-person-survives.png](us3-03-people-page-person-survives.png). "Evie Testperson" remains in the directory.
4. **The Emails page is unaffected and loads normally post-deletion** — PASS. [us3-04-emails-page-unaffected.png](us3-04-emails-page-unaffected.png).

Note: this app's card detail view has no UI affordance to link a conversation to a card (unlike People/Companies, the Emails section has no add/search control — conversation linking is MCP-only, via the `link-conversation` tool). The "a linked conversation survives" half of this story's cascade guarantee is therefore evidenced at the data layer instead of the browser layer — see the Automated-check evidence section below.

## Overall

All UI-observable acceptance criteria for US1, US2, and US3 PASS. No functional deviations observed.

## Automated-check evidence: MCP visibility of a deleted card (US3)

US3's acceptance scenario 2 ("an MCP board listing no longer includes the deleted card", FR-008) and FR-009 ("no MCP tool can delete a task") are reachable only through the MCP tool and the tool registry, not the browser.

Recorded `npm test` output for `tests/integration/task-delete.test.ts`, run 2026-08-20:

```
 RUN  v4.1.10

 ✓ tests/integration/task-delete.test.ts > DELETE /api/tasks/:id > deletes an existing card with 200 and the card is gone from GET /api/board (US1) 86ms
 ✓ tests/integration/task-delete.test.ts > DELETE /api/tasks/:id > cascades to the card's own links but leaves linked people and conversations untouched (US3, FR-007) 15ms
 ✓ tests/integration/task-delete.test.ts > DELETE /api/tasks/:id > returns 404 "Task not found" for a non-existent id, not a 500 6ms
 ✓ tests/integration/task-delete.test.ts > DELETE /api/tasks/:id > returns 404 "Task not found" when confirming deletion of an already-deleted card (stale tab edge case) 6ms
 ✓ tests/integration/task-delete.test.ts > US3: MCP visibility of a deleted card > list-board no longer includes a card deleted via DELETE /api/tasks/:id (US3-AS2, FR-008) 106ms
 ✓ tests/integration/task-delete.test.ts > FR-009: no MCP tool can delete a task > src/server/mcp/tools.ts registers no delete-task tool 0ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

- **"list-board no longer includes a card deleted via DELETE /api/tasks/:id (US3-AS2, FR-008)"** — creates a task, confirms it appears in an MCP `list-board` call, deletes it via the HTTP route, then calls `list-board` again through a real MCP client (OAuth-authenticated, per this repo's existing `mcp-read-tools.test.ts` harness pattern) and asserts the title is no longer present. PASS.
- **"src/server/mcp/tools.ts registers no delete-task tool (FR-009)"** — static assertion that the MCP tool-registration source contains no `'delete-task'` tool name. PASS.
- **"cascades to the card's own links but leaves linked people and conversations untouched (US3, FR-007)"** — also exercised here (data-layer half of US3): links a person, company, tag, note, and an `email_conversations` row (via `task_conversations`) to a task, deletes the task, and asserts every one of the task's own join/note rows is gone while the `people`, `companies`, and `email_conversations` rows remain queryable and unchanged. PASS.
