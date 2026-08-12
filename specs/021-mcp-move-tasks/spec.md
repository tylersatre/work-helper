# Feature Specification: MCP Move Tasks

**Feature Branch**: `021-mcp-move-tasks`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-move-tasks.md — AI agents move and position kanban cards through the work-helper MCP, and create tasks directly into a chosen lane."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent moves a card to another lane (Priority: P1)

Tyler tells an AI agent "I finished the proposal" in a conversation. The agent, acting as an authorized MCP client, moves the corresponding card to the appropriate lane. With no position given, the card lands at the bottom of the destination lane, and the change is visible both through the board-listing tool and on the web app board.

**Why this priority**: This is the core of the feature — keeping the board current from a conversation. Without lane moves, agents can only read the board and create cards, never update its state.

**Independent Test**: Can be fully tested by seeding a board, calling the move tool with a destination lane and no position, and confirming the card appears at the bottom of that lane (and nowhere else) in both the board-listing tool and the web app.

**Acceptance Scenarios**:

1. **Given** To Do contains "Follow up with Sam" and In Progress contains, top to bottom: "Write proposal", "Review budget", **When** an authorized agent calls the move tool on "Follow up with Sam" with destination lane In Progress and no position, **Then** In Progress shows, top to bottom: "Write proposal", "Review budget", "Follow up with Sam" — the card lands at the bottom, appears in no other lane, and the web app board shows the same after a page reload.

---

### User Story 2 - Agent positions a card precisely (Priority: P2)

An agent moves a card to a specific spot: into another lane at a given position, or within its current lane to reorder it. Positions are numeric and 1-based, matching the top-to-bottom order shown by the board-listing tool; a position past the end of a lane clamps to the bottom and the response reports where the card actually landed.

**Why this priority**: Full parity with the UI drag — lane moves plus within-lane reordering — is the agreed scope. Precise positioning lets agents keep the board's priority order meaningful, not just its lane membership.

**Independent Test**: Can be fully tested by seeding lanes with ordered cards, calling the move tool with explicit positions (mid-lane, position 1, and past-the-end), and confirming resulting order via the board-listing tool and the web app.

**Acceptance Scenarios**:

1. **Given** To Do contains "Draft Q3 goals" and In Progress contains, top to bottom: "Write proposal", "Review budget", **When** an authorized agent moves "Draft Q3 goals" to In Progress at position 2, **Then** In Progress shows, top to bottom: "Write proposal", "Draft Q3 goals", "Review budget" — and the board-listing tool and the web app board both show this order.
2. **Given** To Do contains, top to bottom: "Book venue", "Order catering", "Send invites", **When** an authorized agent moves "Send invites" within To Do to position 1, **Then** To Do shows, top to bottom: "Send invites", "Book venue", "Order catering" — and this order survives a page reload in the web app.
3. **Given** Waiting contains, top to bottom: "Chase invoice", "Await contract", "Ping vendor", **When** an authorized agent moves "Chase invoice" to Waiting at position 10, **Then** the call succeeds, Waiting shows, top to bottom: "Await contract", "Ping vendor", "Chase invoice" — the position clamps to the bottom — and the tool response states the position the card actually landed at (3).

---

### User Story 3 - Agent creates a task in a chosen lane (Priority: P3)

An agent files a new task directly into the right lane at creation time, instead of everything piling up in the first lane. The lane parameter is optional: when omitted, creation behaves exactly as it does today (bottom of the existing default lane). Created cards always land at the bottom of the chosen lane.

**Why this priority**: Valuable but less central than moving — an agent could work around its absence by creating then moving. It completes the story of agents filing work into the right place.

**Independent Test**: Can be fully tested by calling the create-task tool with and without a lane and confirming lane and bottom placement via the board-listing tool and the web app.

**Acceptance Scenarios**:

1. **Given** Waiting contains, top to bottom: "Chase invoice", "Await contract", **When** an authorized agent calls the create-task tool with title "Confirm venue hold" and lane Waiting, **Then** a card "Confirm venue hold" appears at the bottom of Waiting — top to bottom: "Chase invoice", "Await contract", "Confirm venue hold" — in both the board-listing tool and the web app board after a page reload.
2. **Given** To Do contains, top to bottom: "Book venue", "Order catering", **When** an authorized agent calls the create-task tool with title "Send invites" and no lane, **Then** the card appears at the bottom of To Do, top to bottom: "Book venue", "Order catering", "Send invites" — the existing default is unchanged.

---

### User Story 4 - Invalid input leaves the board untouched (Priority: P1)

An agent sends bad input — an unconfigured lane name or a task identifier that matches nothing. The call fails with a clear error (naming the valid lanes for lane errors; saying the task was not found for identifier errors), and the board is completely unchanged.

**Why this priority**: Agents are automated callers; without strict validation and no-partial-effect guarantees, a mistyped lane could silently corrupt the board Tyler relies on. Safety is as critical as the happy path.

**Independent Test**: Can be fully tested by calling the move and create-task tools with an invalid lane and the move tool with a nonexistent task identifier, then confirming the errors and that the board state is byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** a card "Follow up with Sam" in To Do, **When** an authorized agent calls the move tool with destination lane "Doing" (not a configured lane), **Then** the call fails with a validation error naming the valid lanes, and the board is unchanged — "Follow up with Sam" is still in To Do.
2. **Given** the board in any state, **When** an authorized agent calls the move tool with a task identifier that matches no task, **Then** the call fails with an error saying the task was not found, and no card on the board changes lane or position.
3. **Given** the board in any state, **When** an authorized agent calls the create-task tool with title "Book venue" and lane "Doing" (not a configured lane), **Then** the call fails with a validation error naming the valid lanes, and no new card appears anywhere on the board.

---

### Edge Cases

- Position past the end of a lane: clamps to the bottom; the response reports the actual landing position (see User Story 2, scenario 3).
- Moving a card within its own lane to its current position: succeeds as a no-op; the lane order is unchanged and the response reports the position the card occupies.
- Position below 1 (0 or negative) or non-integer: rejected as a validation error; the board is unchanged.
- Lane names are validated against the configured lanes (To Do, In Progress, Waiting, Done from the lane config file); an error names the valid lanes so the agent can self-correct.
- Moving a card to the lane it is already in with no position: lands at the bottom of that lane, consistent with the "no position → bottom of destination lane" rule.
- Unauthenticated or unauthorized MCP calls: rejected by the existing mcp-authentik-auth flow before reaching the tool; no board change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The work-helper MCP MUST offer a move tool that an authorized agent can call to move one existing task card to a configured destination lane.
- **FR-002**: The move tool MUST accept an optional numeric position; when no position is given, the card lands at the bottom of the destination lane.
- **FR-003**: Positions MUST be numeric and 1-based, where position 1 is the top of a lane, matching the top-to-bottom order shown by the board-listing tool.
- **FR-004**: The move tool MUST support within-lane reordering (destination lane equal to the card's current lane) with the same positioning rules, giving agents full parity with the UI drag.
- **FR-005**: A position past the end of the destination lane MUST clamp to the bottom, the call MUST succeed, and the tool response MUST state the position the card actually landed at.
- **FR-006**: After a move, the card MUST appear in exactly one lane — the destination — at the resulting position, with the relative order of all other cards preserved.
- **FR-007**: The move tool MUST reject a destination lane that is not a configured lane with a validation error naming the valid lanes, leaving the board unchanged.
- **FR-008**: The move tool MUST reject a task identifier that matches no task with an error saying the task was not found, leaving every card's lane and position unchanged.
- **FR-009**: The create-task tool MUST accept an optional lane; when given, the new card is created at the bottom of that lane.
- **FR-010**: When the create-task tool is called without a lane, behavior MUST be unchanged from today: the card lands at the bottom of the existing default lane.
- **FR-011**: The create-task tool MUST reject a lane that is not a configured lane with a validation error naming the valid lanes, creating no card anywhere.
- **FR-012**: Every lane or position change made through the MCP MUST be reflected identically in the board-listing tool and in the web app board (after a page reload), and MUST persist across reloads.
- **FR-013**: The move and lane-aware create capabilities MUST be available only to authorized agents — MCP clients authenticated per the existing mcp-authentik-auth flow.
- **FR-014**: A failed call (validation or not-found) MUST have no partial effect: no card changes lane or position, and no card is created.

### Key Entities

- **Task card**: An existing work item on the kanban board; has a title, belongs to exactly one lane, and occupies one position in that lane's top-to-bottom order.
- **Lane**: A named column of the board from the lane configuration (To Do, In Progress, Waiting, Done); holds an ordered list of cards; the first configured lane is the default landing lane for creation without an explicit lane.
- **Position**: A 1-based index into a lane's top-to-bottom order; 1 is the top; values past the end clamp to the bottom.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can move any card to any configured lane, with or without a position, in a single tool call — 100% of the spec's move scenarios produce the exact expected lane orders in both the board-listing tool and the web app board.
- **SC-002**: An agent can file a new task into any configured lane in a single create call, and creation without a lane behaves exactly as before the feature — verified against the exact expected lane orders.
- **SC-003**: 100% of invalid calls (unconfigured lane, unknown task identifier) fail with the specified error message content and leave the board state completely unchanged.
- **SC-004**: Every board change made through the MCP survives a web app page reload — no divergence between what agents see through tools and what Tyler sees on the board.
- **SC-005**: Tyler can update the board from a conversation ("I finished the proposal") via an agent without opening the web app — the round trip from tool call to visible board change requires no manual correction.

## Assumptions

- The configured lanes are To Do, In Progress, Waiting, Done, sourced from the existing lane config file; lane configuration itself is not changed by this feature.
- "An authorized agent" means an MCP client authenticated per the existing mcp-authentik-auth flow; no new authorization model is introduced.
- The board-listing and get-task response shapes already expose lane and order and are not changed by this feature (per the PRD's out-of-scope list).
- The UI's create-task flow is untouched: no lane picker (deliberate product decision, not a deferral) — lane choice on create is MCP-only.
- Create-task has no position parameter — new cards always land at the bottom of the chosen lane; an agent needing a specific position moves the card afterward.
- Relative positioning ("above/below task X"), bulk/multi-card moves, and an audit trail for MCP moves are all out of scope per the PRD.
- Card titles in scenarios ("Write proposal", "Follow up with Sam", etc.) are illustrative concrete test data, not fixed product content.
