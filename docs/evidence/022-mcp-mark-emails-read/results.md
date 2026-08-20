# Browser evidence: MCP Mark Emails Read (022-mcp-mark-emails-read) — US1, US3 web-visibility clauses

Driven live by the `browser-tester` agent against the dev server (API and UI both served from http://localhost:5122, `MAIL_PROVIDER=fake`) on 2026-08-20, in two passes.

Because the MCP transport requires an Authentik OAuth flow not configured in this local dev environment, the read-state change under test was performed by directly invoking `setEmailReadState` (`src/server/services/email/read-state.ts`) — the identical service function the `set-email-read-state` MCP tool calls — against the same SQLite file the running dev server reads, with a `FakeMailProvider` seeded from the same dev-seed messages the server itself uses. This is the same evidence-capture pattern used for 021-mcp-move-tasks (direct service invocation against the live dev DB, since Authentik isn't available in this environment). The web app has no way to distinguish how a row was written; it only ever reads via `GET /api/emails/conversations` and `GET /api/emails/conversations/:id`. The full MCP protocol path (auth, transport, per-message outcomes, error formatting) is independently covered by `tests/integration/mcp-mark-read-tools.test.ts`'s real MCP-client integration tests. This evidence's job is specifically to prove the Emails list and conversation detail pages render and PERSIST (survive a full page reload) what that service call produces.

Target: the "Quote attached" conversation (id 2, message id 2) — synced from the dev-seed mailbox, unread by default, flagged, "Orange category", one attachment ("quote.pdf"), from Sam Rivera.

## Pass 1 — marked read (US1-AS1's "after a page reload" clause)

`setEmailReadState(db, provider, [2], 'read')` was invoked directly against the dev database before this pass began.

| Scenario | Result | Screenshot(s) |
| --- | --- | --- |
| Emails list: "Quote attached" row shows no unread indicator (`data-testid="unread-indicator"` absent) | PASS | pr-screenshots/01-emails-list-read.png |
| Conversation detail: message shows no unread badge (`data-testid="message-unread"` absent) | PASS | pr-screenshots/02-conversation-detail-read.png |
| Read state survives a full page reload of the Emails list | PASS | pr-screenshots/03-emails-list-read-after-reload.png |
| Read state survives a full page reload of the conversation detail | PASS | pr-screenshots/04-conversation-detail-read-after-reload.png |
| Regression: subject, flag, importance, category, attachment, sender all unchanged | PASS | visible in 02/04 above |

## Pass 2 — marked back unread (US3-AS1's "after a page reload" clause)

`setEmailReadState(db, provider, [2], 'unread')` was invoked directly against the dev database between the two passes.

| Scenario | Result | Screenshot(s) |
| --- | --- | --- |
| Emails list: "Quote attached" row shows the unread indicator again | PASS | pr-screenshots/05-emails-list-unread.png |
| Conversation detail: message shows the "Unread" badge again | PASS | pr-screenshots/06-conversation-detail-unread.png |
| Unread state survives a full page reload of the Emails list | PASS | pr-screenshots/07-emails-list-unread-after-reload.png |
| Unread state survives a full page reload of the conversation detail | PASS | pr-screenshots/08-conversation-detail-unread-after-reload.png |
| Regression: subject, flag, importance, category, attachment, sender all unchanged | PASS | visible in 06/08 above |

## Summary

Both directions of the read-state toggle (read → US1, unread → US3) are visible on both the Emails list row and the conversation detail page immediately after the mark, and both survive a true full-page reload — confirming the state is server/DB-backed (derived from the stored `email_messages.is_read` column via the existing `hasUnread`/`isRead` query layer, FR-009/FR-010) rather than held only in client-side state. Nothing else about the message (subject, flag, importance, categories, attachments, sender) changed across either mark (FR-007), consistent with the automated integration coverage in `tests/integration/mcp-mark-read-tools.test.ts`.

MCP-only criteria (batch outcomes, whole-call validation/preflight errors, sync non-interference, duplicate-id handling) have no web-facing surface and are covered entirely by automated-check evidence: `tests/integration/mcp-mark-read-tools.test.ts` (20 tests) and the extended `tests/unit/email-graph-provider.test.ts` / `tests/unit/email-graph-auth.test.ts` unit suites — see the full-gate output recorded for T024/T025.
