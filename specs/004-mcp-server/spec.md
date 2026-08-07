# Feature Specification: MCP Server

**Feature Branch**: `004-mcp-server`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-server.md — As Tyler, I want work-helper to expose its MCP server behind a simple password gate so that I can connect Claude Desktop to my CRM from anywhere and ask it about — and capture — tasks, notes, and people, without opening the app."

## Clarifications

### Session 2026-08-06

- Q: Should three failed password attempts lock out everyone, or just the offender? → A: Per-IP, not global — a stranger's three bad guesses lock out only their IP; Tyler's access from a different IP is unaffected. Lockouts persist until a server restart clears them, and restart is deliberately the only clearing mechanism.
- Q: How is this feature accepted, given Claude Desktop can't be driven by automated browser testing? → A: Automated acceptance drives the endpoint with a scripted MCP client plus the browser for the password page; connecting the real Claude Desktop app is Tyler's manual acceptance step.
- Q: What deployment context does the per-IP lockout depend on? → A: The server sits on the public internet behind Caddy as a reverse proxy handling TLS termination, so the app sees client IPs via the proxy's forwarded headers.
- Q: Must the password page be built with Vue like the rest of the frontend? → A: No — Tyler signed off on a standalone server-rendered HTML page: it is OAuth redirect plumbing, not app UI, and the Vue rule continues to govern the SPA (approved 2026-08-06, research D7).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a client through the password gate (Priority: P1)

Tyler points an MCP client (ultimately Claude Desktop) at his work-helper server. As part of connecting, a password page opens in his browser; he enters the connector password configured in the server's environment, the page reports success, and the client finishes connecting — from then on the client can see and call the server's tools.

**Why this priority**: This is the gateway to everything else. The server sits on the public internet, so no tool may be reachable without the gate — and without a completed connection, no other story can even start.

**Independent Test**: Can be fully tested with a scripted MCP client that begins connecting, a browser that completes the password page, and a follow-up call listing the server's tools. Delivers the "connect from anywhere" value on its own.

**Acceptance Scenarios**:

1. **Given** the work-helper server is running with connector password "correct-horse-battery" configured in its environment, **When** an MCP client begins connecting and Tyler enters "correct-horse-battery" on the password page that opens in the browser, **Then** the page reports success and the client finishes connecting — a follow-up call listing the server's tools succeeds.
2. **Given** the password page has been opened by a connecting MCP client, **When** a wrong password is entered once, **Then** the page shows an error message and allows a retry, and entering the correct password on the next attempt completes the connection normally.
3. **Given** an MCP client that has never completed the password page, **When** it attempts to call any tool, **Then** the call is refused as unauthorized — no tool is reachable without passing the gate.

---

### User Story 2 - Ask about the board, tasks, and people (Priority: P2)

With a connected client, Tyler asks his assistant what's on his board, what the story is on a given task, or who a person is. The assistant answers using read tools: listing the board's lanes and tasks, fetching a task's full detail (notes and linked people included), and searching and fetching people.

**Why this priority**: Reading is the core daily value — "ask my CRM from anywhere". It builds on the connection from User Story 1 but delivers the first real payoff.

**Independent Test**: Can be fully tested by seeding known tasks, notes, and people, then having an authorized scripted client call each read tool and comparing responses against the seeded data.

**Acceptance Scenarios**:

1. **Given** the configured lanes To Do, In Progress, Waiting, Done, with a task "Follow up with Sam" in To Do and a task "Draft Q3 goals" in In Progress (seeded via test setup, since the UI can't move cards between lanes yet), **When** an authorized agent calls the tool that lists the board, **Then** the response contains all four lanes in configured order, with "Follow up with Sam" under To Do and "Draft Q3 goals" under In Progress.
2. **Given** a task "Prep board deck" with a note "Kickoff call went well" added through the UI and a linked person "Sam Rivera", **When** an authorized agent fetches that task's detail, **Then** the response includes the task's title, its lane, the note's text with its timestamp and a source identifying it as UI-added, and "Sam Rivera" as a linked person.
3. **Given** people "Sam Rivera" (email "sam.rivera@example.com", phone "555-0100", extra config field Nickname "Sammy") and "Ana Alvarez" (email "ana.alvarez@example.com") exist, **When** an authorized agent searches people for "sam" and then fetches Sam Rivera's detail, **Then** the search returns Sam Rivera with name and email (and not Ana Alvarez), and the detail includes first name, last name, email, phone, and Nickname "Sammy".

---

### User Story 3 - Capture tasks and notes from a conversation (Priority: P3)

Mid-conversation, Tyler tells his assistant "add a task to book the venue" or "note on the board-deck task: budget numbers arrived". The assistant uses the create-task and add-note tools, and the result shows up in the web app exactly as if captured there — labeled so Tyler can see it came in via MCP.

**Why this priority**: Capture is the second half of the user story ("and capture"), turning the connector from read-only reporting into a working inbox. It depends on the read/connection stories but the feature is already useful without it.

**Independent Test**: Can be fully tested by having an authorized scripted client create a task with an initial note and add a note to an existing task, then verifying both in the web app's UI before and after a page reload.

**Acceptance Scenarios**:

1. **Given** the board has no task titled "Book venue", **When** an authorized agent calls the create-task tool with title "Book venue" and initial note "Requested during planning chat", **Then** a card "Book venue" appears in the To Do lane in the web app and its detail view shows the note labeled "via MCP" — both still present after a page reload.
2. **Given** a task "Prep board deck" whose detail view shows one note labeled "You", **When** an authorized agent calls the add-note tool on that task with text "Budget numbers arrived", **Then** the task's detail view shows "Budget numbers arrived" as the newest note, labeled "via MCP", above the existing note — and it is still there after a page reload.
3. **Given** an authorized agent, **When** it calls the create-task tool with a whitespace-only title, **Then** the tool call fails with a validation error saying a title is required, and no new card appears on the board.

---

### User Story 4 - Lock out password guessing, per IP (Priority: P4)

A stranger who finds the password page gets three consecutive wrong guesses before their IP is locked out of password entry entirely — while Tyler, connecting from a different IP, is never affected. A server restart is the one and only way a lockout clears.

**Why this priority**: The gate from User Story 1 already keeps unauthorized clients out; this hardens it against brute-force guessing on the open internet. It's essential before real-world exposure but testable and buildable strictly after the gate exists.

**Independent Test**: Can be fully tested by scripting wrong-password attempts from one IP until locked, verifying refusal (even with the correct password), verifying success from a second IP, then restarting the server and verifying the locked IP works again.

**Acceptance Scenarios**:

1. **Given** the password page has been opened by a connecting MCP client, **When** a visitor at one IP address enters a wrong password three times in a row ("guess-one", "guess-two", "guess-three"), **Then** the first two attempts each show an error message and allow a retry, and the third locks password entry for that IP — every subsequent attempt from it, including one with the correct password, is refused with a message saying password entry is locked, while an attempt with the correct password from a different IP address still succeeds.
2. **Given** password entry is locked for Tyler's IP address after three consecutive failed attempts, **When** the work-helper server is restarted and he enters the correct password from that same IP, **Then** the attempt succeeds and the client finishes connecting (restarting the server is the only way to clear a lockout).

---

### User Story 5 - Revoke access by changing the password (Priority: P5)

If Tyler ever suspects the password leaked, he changes it in the server's environment and restarts: every previously connected client is cut off at its next tool call and must re-authenticate with the new password. A restart alone — password unchanged — disturbs nothing: connected clients keep working without ever seeing the password page again.

**Why this priority**: This is the feature's entire revocation story (there is deliberately no connection-management UI), plus the stability guarantee that routine restarts don't force re-authentication. It matters for trust in daily use but only once connections exist to revoke or preserve.

**Independent Test**: Can be fully tested by connecting a scripted client, restarting the server with the password unchanged (tool calls keep succeeding, no password page), then restarting with a new password (next tool call rejected, reconnection demands the new password and refuses the old one).

**Acceptance Scenarios**:

1. **Given** an MCP client is connected and its tool calls are succeeding, **When** the server restarts with the password unchanged, **Then** the client's tool calls keep succeeding without the password page ever reappearing.
2. **Given** an MCP client is connected and its tool calls are succeeding, **When** the connector password is changed in the server's environment and the server restarts, **Then** the client's next tool call is rejected as unauthorized, and reconnecting opens the password page, where only the new password grants access.

---

### Edge Cases

- Two wrong password attempts followed by a correct one succeed and reset that IP's failure count — the lockout counts *consecutive* failures, so an IP is never locked by accumulated old mistakes.
- The lockout applies to password entry only: locking an IP out of the password page never interrupts tool calls from a client that already holds a valid connection.
- A lockout at a stranger's IP must never lock Tyler out — there is deliberately no global lockout, no matter how many IPs are individually locked.
- If no connector password is configured in the server's environment, the connector refuses all connection attempts rather than ever allowing passwordless access.
- Searching people with a term matching nobody returns an empty result, not an error.
- Fetching detail for a task or person that doesn't exist, or adding a note to a task that doesn't exist, fails with a clear not-found error and changes nothing.
- Calling add-note with empty or whitespace-only text fails with a validation error saying note text is required — mirroring the web app's own rule — and no note is created.
- Calling create-task with a valid title and no initial note creates the card in the first configured lane with an empty notes section.
- Several clients connected with the same password (e.g. Claude Desktop on two machines) each work independently; revocation by password change cuts off all of them at once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose its data and capture operations as tools that any standards-compliant MCP client can connect to and call.
- **FR-002**: Completing a connection MUST require entering the connector password on a password page that opens in the browser as part of the client's connection flow — this page is the feature's only new UI.
- **FR-003**: The connector password MUST be a single shared secret read from the server's environment configuration; changing it takes effect on server restart.
- **FR-004**: Entering the correct password MUST make the page report success and allow the client to finish connecting; a subsequent call listing the server's tools succeeds.
- **FR-005**: Entering a wrong password MUST show an error message on the page and allow a retry, subject to the lockout rule.
- **FR-006**: The system MUST count consecutive failed password attempts per originating IP address; a successful entry resets that IP's count.
- **FR-007**: A third consecutive failed attempt from one IP MUST lock password entry for that IP: every subsequent attempt from it — including one with the correct password — is refused with a message saying password entry is locked.
- **FR-008**: A lockout MUST be scoped to the offending IP only; attempts from any other IP are judged solely on their own history, and there is no global lockout under any circumstances.
- **FR-009**: A server restart MUST clear all lockouts, and MUST be the only mechanism that clears them.
- **FR-010**: Connections MUST survive a server restart when the password is unchanged: the client's tool calls keep succeeding and the password page never reappears.
- **FR-011**: Changing the password and restarting MUST invalidate every previously established connection: the client's next tool call is rejected as unauthorized, reconnecting opens the password page, and only the new password grants access.
- **FR-012**: Every tool call MUST be refused as unauthorized unless it arrives over a validly established connection.
- **FR-013**: A board-listing tool MUST return all configured lanes in configured order, each with the tasks currently in it.
- **FR-014**: A task-detail tool MUST return the task's title, its lane, all of its notes — each with text, timestamp, and a source distinguishing UI-added from MCP-added — and its linked people.
- **FR-015**: A people-search tool MUST return only the people matching the search term, each with name and email.
- **FR-016**: A person-detail tool MUST return the person's first name, last name, email, phone, and every extra configured field with its value.
- **FR-017**: A create-task tool MUST accept a required title and an optional initial note, create the task in the first configured lane, and persist it so the card and its note appear in the web app and survive a page reload; the initial note carries the MCP source.
- **FR-018**: An add-note tool MUST add a note to an existing task, persisted so it appears in the web app's detail view as the newest note, labeled with the MCP source, and survives a page reload.
- **FR-019**: The create-task tool MUST reject an empty or whitespace-only title with a validation error saying a title is required, creating nothing; the add-note tool MUST likewise reject empty or whitespace-only note text.
- **FR-020**: Data read or written through tools MUST be the same live data the web app shows — a capture via MCP is immediately visible in the UI with no separate copy or sync step.

### Key Entities

- **Connector password**: The single shared secret, held in the server's environment, that gates all MCP access. Changing it (plus a restart) is the feature's entire revocation mechanism; there are no per-client credentials or user accounts.
- **Client connection**: An MCP client's authorized link to the server, established by passing the password page. It lives until the password changes — surviving restarts with an unchanged password, with no auto-expiry.
- **Lockout record**: Per-IP state tracking consecutive failed password attempts and whether that IP is locked. Exists only while the server runs; a restart clears all of it by design.
- **Task, Note, Person, Lane** *(existing)*: Exposed read-only through the board, task, and people tools — except that tasks gain MCP as a second creation source and notes gain their first real "via MCP" source (reserved by the task-notes feature, exercised for real here).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an unconnected client on any network, Tyler reaches a working connection — password entry included — in under a minute, with exactly one password entry and no other credentials or accounts involved.
- **SC-002**: 100% of tool calls made without a validly established connection are refused; none of the CRM's data can be read or changed without passing the password gate.
- **SC-003**: A password guesser at one IP gets at most three attempts before that IP is locked, and a lockout at one IP blocks zero attempts from any other IP.
- **SC-004**: 100% of tasks and notes captured through an assistant conversation appear in the web app, correctly sourced as MCP-added, and survive a page reload.
- **SC-005**: Answers an assistant gives about the board and people match the web app exactly — same lanes in the same order, same tasks in the same lanes, same person fields — with zero discrepancies across the acceptance data set.
- **SC-006**: After a password change and restart, zero previously connected clients can complete another tool call without re-authenticating with the new password; after a restart with the password unchanged, zero connected clients are asked to re-authenticate.
- **SC-007**: Capturing a task or note from a conversation requires zero interactions with the web app — the app is only ever opened to verify, never to complete the capture.

## Assumptions

- The server is deployed on the public internet behind a reverse proxy (Caddy) that terminates TLS and forwards the original client's IP address; the per-IP lockout depends on those forwarded addresses and trusts the proxy to supply them accurately (deployment context confirmed with Tyler, 2026-08-06).
- One shared password with no per-client credentials: anyone who completes the password page acts with Tyler's full access. This is an accepted consequence of the single-user, self-hosted design.
- "The page reports success" is realized as the OAuth redirect: on a correct password the server responds by redirecting the browser to the client's registered callback, and the connecting client (e.g. Claude Desktop) shows its own success confirmation — work-helper renders no separate success page.
- MCP-created tasks always land in the first configured lane ("To Do" in the current configuration) because the UI cannot move cards between lanes yet; lane choice arrives with the `move-task-between-lanes` work.
- Note source labels follow the task-notes feature: "You" for UI-added, "via MCP" for MCP-added. Exact label copy is pinned for testability; Tyler may adjust wording at acceptance without this counting as a spec change.
- People search matches the same way the web app's people feature searches (the pinned scenario only requires that "sam" finds Sam Rivera and not Ana Alvarez); search results deliberately carry just name and email, with everything else behind the detail tool.
- Lockout state and connection validity are tied to the running server and current password by design: no session auto-expiry, no persistence of lockouts across restarts, and restart-after-password-change as the documented revocation lever. These are product decisions, not gaps.
- Automated acceptance drives the MCP endpoint with a scripted MCP client plus the browser for the password page; connecting the real Claude Desktop app is Tyler's manual acceptance step, since Claude Desktop itself can't be driven by the browser-tester (confirmed 2026-08-06).
- Out of scope, per the feature interview (2026-08-06): write tools beyond create-task and add-note — linking/unlinking people, deleting notes, editing or moving tasks, creating or editing people (split to the `mcp-tool-expansion` stub); an edit-note tool (permanent non-goal — notes are delete-only by the task-notes decision, and even deletion isn't in this slice); tag tools (tags aren't a built feature yet); email tools (no emails exist until `email-ingestion` ships); lane selection on create or moving tasks via MCP; connection-management UI (revocation is changing the password and restarting); multiple passwords, per-client identities, or user accounts; abuse protections beyond the per-IP lockout (no CAPTCHAs, global rate limits, or fail2ban-style bans — and deliberately no global lockout); session auto-expiry; MCP resources or prompts (tools only).
