# Quickstart Validation: Card–Email Links

Runnable checks proving the feature end-to-end. Contracts: [contracts/mcp-tools.md](contracts/mcp-tools.md), [contracts/http-api.md](contracts/http-api.md); shapes: [data-model.md](data-model.md).

## Prerequisites

- Node >= 22, dependencies installed (`npm install` — the worktree SessionStart hook normally handles this).
- No mailbox connection needed — automated checks seed conversations through `FakeMailProvider` sync (research D10).

## Full gate (what the Stop hook runs)

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

Expected: all pass; `npm test` includes the new suites below.

## Targeted automated checks

MCP tool surface — link/unlink happy paths, duplicate + not-found + unlink-not-linked errors, `get-task`/`get-conversation` link fields, create-task-then-link flow, unchanged `list-board`/`list-conversations` (User Stories 1, 3, 4, 5; FR-001–FR-006, FR-011–FR-014):

```bash
npx vitest run tests/integration/mcp-conversation-link-tools.test.ts
```

Service + HTTP surface — detail-response fields, ordering, card-delete cascade, unlink non-destructiveness (FR-004, FR-011, FR-012; SC-004):

```bash
npx vitest run tests/integration/task-conversation-links.test.ts
```

Migration parity — fresh DB and upgraded production-shaped DB converge on the same schema including `task_conversations`:

```bash
npx vitest run tests/integration/migration-upgrade.test.ts
```

UI sections — entries, empty states, navigation hrefs, absence of write controls (User Story 2; FR-007–FR-010, SC-005):

```bash
npx vitest run tests/component/linked-conversations.test.ts tests/component/linked-cards.test.ts tests/component/task-detail.test.ts tests/component/email-conversation-page.test.ts
```

## Manual / browser validation (browser-tester evidence)

Start the dev server (feature 020 → API 3020, UI 5120):

```bash
npm run dev
```

Scenario walk (mirrors the spec's acceptance scenarios; evidence lands in `docs/evidence/020-card-email-links/`):

1. Seed: sync the fake mailbox so conversations exist; create a card (board UI or `create-task`).
2. Open the card at `http://localhost:5120/tasks/<id>` — the Emails section shows the styled "No linked emails" empty state; open the conversation at `/emails/<id>` — the Cards section shows "No linked cards" (US2 scenario 1).
3. Link via MCP (`link-conversation-to-task`) as an authorized client; reload both pages — the card lists the conversation with subject, participants, and latest-message date; the conversation lists the card with its lane (US1 scenario 1).
4. Click the conversation entry on the card → lands on `/emails/<id>`; click the card entry on the conversation → lands on `/tasks/<id>` (US2 scenario 2).
5. Verify neither section offers any add/remove control (FR-010).
6. Unlink both directions via `unlink-conversation-from-task`; reload — both empty states return, the card is still on the board, the conversation still lists all messages on the Emails page (US3).

Expected outcome: every acceptance scenario in [spec.md](spec.md) passes; MCP-only criteria carry recorded test output, UI criteria carry browser-tester screenshots, both independently confirmed by the verifier agent.
