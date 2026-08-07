# Feature: mcp-server

## User story

As Tyler, I want work-helper to expose its MCP server behind a simple password gate so that I can connect Claude Desktop to my CRM from anywhere and ask it about — and capture — tasks, notes, and people, without opening the app.

## Acceptance criteria

- **Given** the work-helper server is running with connector password "correct-horse-battery" configured in its environment
  **When** an MCP client begins connecting and I enter "correct-horse-battery" on the password page that opens in the browser
  **Then** the page reports success and the client finishes connecting — a follow-up call listing the server's tools succeeds

- **Given** the password page has been opened by a connecting MCP client
  **When** a visitor at one IP address enters a wrong password three times in a row ("guess-one", "guess-two", "guess-three")
  **Then** the first two attempts each show an error message and allow a retry, and the third locks password entry for that IP — every subsequent attempt from it, including one with the correct password, is refused with a message saying password entry is locked, while an attempt with the correct password from a different IP address still succeeds

- **Given** password entry is locked for my IP address after three consecutive failed attempts
  **When** the work-helper server is restarted and I enter the correct password from that same IP
  **Then** the attempt succeeds and the client finishes connecting (restarting the server is the only way to clear a lockout)

- **Given** an MCP client is connected and its tool calls are succeeding
  **When** the connector password is changed in the server's environment and the server restarts
  **Then** the client's next tool call is rejected as unauthorized, and reconnecting opens the password page, where only the new password grants access

- **Given** an MCP client is connected and its tool calls are succeeding
  **When** the server restarts with the password unchanged
  **Then** the client's tool calls keep succeeding without the password page ever reappearing

- **Given** the configured lanes To Do, In Progress, Waiting, Done, with a task "Follow up with Sam" in To Do and a task "Draft Q3 goals" in In Progress (seeded via test setup, since the UI can't move cards between lanes yet)
  **When** an authorized agent calls the tool that lists the board
  **Then** the response contains all four lanes in configured order, with "Follow up with Sam" under To Do and "Draft Q3 goals" under In Progress

- **Given** a task "Prep board deck" with a note "Kickoff call went well" added through the UI and a linked person "Sam Rivera"
  **When** an authorized agent fetches that task's detail
  **Then** the response includes the task's title, its lane, the note's text with its timestamp and a source identifying it as UI-added, and "Sam Rivera" as a linked person

- **Given** people "Sam Rivera" (email "sam.rivera@example.com", phone "555-0100", extra config field Nickname "Sammy") and "Ana Alvarez" (email "ana.alvarez@example.com") exist
  **When** an authorized agent searches people for "sam" and then fetches Sam Rivera's detail
  **Then** the search returns Sam Rivera with name and email (and not Ana Alvarez), and the detail includes first name, last name, email, phone, and Nickname "Sammy"

- **Given** the board has no task titled "Book venue"
  **When** an authorized agent calls the create-task tool with title "Book venue" and initial note "Requested during planning chat"
  **Then** a card "Book venue" appears in the To Do lane in the web app and its detail view shows the note labeled "via MCP" — both still present after a page reload

- **Given** a task "Prep board deck" whose detail view shows one note labeled "You"
  **When** an authorized agent calls the add-note tool on that task with text "Budget numbers arrived"
  **Then** the task's detail view shows "Budget numbers arrived" as the newest note, labeled "via MCP", above the existing note — and it is still there after a page reload

- **Given** an authorized agent
  **When** it calls the create-task tool with a whitespace-only title
  **Then** the tool call fails with a validation error saying a title is required, and no new card appears on the board

## Out of scope

- Write tools beyond create-task and add-note — linking/unlinking people, deleting notes, editing or moving tasks, creating or editing people through MCP. Tyler chose the read + capture tier for this slice; the rest is split to the `mcp-tool-expansion` stub.
- An edit-note tool — permanent non-goal: notes are delete-only by the task-notes decision, and even deletion isn't in this slice.
- Tag tools — tags aren't a built feature yet; MCP tag tools wait for a tags feature.
- Email tools — no emails exist until email ingestion ships (see the `email-ingestion` stub).
- Lane selection on create, or moving tasks via MCP — MCP mirrors the UI, which can't move cards yet (see the `move-task-between-lanes` stub); MCP-created tasks always land in the first configured lane.
- Connection-management UI (listing or revoking connected clients) — by decision, revocation is changing the password and restarting; the password page is this feature's only new UI.
- Multiple passwords, per-client identities, or user accounts — one shared password, stored in the server's environment.
- Abuse protections beyond the per-IP lockout (CAPTCHAs, global rate limits, fail2ban-style bans) — and there is deliberately no global lockout: a stranger's failed guesses must never lock Tyler out.
- Session auto-expiry — a connection lives until the password changes.
- MCP resources or prompts — tools only in this slice.

## Open questions

All interview questions were resolved with Tyler (2026-08-06):

- Lockout scope: per-IP, not global — a stranger's three bad guesses lock out only their IP; Tyler's access from a different IP is unaffected. Lockouts persist until a server restart clears them.
- Confirmed: automated acceptance drives the MCP endpoint with a scripted MCP client plus the browser for the password page; connecting the real Claude Desktop app is Tyler's manual acceptance step, since Claude Desktop itself can't be driven by the browser-tester.
- Deployment context for `/speckit-plan`: the server sits on the public internet behind Caddy as a reverse proxy handling TLS termination — so the app sees client IPs via the proxy's forwarded headers, which the per-IP lockout depends on.
- None remaining — ready for `/speckit-specify`.
