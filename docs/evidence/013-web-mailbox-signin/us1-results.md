# US1 Browser Evidence: Connect the mailbox from the browser

Captured against `MAIL_AUTH=fake MAIL_PROVIDER=fake npm run dev` (UI at http://localhost:5113/sync) by the `browser-tester` agent.

| Scenario | Result | Screenshot(s) |
|---|---|---|
| US1-1: not-connected panel with Connect | PASS | `us1-1-not-connected.png` |
| US1-2: click Connect → link + code + copy control + waiting indicator, no reload | PASS | `us1-2-pending.png`, `us1-2-pending-confirm.png` |
| US1-5: reload + Connect again → same code (FR-004) | PASS — code `FAKE-CODE` matched before and after reload | `us1-5-resume.png` |
| US1-3: panel flips to "Connected as tyler@example.com" without reload | PASS — observed via the ~3s status poll, no reload issued | `us1-3-connected.png`, `us1-3-connected-clean.png` |

## Details

- **US1-1**: On first load of `/sync` with the mailbox disconnected, the panel showed "Not connected" (`data-testid="mailbox-not-connected"`) and a Connect button (`data-testid="mailbox-connect"`).
- **US1-2**: After clicking Connect, without reloading, the panel showed the verification link (`data-testid="mailbox-verification-link"`, `href="https://microsoft.com/devicelogin"`, `target="_blank"`), the user code (`data-testid="mailbox-code"` = `FAKE-CODE`), a "Copy code" control (`data-testid="mailbox-copy-code"`), and a "Waiting for sign-in…" pending indicator (`data-testid="mailbox-pending"`).
- **US1-5**: While pending, reloaded the page and clicked Connect again (within ~1.2s, before the fake's ~2s auto-complete). The code shown before and after reload was identical (`FAKE-CODE`), confirming `connect()` is idempotent and the pending attempt survives a reload.
- **US1-3**: After Connect was clicked, with no page reload at any point, the panel transitioned on its own via the ~3s status poll from pending to "Connected as tyler@example.com" (`data-testid="mailbox-connected"`) roughly 2 seconds later, matching the dev fake's auto-complete timing.

## Note on a since-resolved observation

During this run the agent also tried the Disconnect button (out of scope for US1's four scenarios) and found it produced no network request. This was because the Disconnect click handler (`onDisconnect`, wired in T024/US3) was implemented *after* this evidence run had already started — the agent was testing against an earlier build of `MailboxPanel.vue`. The handler is now wired (`@click="onDisconnect"` on `mailbox-disconnect`) and is re-verified directly in US2/US3 evidence.
