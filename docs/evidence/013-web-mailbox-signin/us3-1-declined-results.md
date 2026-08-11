# US3-1 Evidence: Declined/Expired Sign-In Attempt

Feature: 013-web-mailbox-signin, User Story 3

## Scenario

**Given** a pending Connect attempt
**When** the sign-in is declined or the code expires on Microsoft's side
**Then** the panel reports the failure with the error from Microsoft and offers Connect again

## Test environment

- UI: http://localhost:5113/sync
- API: http://localhost:3013
- Started with MAIL_AUTH=fake-decline MAIL_PROVIDER=fake npm run dev
- Clean, never-signed-in state confirmed before testing via GET /api/mailbox returning {"state":"not-connected","reason":"never-signed-in"}

## Steps and results

### Step 1: Not-connected state

Navigated to /sync. Panel showed "Not connected" (data-testid=mailbox-not-connected) with text "Not connected" and a Connect button (data-testid=mailbox-connect). Confirmed both elements present via DOM query.

Result: PASS

### Step 2: Click Connect -> pending state

Clicked Connect. Panel updated to show the pending state (data-testid=mailbox-pending) containing:
- verification link (data-testid=mailbox-verification-link) -> https://microsoft.com/devicelogin (target=_blank)
- user code (data-testid=mailbox-code) -> "FAKE-CODE"
- copy control (data-testid=mailbox-copy-code) -> "Copy code" button
- waiting indicator text "Waiting for sign-in..."

Screenshot: us3-1-pending.png

Result: PASS

### Step 3: Auto-decline after ~2s, panel updates via poll without reload

Waited ~3 seconds without reloading the page. The panel's status poll picked up the decline and updated to show:
- error state (data-testid=mailbox-error) with exact text: "AADSTS70016: The user declined the device-code sign-in request."
- Connect button (data-testid=mailbox-connect) present again to retry
- pending state (data-testid=mailbox-pending) no longer present

This is the primary evidence for US3-1.

Screenshot: us3-1-declined-error.png

Result: PASS

### Step 4: Click Connect again -> fresh pending state (recovery, FR-006)

Clicked Connect again after the error state. A new pending state appeared (data-testid=mailbox-pending visible again, code "FAKE-CODE"), confirming a fresh device-code attempt starts and recovery works.

Screenshot: us3-1-retry-pending.png

Result: PASS

## Overall verdict: PASS

All four steps of scenario US3-1 passed. The panel correctly transitions Not connected -> Pending -> Declined error (via its ~3s status poll, no page reload) -> Pending again on retry. The exact Microsoft decline text shown was: "AADSTS70016: The user declined the device-code sign-in request."
