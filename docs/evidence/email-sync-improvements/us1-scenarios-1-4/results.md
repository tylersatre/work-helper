# US1 (scenarios 1-4) — Email Sync page: results

Feature: 012-email-sync-improvements, User Story 1 (P1), acceptance scenarios 1-4. Dev server: UI http://localhost:5112, API http://localhost:3012. MAIL_PROVIDER=fake, seeded mailbox contains Inbox "Pricing question" (received 2026-08-04) and Sent "Re: Pricing question" (sent 2026-08-05). Fresh dev DB, no sync had ever run at the start of this session.

All scenarios below were driven live through the browser (Playwright) against the running dev server. Screenshots referenced are in this same directory. To capture the transient "in progress" state (scenario 2), the sync POST request was intercepted with an artificial network delay purely as a browser-side test technique (no application code was modified) so the disabled-button/spinner state could be observed and screenshotted before the (normally near-instant, ~11ms) fake-mailbox sync completed.

## Scenario 1 — Nav link + empty state

**Given** no sync has ever run, **When** the app is opened and the "Email Sync" link in the top navigation bar is clicked, **Then** the nav marks Email Sync as the active section (`aria-current="page"`) and the page shows start/end date pickers (start prefilled to 30 days before today, end prefilled to today), a Sync button, and a styled empty-state message where run history would be.

**Result: PASS**

- Clicking "Email Sync" navigated to `/sync`. Reading the link's `aria-current` attribute via the DOM confirmed `aria-current="page"` (and the nav renders the link bold/active — screenshot `01-nav-active-and-empty-state.png`).
- Today's date is 2026-08-10; start date picker was prefilled to `2026-07-11` (exactly 30 days earlier) and end date picker was prefilled to `2026-08-10` (today) — both visible in the same screenshot.
- A Sync button was present.
- A styled empty state was shown where run history would be: a mailbox-with-x icon and the text "No syncs yet" (screenshot `01-nav-active-and-empty-state.png`).

## Scenario 2 — Run a sync and see history

**Given** the connected mailbox's Inbox contains "Pricing question" (received 2026-08-04) and Sent contains "Re: Pricing question" (sent 2026-08-05), with nothing synced yet, **When** the range is set to 2026-08-01 to 2026-08-08 and Sync is clicked, **Then** the Sync button is disabled and an in-progress indicator shows while the run executes, and when it finishes the page reports 2 new messages and the run history lists the run with when it ran, the range, source "web", a success status, and counts 2 new / 0 updated — still listed after a page reload.

**Result: PASS**

- Set the start date field to `2026-08-01` and the end date field to `2026-08-08` via the date pickers (screenshot `02a-range-set-before-sync.png`).
- Clicked Sync. Against the real (undelayed) fake mailbox the run completed in ~11ms (confirmed via the network request log), so a second click was captured with an artificial network delay on the sync POST purely to observe the transient UI state: the Sync button showed `disabled=true` and the page displayed a spinner icon plus the text "Syncing…" next to the button (screenshot `02b-sync-in-progress.png`).
- On the original (undelayed) run, the page reported "2 new, 0 updated" immediately above the run history, and the run history's newest entry showed: timestamp `8/10/2026, 4:41:05 PM`, range `2026-08-01 – 2026-08-08`, source `web`, status `success`, counts `2 new / 0 updated` (screenshot `02c-sync-complete-2new-0updated.png`).
- Reloaded the page (`/sync`): the history entry was still present with the same fields (screenshot `02d-history-after-reload.png`, which also shows two additional demo re-sync runs made afterward to capture the in-progress state — see note below).
- Note: to safely capture the in-progress indicator (scenario requirement) without disturbing the original run's evidence, the same 2026-08-01 to 2026-08-08 range was re-submitted two more times after the original run. Because those messages were already stored, dedup correctly reported them as "0 new / 2 updated" each time (consistent with the shipped dedup/refresh behavior) rather than creating duplicates or additional "new" messages — these extra entries are visible above the original "2 new / 0 updated" entry in the history screenshots and do not contradict the scenario's requirement, since the original run's entry remained unchanged and intact.

## Scenario 3 — Prefill on return

**Given** a successful run whose range ended 2026-08-08, **When** the Email Sync page is opened again, **Then** the start date is prefilled to 2026-08-08 (the last successful run's end date) and the end date is prefilled to today.

**Result: PASS**

- After the scenario 2 runs (all successful, all ending 2026-08-08), the page was reloaded. The start date picker was prefilled to `2026-08-08` and the end date picker was prefilled to `2026-08-10` (today) (screenshot `03-prefill-after-reload.png`, identical state also visible in `02d-history-after-reload.png`).

## Scenario 4 — Validation

**Given** the Email Sync page is open, **When** the date pickers are cleared and Sync is clicked, and then start is set to 2026-08-09 with end set to 2026-08-02 (start after end) and Sync is clicked, **Then** both attempts are rejected with an inline validation message (dates are required; start must not be after end), no sync runs, and no run history entry appears.

**Result: PASS**

- Cleared both date pickers (using each picker's "Clear" control) and clicked Sync: an inline red alert reading "A start date and end date are required" appeared under the date row; the run history was unchanged (still 4 entries, newest still the `4:43:15 PM` run from scenario 2) (screenshot `04a-validation-dates-required.png`).
- Set start to `2026-08-09` and end to `2026-08-02` and clicked Sync: a different inline red alert reading "Start date must not be after end date" appeared; the run history was again unchanged — no new entry (screenshot `04b-validation-start-after-end.png`).
- Confirmed via the network request log that no POST to `/api/email-sync/runs` occurred for either invalid attempt (validation is purely client-side and blocks the request before it is sent).

## Summary

| # | Scenario | Result |
|---|----------|--------|
| 1 | Nav link marks Email Sync active (aria-current="page"); date pickers prefilled (start = today-30d, end = today); Sync button; styled "No syncs yet" empty state | PASS |
| 2 | Sync button disabled + in-progress indicator while running; result reports 2 new; history entry shows when/range/source web/success/2 new 0 updated; survives reload | PASS |
| 3 | After a successful run ending 2026-08-08, reopening the page prefills start = 2026-08-08 and end = today | PASS |
| 4 | Clearing dates and clicking Sync shows "dates required" validation; start-after-end shows a distinct validation message; neither attempt runs a sync or adds a history entry | PASS |

All 4 acceptance scenarios PASS.
