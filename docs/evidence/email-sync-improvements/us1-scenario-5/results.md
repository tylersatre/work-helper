# US1 Scenario 5 (mailbox unreachable) - results

Feature: 012-email-sync-improvements, User Story 1, Acceptance Scenario 5. Dev server: UI http://localhost:5112, API http://localhost:3012 (MAIL_PROVIDER=fake-unreachable).

All steps below were driven live through the browser against a fresh dev DB. Screenshots referenced are in this same directory.

## Scenario 5 - Mailbox unreachable

**Given**: The mail connection is broken (server configured with MAIL_PROVIDER=fake-unreachable - every sync attempt fails immediately with a connection error). Confirmed by opening /sync: it showed the default prefilled range (2026-07-11 to 2026-08-10, i.e. 30 days before today to today) and "No syncs yet" since the dev DB was fresh with no runs (screenshot implicit in the setup step, not separately captured since this is the starting state described in the task).

**When**: Opened the Email Sync page at http://localhost:5112/sync, edited the date pickers to the valid range 2026-08-01 to 2026-08-08 (screenshot `01-before-sync-valid-range.png`), then clicked the Sync button.

**Then**: The page immediately (the fake-unreachable provider fails fast) showed an inline error message "Sync failed: mailbox unreachable", and a new run-history entry appeared showing: timestamp 8/10/2026, 4:56:03 PM; range 2026-08-01 to 2026-08-08; source "web"; status "failure"; counts "0 new / 0 updated"; and the error text "mailbox unreachable" (screenshot `02-error-shown-and-history-failure.png`, close-up of the history row in `03-history-row-closeup.png`).

Reloaded the page (http://localhost:5112/sync). The run-history entry was still listed, unchanged: same timestamp, range, source "web", status "failure", "0 new / 0 updated", and error text "mailbox unreachable" (screenshot `04-after-reload-history-persisted.png`). Note the date pickers reset to the default prefill (2026-07-11 to 2026-08-10) on reload rather than reflecting the failed run's range - expected, since prefill is defined to be based on the last successful run, and this run failed (per FR-003); this is not part of scenario 5's criteria and is noted only for completeness.

**Result: PASS**

- The page surfaced an error message for the run: "Sync failed: mailbox unreachable".
- The run history recorded the run with a failure status ("failure") and the error text ("mailbox unreachable").
- The failure entry was still listed after a page reload, with all the same details intact.

## Summary

| # | Scenario | Result |
|---|----------|--------|
| 5 | Mailbox unreachable - error shown, history records failure status + error text, persists after reload | PASS |

Scenario 5 for User Story 1 (Email Sync page - mailbox unreachable) PASSES.
