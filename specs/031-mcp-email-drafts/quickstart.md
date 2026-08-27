# Quickstart: Validating MCP Email Drafts

**Feature**: `031-mcp-email-drafts` | branch `031-mcp-email-drafts` (worktree `.claude/worktrees/mcp-email-drafts`)

How to prove the feature works end-to-end. Shapes and semantics referenced here are defined in [contracts/](contracts/) and [data-model.md](data-model.md).

## Prerequisites

- Dependencies installed (the SessionStart hook runs install in fresh worktrees; otherwise `npm install`).
- No mailbox or Azure credentials needed for any automated check — everything runs against the simulated mailbox (`FakeMailProvider`, research R4).

## Gate commands (must all pass — also enforced by the Stop hook)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Automated acceptance checks by story

Run everything email-related in one shot with `npx vitest run tests/unit tests/integration tests/component` (or just `npm test`). The story → test-file mapping:

| Story | What proves it | Where |
|---|---|---|
| US1 fresh drafts (+ signature append, error paths) | MCP client calls `create-draft` against the booted app; asserts the fake mailbox's Drafts folder, Sent-folder invariance, `list-conversations`/`get-conversation`/REST visibility without a sync, and the not-connected / expired / no-permission / empty-body errors | `tests/integration/mcp-draft-tools.test.ts` (new, modeled on `mcp-mark-read-tools.test.ts`) |
| US2 reply / reply-all shape | `create-reply-draft` with `replyAll` false/true against a seeded conversation; asserts "Re:" subject, derived recipients (owner excluded), layered body order (supplied HTML → signature → quote), placement in the conversation, unknown-id error | same file |
| US3 update/delete + draft-flag guard | `update-draft`/`delete-draft` on a seeded synced draft (verbatim body replace, recipients change, immediate store visibility); rejection on non-draft ids and on stale drafts (fake 404 knob), asserting nothing changed | same file |
| US4 signature panel | PUT-echo → GET-verbatim on `/api/email-signature`; component test for the panel (empty state, save, reload persistence) | `tests/integration/email-signature.test.ts`, `tests/component/sync-page.test.ts` (new + extended) |
| US5 drafts mirror on sync | Seed four synced drafts, mutate the fake mailbox (edit/send/discard/leave), sync a narrow range, assert the four FR-016 outcomes + whole-folder pull | `tests/integration/email-sync.test.ts` (extended) |
| Graph mechanics (all stories) | Exact URLs/verbs/payloads for the four Graph operations, create-then-patch reply layering, whole-folder Drafts paging, 404 mapping | `tests/unit/email-graph-provider.test.ts` (extended, `vi.stubGlobal('fetch', …)`) |
| Snapshot-rule exception | Draft rows mirror; non-draft rows still snapshot; `is_draft` joins the metadata refresh list | `tests/unit/email-refresh-rules.test.ts` (extended) |
| Draft markers in the web UI | Row chip (`draft-indicator`) and message badge (`message-draft`) render from `hasDraft`/`isDraft` | `tests/component/emails-page.test.ts`, `tests/component/email-conversation-page.test.ts` (extended) |

## Browser evidence (UI-facing criteria)

UI-facing criteria (US4's panel; the Emails-page markers in US1/US3's surfaces) additionally need `browser-tester` evidence in `docs/evidence/mcp-email-drafts/`:

```bash
MAIL_PROVIDER=fake npm run dev   # feature 031 → API http://localhost:3031, UI http://localhost:5131
```

The dev seed (`dev-seed.ts`) includes a draft so the markers are visible without any tool call. Scenarios for the agent: Sync page → signature panel empty state → save `<p>Tyler Satre</p><p>Example Corp</p>` → reload → still shown; Emails page → conversation row shows the Draft chip → open conversation → draft message shows the Draft badge.

## Expected outcomes summary

- Every draft tool call lands or fails atomically: on success the draft is in the fake mailbox's Drafts folder **and** on work-helper's surfaces immediately (no sync run, no `sync_runs` row); on failure the error names the problem and neither mailbox nor store changed.
- Reply drafts read top-to-bottom: supplied HTML, signature, quoted original — with "Re:" subject and owner-excluded recipients.
- After any sync run, store drafts exactly match the fake mailbox's Drafts folder, regardless of the run's date range.
- The Sent folder never changes except via the fake's own "Tyler sent it" test hook (SC-004).

## Tyler's manual acceptance pass (real mailbox)

1. If the mailbox sign-in predates the email-read-state feature: reconnect once on the Sync page (research R3 — sign-ins since then already hold `Mail.ReadWrite`; no reconnect needed).
2. Save the real signature in the Sync page panel.
3. From an MCP client, create a fresh draft and a reply draft; confirm both in Outlook's Drafts folder, correctly shaped and signed.
4. Send one agent-created draft from Outlook on the Mac without recomposing it (SC-007); run a sync and confirm the draft stops being a draft in work-helper.
