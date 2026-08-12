# Feature: mcp-move-tasks

## User story

As Tyler, I want AI agents to move and position kanban cards through the work-helper MCP — and to create tasks directly into a chosen lane — so that I can keep the board current from a conversation ("I finished the proposal") and agents can file the tasks they create into the right lane instead of everything piling up in To Do.

## Acceptance criteria

The configured lanes are To Do, In Progress, Waiting, Done (from the lane config file). "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. Positions are numeric and 1-based: position 1 is the top of a lane, matching the top-to-bottom order shown by the board-listing tool. All card titles are illustrative concrete test data.

- **Given** To Do contains "Follow up with Sam" and In Progress contains, top to bottom: "Write proposal", "Review budget"
  **When** an authorized agent calls the move tool on "Follow up with Sam" with destination lane In Progress and no position
  **Then** In Progress shows, top to bottom: "Write proposal", "Review budget", "Follow up with Sam" — the card lands at the bottom, appears in no other lane, and the web app board shows the same after a page reload

- **Given** To Do contains "Draft Q3 goals" and In Progress contains, top to bottom: "Write proposal", "Review budget"
  **When** an authorized agent moves "Draft Q3 goals" to In Progress at position 2
  **Then** In Progress shows, top to bottom: "Write proposal", "Draft Q3 goals", "Review budget" — and the board-listing tool and the web app board both show this order

- **Given** To Do contains, top to bottom: "Book venue", "Order catering", "Send invites"
  **When** an authorized agent moves "Send invites" within To Do to position 1
  **Then** To Do shows, top to bottom: "Send invites", "Book venue", "Order catering" — and this order survives a page reload in the web app

- **Given** Waiting contains, top to bottom: "Chase invoice", "Await contract", "Ping vendor"
  **When** an authorized agent moves "Chase invoice" to Waiting at position 10
  **Then** the call succeeds, Waiting shows, top to bottom: "Await contract", "Ping vendor", "Chase invoice" — the position clamps to the bottom — and the tool response states the position the card actually landed at (3)

- **Given** a card "Follow up with Sam" in To Do
  **When** an authorized agent calls the move tool with destination lane "Doing" (not a configured lane)
  **Then** the call fails with a validation error naming the valid lanes, and the board is unchanged — "Follow up with Sam" is still in To Do

- **Given** the board in any state
  **When** an authorized agent calls the move tool with a task identifier that matches no task
  **Then** the call fails with an error saying the task was not found, and no card on the board changes lane or position

- **Given** Waiting contains, top to bottom: "Chase invoice", "Await contract"
  **When** an authorized agent calls the create-task tool with title "Confirm venue hold" and lane Waiting
  **Then** a card "Confirm venue hold" appears at the bottom of Waiting — top to bottom: "Chase invoice", "Await contract", "Confirm venue hold" — in both the board-listing tool and the web app board after a page reload

- **Given** To Do contains, top to bottom: "Book venue", "Order catering"
  **When** an authorized agent calls the create-task tool with title "Send invites" and no lane
  **Then** the card appears at the bottom of To Do, top to bottom: "Book venue", "Order catering", "Send invites" — the existing default is unchanged

- **Given** the board in any state
  **When** an authorized agent calls the create-task tool with title "Book venue" and lane "Doing" (not a configured lane)
  **Then** the call fails with a validation error naming the valid lanes, and no new card appears anywhere on the board

## Out of scope

- A lane picker in the UI's create-task flow — deliberate decision, not a deferral: UI-created tasks keep landing at the bottom of the first configured lane; lane choice on create is MCP-only.
- A position parameter on create-task — declined: create places the card at the bottom of the chosen lane; an agent that needs a specific position moves the card afterward.
- Relative positioning ("above/below task X") — declined: numeric 1-based positions only.
- Bulk or multi-card moves — one card per call.
- An audit trail for MCP moves (e.g. an automatic "moved via MCP" note) — declined in the interview.
- Any change to the board-listing or get-task response shapes — they already reflect lane and order; this feature only makes agents able to change them.
- The rest of the `mcp-tool-expansion` stub (link/unlink person on a task, delete-note, tag write tools, free-text email/event search) — still deferred there.

## Open questions

All interview questions were resolved with Tyler (2026-08-12):

- Scope: full parity with the UI drag — lane moves and within-lane reordering.
- Default landing spot when no position is given: bottom of the destination lane.
- Positioning contract: numeric, 1-based, matching the board listing's top-to-bottom order; positions past the end of a lane clamp to the bottom (the response reports where the card actually landed) rather than erroring.
- create-task grows an optional lane (MCP only; omitted → existing first-lane default), always appending at the bottom.
- Done bar: cards move/create correctly, changes visible in the web UI and board listing, validation errors on bad input — no audit trail.
- None remaining — ready for `/speckit-specify`.
