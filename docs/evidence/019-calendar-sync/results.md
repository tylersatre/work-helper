# 019-calendar-sync Evidence

Evidence directory: `docs/evidence/019-calendar-sync/`. Per `spec.md`'s Out of Scope, US2–US7 have no UI surface — events are reachable only through the MCP read tools in this slice — so those criteria are covered below by recorded automated-check output (constitution Principle III). US1 is the one UI-facing story and is covered by the browser-evidence section further down.

## Automated-check evidence (MCP/API-only criteria: US2–US6, FR-008–FR-021)

Command (re-run against the branch after the code-review fix wave, which added one more test to `calendar-graph-provider.test.ts`):

```
npx vitest run tests/integration/calendar-sync.test.ts tests/integration/calendar-read-tools.test.ts \
  tests/integration/calendar-sync-runs.test.ts tests/unit/calendar-refresh-rules.test.ts \
  tests/unit/calendar-sync-window.test.ts tests/unit/calendar-graph-provider.test.ts
```

Result: **6 test files passed, 77 tests passed** (0 failed).

```
 Test Files  6 passed (6)
      Tests  77 passed (77)
   Start at  03:38:43 (subset of the full 7-file/89-test run reported below, minus US7's file)
   Duration  ~2s
```

Coverage by user story:

- **US2 — full event detail (`get-event`)**: `calendar-read-tools.test.ts` describe block `US2: get-event returns the full detail set` — the fully-populated "Pricing review" scenario (organizer, required/optional attendees with responses, location, join link, category, body) round-tripping every FR-008 field, the not-found tool error, the no-display-name attendee edge case, and the solo-appointment (organizer-only) edge case. `FR-012: all-day / multi-day events round-trip through sync and read tools` (added during code review) closes the gap the verifier flagged — an all-day multi-day event synced and read back via `list-events`/`get-event` with `isAllDay: true` and its full date span intact.
- **US3 — events connect to tracked people**: `calendar-read-tools.test.ts` describe block `US3: events connect to tracked people` — case-insensitive organizer linking, the unlinked-attendee case, `events-for-person` role/address output, pagination (`limit`/`cursor`), person-not-found and invalid-cursor tool errors, cancelled events included and flagged, and retroactive linking (adding an address to a person connects already-synced events with no re-sync) via the real contact-entry route.
- **US4 — recurring series as linked occurrences**: `calendar-sync.test.ts` describe block `US4: recurring meetings stored as linked occurrences` — a 5-occurrence weekly series plus a one-off syncing as 6 new events, two occurrences sharing a non-null `seriesId`, the one-off's `seriesId: null`, and an individually-moved occurrence keeping its `seriesId` with exceptional details.
- **US5 — re-sync refresh and cancellation**: `tests/unit/calendar-refresh-rules.test.ts` describe block `calendar refresh rules (R9)` (8 tests: identical→untouched/uncounted, field/participant change→1 updated with delete-reinsert, disappearance→cancelled with no double-count on repeat absence, `isCancelled: true`→cancelled, cancelled→active reappearance, out-of-window rows never touched, nothing ever deleted) plus `calendar-sync.test.ts` describe block `US5: re-sync refreshes events and preserves history` (moved-event 0-new/1-updated scenario, occurrence-cancellation scenario, moved-out-of-range-then-back edge case).
- **US6 — agent-triggered sync (`sync-calendar`)**: `calendar-sync.test.ts` describe block `US6: agents trigger calendar sync via MCP` — valid range recorded with source `'mcp'`, missing-dates and inverted-range validation errors with no history row, single-flight collision, and a fully-failing run's tool error plus recorded failure row.
- **Provider correctness (`GraphCalendarProvider`, feeds every story)**: `tests/unit/calendar-graph-provider.test.ts` (14 tests) — `calendarView` URL/`$select`/`$orderby`/`$top`, `Prefer` headers, `@odata.nextLink` paging, UTC parsing, full FR-008 field mapping, 401/403→`MailboxNotConnectedError`, GET-only requests, and (added during code review) a guard that throws rather than silently mis-storing when Graph returns a non-UTC `timeZone` despite the `Prefer: outlook.timezone="UTC"` request. `tests/unit/calendar-sync-window.test.ts` (16 tests) covers `FakeCalendarProvider`'s window-overlap, paging, and failure-injection semantics used by every integration suite above.
- **Cross-kind single-flight (FR-006), both directions**: calendar-in-flight blocking `sync-emails`/`sync-calendar`/web-POST is covered in `calendar-sync.test.ts` (`US1: single-flight guard spans both sync kinds`) and `calendar-sync-runs.test.ts` (`POST /api/calendar-sync/runs`); the reverse direction (email-in-flight blocking a calendar sync) is covered in `calendar-sync-runs.test.ts`'s `US1 cross-kind single-flight: email sync in flight blocks calendar sync (FR-006)` describe block, added during code review to close the gap the verifier flagged.
- **Partial-failure recording (spec Edge Case "a sync run fails partway")**: `calendar-sync-runs.test.ts`'s `POST /api/calendar-sync/runs` describe block includes a `throwAfterEventCount`-gated test asserting a 201 response with `status: 'failure'`, a partial `newCount`, non-null `error`, and a matching failure row in `GET /api/calendar-sync/runs` — added during code review to close the gap the verifier flagged.

## Automated-check evidence (US7, extends a pre-existing MCP tool)

Command: `npx vitest run tests/integration/mcp-unlinked-addresses.test.ts`

Result: **1 test file passed, 12 tests passed** (0 failed) — 10 pre-existing mail-only tests (`US2: list-unlinked-addresses`, a different feature's US2, unrelated to this feature's US2) unchanged, plus 2 new tests in describe block `US7: list-unlinked-addresses spans mail and calendar` covering the exact spec fixture (jordan.smith@example.com 2 msg/3 evt, news@example.com 1/0, morgan.lee@example.com 0/1, a linked address excluded, a resource-only address excluded, and an address that is `resource` on one event but non-resource on another still counted correctly).

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

## Full-suite corroboration

The full repository gate (`npm run lint && npm run typecheck && npm test && npm run build`) passes with **870/870 tests across 77 files** as of the latest commit on this branch — the 89 calendar-specific tests above (77 + 12) plus the migration test (`tests/integration/migration-upgrade.test.ts`, verifying migration 0002 is purely additive and fresh/upgraded schemas converge) are all included in that total.

## Browser evidence (User Story 1 — the one UI-facing story)

Dev server: API http://localhost:3019, UI http://localhost:5119, started with `MAIL_PROVIDER=fake` (seeded FakeCalendarProvider, no real Microsoft Graph calls). Driven live via Playwright MCP against the running dev server; navigated to `http://localhost:5119/sync` for every scenario.

Note on shared dev server: the calendar run history was empty on the very first navigation to the Sync page in this session (confirmed below), so this appears to have been the first calendar sync activity against this dev instance today. The Email section's own history stayed "No syncs yet" for the entire session (no email sync was ever triggered here), confirming the calendar work never touched the email section.

| Scenario | Result | Screenshot(s) |
| --- | --- | --- |
| AC1: Fresh Sync page shows calendar section beside email section, prefilled, empty history | PASS | 01-initial-state.png |
| AC2: Set range, click Sync, disabled + in-progress indicator, completed counts, history row, survives reload | PASS | 02-range-set.png, 04-sync-completed.png, 05-in-progress.png, 06-after-reload.png |
| AC3: Both web Sync buttons disabled while any sync runs (one sync at a time globally) | PASS (UI cross-disable); server-side 409/status:running not independently reproduced from the browser (see notes below) | 05-in-progress.png |
| Nav rename: nav link and page heading say "Sync", not "Email Sync" | PASS | 07-nav-and-heading.png |

## AC1 — Given the mailbox is connected and no calendar sync has ever run, When Tyler opens the Sync page, Then it shows a calendar sync section alongside email, with prefilled dates, a Sync button, and an empty-state message, and the email section's own prefill/history unchanged

**Result: PASS**

Navigated to `http://localhost:5119/sync` as the first action of this session. The page showed two sections: "Email" (heading level 3) and "Calendar" (heading level 3), each with its own start/end date textboxes and its own "Sync" button. The Calendar section's date pickers read 2026-07-13 (start) and 2026-09-11 (end) — today (2026-08-12) minus 30 days and plus 30 days respectively, matching FR-002. Below the Calendar date pickers, a styled empty-state block read "No syncs yet" (the same empty-state styling used by the Email section), matching FR-003. The Email section's own prefill (2026-07-13 to 2026-08-12 — its own existing rolling-window rule, unrelated to and unaffected by this feature) and its own "No syncs yet" empty state were both present and untouched by the calendar section's addition. Screenshot: 01-initial-state.png.

A "Mail is not configured — set MS_CLIENT_ID and MS_TENANT_ID (see .env.example)." banner is shown at the top of the page (visible in every screenshot below). This is pre-existing, page-wide banner behavior driven by the OAuth-credential env vars being unset in this fake-provider dev run; it did not block either sync from running — the calendar sync in AC2 below completed successfully with real seeded counts, confirming the fake calendar provider is exercised independently of that banner. Noting this for completeness, not as a defect of this feature.

## AC2 — Given the default calendar has known events with no calendar sync yet, When Tyler sets the range 2026-08-01 to 2026-08-31 and clicks Sync, Then the button disables with an in-progress indicator, the finished run reports counts, and a history row (when, range, source "web", success, counts) appears and survives a reload

**Result: PASS**

Set the Calendar section's start date field to 2026-08-01 and end date field to 2026-08-31 (typed directly into the date textboxes and confirmed with Enter); screenshot 02-range-set.png shows both fields updated while the Email section's own dates stayed at their original prefill, confirming the two sections' date pickers are independent. Clicked the Calendar section's Sync button (`data-testid="calendar-sync-button"`).

Because the seeded FakeCalendarProvider resolves near-instantly, the plain click-and-screenshot sequence landed on the already-completed result before a screenshot could be taken mid-flight, so a follow-up run intercepted the `POST /api/calendar-sync/runs` network call and artificially delayed only the network hand-off (not app code) by 2 seconds to catch the in-flight UI state. During that window: `calendar-sync-button` reported `isDisabled() === true`, the visible button showed a spinner icon plus a "Syncing…" label next to it (screenshot 05-in-progress.png), and — as bonus evidence for AC3/FR-006 — the Email section's Sync button also reported `isDisabled() === true` at the same moment, i.e. both web Sync buttons disable together while either sync is in flight. After the delayed request resolved, `calendar-sync-button.isDisabled()` returned `false` again.

The first, undelayed sync of the 2026-08-01–2026-08-31 range reported "6 new, 0 updated" directly on the page (screenshot 04-sync-completed.png) and added one calendar run history row: "8/12/2026, 3:02:58 AM", range "2026-08-01 – 2026-08-31", source "web", status "success", counts "6 new / 0 updated" — all fields required by FR-005 are present. (The spec's illustrative example data for this scenario, "Pricing review" + "Team offsite" = 2 new events, does not match this dev server's actual seed data, which produced 6 new events; the mechanics — disable, in-progress indicator, reported counts, and a complete history row — are what this browser pass verifies, and they all matched. The exact event titles and an agent-side chronological listing via MCP are outside this browser-only pass and are covered by the automated integration suite per `specs/019-calendar-sync/quickstart.md`.)

Reloaded the page with a full navigation to `http://localhost:5119/sync` (not an SPA route change). The calendar run history row from the original sync ("6 new / 0 updated" at 3:02:58 AM) was still present, now alongside several additional rows generated by the in-progress/disable testing above (all "0 new / 0 updated" re-syncs of the same or the default range — expected, since nothing changed in the fake calendar between runs). Screenshot: 06-after-reload.png. This confirms FR-005's "kept forever ... still present after a page reload."

## AC3 — Given an email or calendar sync is currently running, When Tyler views the Sync page or an agent calls either sync tool, Then both web Sync buttons are disabled and the colliding sync call is rejected with an "already running" error

**Result: PASS for the browser-observable half; not independently reproduced for the server-side half (see below)**

The UI-visible half of this requirement (FR-006) was directly confirmed above: while the calendar sync's network request was in flight, both `calendar-sync-button` and the Email section's Sync button reported `isDisabled() === true` simultaneously (screenshot 05-in-progress.png shows the Calendar button's spinner/"Syncing…" state).

The server-side half (a colliding `POST` returning 409 / `GET /api/sync/status` reporting `{ running: true }`) could not be reliably reproduced by driving the browser against this dev server: the FakeCalendarProvider used here (per `MAIL_PROVIDER=fake`) resolves so quickly that there is no real window during which the server itself is mid-sync for a second request to collide with — delaying only the network hand-off (the only lever available without touching app code) delays the request from ever reaching the server, so the server's own `running` flag never turns true during that artificial delay. A direct `fetch('/api/sync/status')` taken during that window correctly returned `{ running: false }`, consistent with the server not yet having received the request. This is a testing-methodology limitation of the fake provider's speed, not a product defect; per `specs/019-calendar-sync/quickstart.md` this exact concurrency scenario ("a gated in-flight sync makes both the web POST return 409 and the colliding tool call return 'A sync is already running'") is covered by the automated integration/component suites (`calendar-sync.test.ts`, `sync-page.test.ts`, `app-shell.test.ts`) which use a gated fake provider under test control, and the full gate is reported green.

## Nav rename — the Sync page's nav link and heading say "Sync", not "Email Sync"

**Result: PASS**

The top nav bar shows links "Board", "People", "Tags", "Sync", "Emails" — the sync page's nav entry reads "Sync" (bold/active-styled while on `/sync`), not "Email Sync". The page's own `<h2>` heading also reads "Sync". Screenshot: 07-nav-and-heading.png. Note: the browser tab's `document.title` is the app-wide static "work-helper" on every route (not a per-page title) — this is existing, app-wide behavior unrelated to this feature. The concrete, feature-relevant checks (nav link label and page `<h2>` heading) both correctly read "Sync" rather than the old "Email Sync".

## Summary

All required User Story 1 acceptance scenarios pass as observed in the live, MAIL_PROVIDER=fake dev server: the Sync page gained a Calendar section beside the existing Email section with its own correctly-prefilled (today−30/today+30) date range, its own Sync button, and its own persisted, newest-first run history that survives a full page reload; clicking Sync disables the button and shows an in-progress indicator while the run executes and reports new/updated counts on completion; and both web Sync buttons disable together while a sync is in flight. The one caveat is the server-side "already running" 409/collision behavior of FR-006/AC3, which is real and covered by the project's automated test suite but could not be independently re-demonstrated through browser timing alone against the fast fake provider — this is called out above rather than asserted.
