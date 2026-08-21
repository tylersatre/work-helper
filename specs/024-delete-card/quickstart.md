# Quickstart: Delete Card

Validation scenarios for the acceptance criteria in [spec.md](./spec.md). See [contracts/http-api.md](./contracts/http-api.md) and [data-model.md](./data-model.md) for the interface and data details referenced below.

## Prerequisites

- Dev server running for this feature's branch (`npm run dev`; per `CLAUDE.md`, port derives from the `024-` branch prefix).
- At least one card on the board to delete during manual/browser verification (create one via the UI if needed).

## Automated checks

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` must include the new `tests/integration/task-delete.test.ts` covering:

1. `DELETE /api/tasks/:id` on an existing card returns 200 and the card is gone from `GET /api/board`.
2. The delete cascades to remove the card's own `task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations` rows, while the linked `people` row and `email_conversations`/`email_messages` rows remain queryable and unchanged (US3, FR-007).
3. `DELETE /api/tasks/:id` on a non-existent or already-deleted id returns 404 `Task not found`, not a 500 (edge case).
4. The MCP `list-board` tool's response no longer includes a card deleted via the route above (US3 acceptance scenario 2, FR-008) — call the tool handler directly (or via the existing MCP test harness pattern in `tests/integration/mcp-*.test.ts`) after deleting through the HTTP route.
5. No MCP tool capable of deleting a task is registered (FR-009) — assert the tool list in `src/server/mcp/tools.ts` has no delete-task tool.

## Browser evidence (`browser-tester` agent)

Drive these against the running dev server; capture screenshots per the repo's evidence convention (`docs/evidence/024-delete-card/`).

1. **US1 — delete with confirmation**: Open a card's detail view → confirm a delete control appears near the title, alongside the lane pills → click it → confirm a modal appears showing the card's title and a "can't be undone" warning, and the card is not yet gone → click confirm → verify navigation lands back on the board and the card no longer appears in any lane.
2. **US2 — cancel**: Open the confirmation modal → click cancel → verify the modal closes, no request was made (or, if made, no deletion occurred), and the detail view for the same card is still showing, unchanged.
3. **US3 — linked data survives**: Link a card to a conversation and a person → delete the card via the confirmation flow → verify the conversation still appears on the Emails page and the person still exists on the People page, unaffected.

## Expected outcome

All automated checks pass; browser evidence shows the three scenarios above matching their acceptance criteria; `SC-001`–`SC-004` in spec.md are satisfied.
