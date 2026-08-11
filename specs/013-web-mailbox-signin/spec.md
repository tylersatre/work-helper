# Feature Specification: web-mailbox-signin

**Feature Branch**: `013-web-mailbox-signin`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Approved product spec at docs/product/features/web-mailbox-signin.md — connect and reconnect the Outlook mailbox from the web UI via a device-code panel on the Sync page, replacing the CLI-only sign-in as the primary path."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect the mailbox from the browser (Priority: P1)

Tyler opens the Email Sync page, clicks Connect in a new mailbox panel, and the panel shows the Microsoft verification link and a short code right in the browser. He opens the link in a new tab, enters the code, finishes Microsoft's sign-in, and — without reloading — the panel flips to "Connected as tyler@example.com". No terminal, no host clone, no copying anything between machines.

**Why this priority**: This is the entire point of the feature — it removes the CLI-and-container friction that motivated it. Every other scenario decorates this one.

**Independent Test**: With a configured but never-signed-in server, complete a (simulated) device-code sign-in entirely through the Sync page and observe the panel reach the connected state.

**Acceptance Scenarios**:

1. **Given** mail is configured but no account has ever signed in, **When** Tyler opens the Email Sync page, **Then** the mailbox panel shows a "Not connected" state and a Connect button
2. **Given** the "Not connected" panel, **When** Tyler clicks Connect, **Then** the panel shows the Microsoft verification link (opening in a new tab), the user code with a copy control, and a waiting indicator — without leaving or reloading the page
3. **Given** a pending Connect attempt, **When** the sign-in completes on Microsoft's side as "tyler@example.com", **Then** the panel flips to "Connected as tyler@example.com" without a page reload
4. **Given** a completed sign-in, **When** the server restarts, **Then** the mailbox is still connected (the sign-in persists in the same store email sync reads)
5. **Given** a Connect attempt is pending with code "ABC-DEF-123", **When** Tyler clicks Connect again or reloads the page, **Then** the panel shows the same pending attempt with code "ABC-DEF-123" — no second sign-in flow is started

---

### User Story 2 - See true connection state at a glance (Priority: P2)

The mailbox panel always tells Tyler where he stands: not configured (with what's missing), not connected, or connected as his account — and "connected" means sync would actually work right now, not merely that a sign-in happened once.

**Why this priority**: Reconnection is only easy if you can tell you need it. An honest status readout is what turns sync failures from mysteries into a one-click fix, but it needs the connect flow (P1) to exist first.

**Acceptance Scenarios**:

1. **Given** the server is running without mail configured, **When** Tyler opens the Email Sync page, **Then** the panel says mail is not configured, names the settings needed to configure it, and offers no Connect button
2. **Given** a connected mailbox, **When** Tyler opens the Email Sync page, **Then** the panel shows "Connected as tyler@example.com" and a Disconnect button
3. **Given** a stored sign-in that is no longer valid (dead/expired), **When** Tyler opens the Email Sync page, **Then** the panel shows not connected — a present-but-dead stored sign-in never reads as connected

**Independent Test**: Seed each of the three states in test setup and confirm the panel renders the matching readout.

---

### User Story 3 - Recover from failure and disconnect (Priority: P3)

When a sign-in attempt is declined or its code expires, the panel says so with Microsoft's error and offers Connect again. When Tyler wants the account gone, Disconnect returns the panel to "Not connected" and stays that way.

**Why this priority**: Completes the lifecycle — failure recovery and teardown — but both are rare next to connect and status.

**Acceptance Scenarios**:

1. **Given** a pending Connect attempt, **When** the sign-in is declined or the code expires on Microsoft's side, **Then** the panel reports the failure with the error from Microsoft and offers Connect again
2. **Given** a connected mailbox, **When** Tyler clicks Disconnect, **Then** the panel returns to "Not connected", the removal survives a server restart, and a subsequent sync fails with the connect-the-mailbox message
3. **Given** mail is configured but not connected (or the sign-in has expired), **When** a sync is triggered from the web or by an agent, **Then** the recorded error tells Tyler to connect the mailbox on the Sync page — no error anywhere in the app tells him to run a CLI command
4. **Given** a mailbox that has never signed in versus one whose sign-in has expired, **When** each produces its error, **Then** the two are distinguishable in the error detail even though both lead to the same connect-the-mailbox action

---

### Edge Cases

- Server restarts while a Connect attempt is pending: the pending attempt is lost; the panel offers Connect again (a fresh code) rather than showing a stale one.
- The sign-in completes at Microsoft in the final seconds before the code expires: whichever result the panel reports (connected or expired) must match the stored outcome — no state where the panel says failed but the mailbox is connected.
- Mail configuration is present but invalid (e.g. wrong tenant): the failure surfaces on the Connect attempt with the provider's error; the panel does not pretend to be connected.
- Sync runs while a Connect attempt is pending: sync still fails with the connect-the-mailbox message; the pending attempt is unaffected.
- The legacy CLI sign-in is used while the web panel is open: the panel reflects the new connection on next status refresh — last completed sign-in wins.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Email Sync page MUST include a mailbox panel that always shows exactly one of three states: not configured, not connected, or connected as a named account.
- **FR-002**: In the not-configured state the panel MUST name the settings required to configure mail and MUST NOT offer a Connect action.
- **FR-003**: Connect MUST start a sign-in attempt and present the verification link (opening in a new tab), the user code with a copy control, and a waiting indicator, all without leaving or reloading the page.
- **FR-004**: At most one sign-in attempt MUST be pending at a time; requesting Connect while one is pending (including after a page reload) MUST resume that same attempt and code.
- **FR-005**: When the sign-in completes, the panel MUST reflect the connected account without a page reload.
- **FR-006**: When the sign-in is declined or expires, the panel MUST report the provider's error and offer Connect again.
- **FR-007**: The connected state MUST be verified by an actual token acquisition at status time; a stored sign-in that can no longer produce a token MUST read as not connected.
- **FR-008**: A completed sign-in MUST persist across server restarts, in the same store the email sync reads.
- **FR-009**: Disconnect MUST remove the stored account, return the panel to not connected, and persist that removal across server restarts.
- **FR-010**: Every sign-in-related sync error, on the web and through agent tools, MUST direct Tyler to connect the mailbox on the Sync page; no user-facing error may reference the CLI command.
- **FR-011**: The error detail for a mailbox that has never signed in MUST be distinguishable from one whose sign-in has expired.
- **FR-012**: The existing CLI sign-in MUST continue to work as a headless fallback, writing to the same store the web flow uses.

### Key Entities

- **Mailbox connection**: The single stored sign-in for Tyler's mailbox — its state (not configured / not connected / connected), the signed-in account name, and its persistence across restarts. Already persisted today; this feature adds web-visible state, not new storage.
- **Sign-in attempt**: A short-lived, in-progress connect flow — verification link, user code, expiry, and outcome (pending, succeeded, failed with provider error). At most one exists at a time; it does not survive a server restart.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can take the mailbox from never-signed-in to connected entirely in the browser in under 2 minutes, touching no terminal, no repository checkout, and no container.
- **SC-002**: Reconnecting after an expired sign-in requires only actions on the Sync page — zero server or shell access.
- **SC-003**: The panel's connected/not-connected readout agrees with whether a sync would actually reach the mailbox in 100% of the seeded test states (never signed in, valid, dead sign-in).
- **SC-004**: Zero user-facing error messages in the app reference the CLI sign-in command; all sign-in-related errors point to the Sync page.

## Assumptions

- Single user, single mailbox — no concurrent sign-in attempts from different people, and connecting a second account is unsupported (per the product spec's out-of-scope list).
- Automated checks run against a simulated device-code flow seeded by test setup; only Tyler's manual acceptance pass touches real Microsoft.
- A pending sign-in attempt is held in server memory only; losing it on restart is acceptable because retrying costs one click (documented as an edge case above).
- The sign-in mechanics (public client, device code, delegated read-only mail scopes, token store location and format) are unchanged from today; this feature relocates where sign-in starts and where the code is shown, nothing else.
- The panel lives on the existing Email Sync page; no new navigation entry is added.
