# Quickstart Validation: MCP Mark Emails Read

Runnable checks that prove the feature works end-to-end. Contract: [contracts/mcp-tools.md](contracts/mcp-tools.md); entities and transitions: [data-model.md](data-model.md); design decisions: [research.md](research.md).

## Prerequisites

- Dependencies installed (`npm install` — the worktree SessionStart hook normally does this).
- No schema change in this feature, so no migration steps.

## 1. Automated suite (primary evidence for MCP-only criteria)

```bash
npm test
```

Expected: all suites green, including the new `tests/integration/mcp-mark-read-tools.test.ts` and the extended Graph provider/auth unit tests. The full gate is:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## 2. Targeted integration run

```bash
npx vitest run tests/integration/mcp-mark-read-tools.test.ts
```

Expected outcomes pinned by the tests (mail is seeded through `FakeMailProvider` + the `sync-emails` tool with the spec's conversations; assertions run through the tool response, `get-conversation`/`list-conversations`, `GET /api/emails/conversations` — the web pages' data source — the fake mailbox's read-state accessor, and `GET /api/email-sync/runs`):

- Mark the "Quote attached" message read → outcome `marked`; read in the fake mailbox and the store; `hasUnread` gone from both list surfaces; flag/category/folder/subject untouched; **zero** new sync-run rows (US1-AS1).
- Same call again → outcome `already-in-state`; mailbox and store untouched (US1-AS2).
- One call, all three "Pricing question" ids, state read → two `marked` + one `already-in-state`; all three read everywhere (US2-AS1).
- One call with a real id, a second real id, and 999999 → two `marked` + one `not-found`; the two real messages read, nothing else changed (US2-AS2).
- One call with "Quote attached" + the mailbox-deleted "Lunch Thursday" id → `marked` + `failed` with a "mailbox no longer has" reason; the deleted message still unread in the store; the success stands (US2-AS3).
- State unread on a read message → `marked`; unread in mailbox and store; unread indicator back on both list surfaces (US3-AS1).
- Mark read, then run `sync-emails` over the message's date range → still read afterward (US4-AS1).
- `writeAccess: 'not-connected'`, `'expired'`, and `'no-write-permission'` fakes → each call fails whole with its distinct reconnect sentence, no outcomes, nothing changed (US5-AS1).
- 51 ids / empty list / `state: "archived"` → the three exact validation sentences, nothing marked (US5-AS2).
- Exactly 50 ids in one call (built by repeating seeded ids — duplicates allowed) → 50 outcomes in input order, no id silently dropped (SC-002's upper bound).
- Fetching a conversation (`get-conversation`, `GET /api/emails/conversations/:id`) and linking it to a task never change read state — asserted before the first mark, recorded-writes log empty (FR-010's negative clause).

Unit-level checks:

```bash
npx vitest run tests/unit/email-graph-provider.test.ts tests/unit/email-graph-auth.test.ts
```

Expected: PATCH `/me/messages/{id}` with only `{ isRead }` in the body and the ImmutableId Prefer header; 404 → `'not-found'`; sign-in requests include `Mail.ReadWrite`; write-token failure classified by the read-scope probe (read ok → permission error, read failing → expired).

## 3. Manual smoke via dev server + MCP client (optional)

```bash
npm run dev
```

Branch prefix 022 → API on port 3022, UI on 5122. Connect any MCP client through the Authentik auth flow, then:

1. Call `list-conversations` — pick a conversation with `hasUnread: true`; `get-conversation` for its message ids.
2. Call `set-email-read-state` with those ids and `state: "read"` → outcomes `marked`; `list-conversations` no longer shows `hasUnread`.
3. Reload the Emails page at `http://localhost:5122` — no unread dot on that row; open the conversation — no unread marker.
4. Call again with the same ids → `already-in-state`.
5. Call with `state: "unread"` → indicator returns on both surfaces.
6. Check the Sync page — no new run in history.

Note: against a dev mailbox sign-in made before this feature, step 2 instead returns the missing-permission reconnect error until you reconnect on the Sync page — that itself demonstrates US5-AS1.

## 4. Browser evidence (Definition of Done)

The web-visibility clauses (the "after a page reload" parts of US1/US3 and SC-001's web-surface half) additionally require `browser-tester` agent evidence stored in `docs/evidence/022-mcp-mark-emails-read/`, independently confirmed by the `verifier` agent, before the feature is reported done.

## 5. Tyler's manual acceptance pass (real mailbox)

After deploy: reconnect the mailbox once on the Sync page (grants the new mail-change permission), have a real agent mark one real email read, and check it shows read in Outlook with nothing else about the message changed.
