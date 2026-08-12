# Browser evidence: Card–Email Links (020-card-email-links) — US1, US2, US3, US5

Driven live by the `browser-tester` agent against the dev server (API :3020, UI :5120) on 2026-08-12, in two passes. All links/unlinks were performed by a real authorized MCP client (the same `link-conversation-to-task`/`unlink-conversation-from-task`/`create-task` tool calls exercised by the integration test suite) against the dev server's actual database, so the browser observed genuine agent-driven state, not fixture data. Every "survives after reload" claim was checked with an actual page reload.

## US1 — Agent links a conversation to a card, visible everywhere (P1) — PASS

1. Board shows all seeded cards in "To Do", including "Send Sam the quote" (created via the `create-task` MCP tool, not the UI) — PASS. `01-board-with-cards.png`
2. Card "Follow up with Sam" Emails section lists both "Quote attached" and "Pricing question", each with subject, participant names, and formatted latest-message date — PASS. `04-card-two-conversations.png`
3. "Pricing question" conversation's Cards section lists both "Follow up with Sam" and "Draft Q3 goals", each with title and lane "To Do" — PASS (US1 AS2 many-to-many, both directions). `05-conversation-two-cards.png`
4. "Send Sam the quote" shows lane "To Do" and Emails section with "Quote attached"; "Quote attached"'s Cards section lists both "Follow up with Sam" and "Send Sam the quote" — PASS. `09-send-quote-card.png`, `10-quote-attached-two-cards.png`
5. Card "Follow up with Sam"'s links survive a true full-page reload — PASS. `11-reload-persistence.png`

## US2 — Tyler traces links in the web app (P2) — PASS

1. Card "No links here" Emails section shows the styled empty state ("No linked emails", icon), not a blank gap — PASS. `02-card-emails-empty-state.png`
2. "Meeting notes" conversation (synced, deliberately left unlinked) Cards section shows the styled empty state ("No linked cards") — PASS. `03-conversation-cards-empty-state.png`
3. No write affordance (add/remove/search) exists in either the Emails or Cards section on any page visited — confirmed across every card/conversation page in this pass (the People/Companies sections do have search boxes, but those are a pre-existing, unrelated feature, not the Emails/Cards sections in scope here) — PASS.
4. Cross-navigation: clicking "Pricing question" in the card's Emails section navigates to `/emails/1` — PASS. `06-cross-nav-to-conversation.png`. Clicking "Follow up with Sam" in that conversation's Cards section navigates back to `/tasks/2` — PASS. `07-cross-nav-to-card.png`

## US3 — Agent unlinks a conversation without losing anything (P2) — PASS

Card "Renew lease" was linked to conversation "Introduction", observed populated (`08-renew-lease-before-unlink.png`), then unlinked via a real `unlink-conversation-from-task` MCP call between the two evidence passes.

1. Card "Renew lease" Emails section is back to the "No linked emails" empty state after the unlink, across a reload — PASS. `12-renew-lease-emails-empty-after-unlink.png`
2. The card itself is otherwise unaffected: title, lane, and every other section render normally — PASS. `13-renew-lease-card-normal.png`
3. "Introduction" conversation's Cards section is back to the "No linked cards" empty state — PASS. `14-introduction-cards-empty-after-unlink.png`
4. The conversation itself is fully intact: subject and its message ("Nice to meet you.") still fully present — PASS. `15-introduction-conversation-intact-with-message.png`
5. "Introduction" still appears on the Emails list page (not deleted from the mailbox) — PASS. `16-emails-list-still-has-introduction.png`
6. "Renew lease" still appears on the board in the "To Do" lane (not deleted from the board) — PASS. `17-board-renew-lease-still-present.png`
7. Regression check: the unrelated card "Follow up with Sam" still shows both its links unaffected by the "Renew lease"/"Introduction" unlink — PASS. `18-follow-up-with-sam-still-has-both-links.png`

## US5 — Agent creates a card from an email and links it (P3) — PASS

1. "Send Sam the quote" was created via the `create-task` MCP tool (not the UI) and then linked to "Quote attached" via `link-conversation-to-task`. It appears in the board's "To Do" lane, its detail view shows "Quote attached" in the Emails section, and the conversation's Cards section lists it — PASS. `01-board-with-cards.png`, `09-send-quote-card.png`, `10-quote-attached-two-cards.png`

## Notes

- Console errors observed across both passes were all benign: favicon 404s and one benign 404 on the bare API origin root path (not an app route). No application errors.
- User Story 4 (bad link requests — duplicate link, unknown conversation/card id, unlink of a non-linked pair) has no web-facing surface (links are MCP-only per FR-010); its evidence is recorded separately as automated-check output in `mcp-conversation-link-tools-output.txt`, alongside the rest of the MCP-only criteria.
- The 5+/many-links edge case (FR-015, no truncation) and the card-delete cascade edge case are also MCP/DB-level, with no dedicated UI acceptance scenario in spec.md — both are covered by automated integration tests (`tests/integration/task-conversation-links.test.ts`), not browser evidence.
