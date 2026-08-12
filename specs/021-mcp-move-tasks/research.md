# Research: MCP Move Tasks

No NEEDS CLARIFICATION items remained in the Technical Context — the codebase already contains every mechanism this feature needs. Research therefore focused on how to reuse existing code and where the seams are.

## R1: Reuse the existing `moveTask` service for the MCP move tool

**Decision**: The new `move-task` MCP tool calls the existing `moveTask(db, lanes, taskId, targetLane, targetIndex)` in `src/server/services/tasks.ts` unchanged (or with minimal extension), rather than writing a parallel move implementation.

**Rationale**: `moveTask` was built for the UI drag (feature 008) and already satisfies the spec's hard requirements: it runs in a single transaction (FR-014 no-partial-effect), validates the target lane against configured lanes (FR-007), returns `task-not-found` for unknown ids (FR-008), clamps an out-of-range index to the end of the lane (FR-005), handles within-lane reordering by excluding the moving card from the destination snapshot (FR-004), and renumbers the source lane after cross-lane moves (FR-006). The web UI (`PUT /api/tasks/:id/placement`) uses the same function, which structurally guarantees FR-012's "identical in web app" property — both surfaces read and write the same rows.

**Alternatives considered**: A separate MCP-specific move function — rejected: duplicated transaction/clamping logic is exactly the kind of divergence FR-012 forbids. Calling the REST endpoint internally from the MCP tool — rejected: existing MCP tools call services directly, not HTTP routes; keeps the pattern consistent and avoids auth-context contortions.

## R2: 1-based MCP positions mapped to the 0-based service index

**Decision**: The tool's `position` input is 1-based (per FR-003, matching the board-listing tool's top-to-bottom order). The tool layer converts: `targetIndex = position - 1`. When `position` is omitted, the tool passes `Number.MAX_SAFE_INTEGER` as the index and lets the service's existing clamp put the card at the bottom (FR-002). Validation `z.number().int().min(1)` in the tool's inputSchema rejects 0, negatives, and non-integers before the service is reached (edge case "position below 1").

**Rationale**: Keeps the service's 0-based convention (shared with the UI) untouched and puts the agent-facing 1-based convention where it belongs — at the MCP boundary. Using the clamp for the "no position → bottom" default avoids a second query to count the destination lane.

**Alternatives considered**: Making the service accept 1-based positions — rejected: would ripple into the UI route and drag handler for no benefit. Querying lane length in the tool to compute the bottom index — rejected: redundant with the service's clamp and racy outside the transaction.

## R3: Reporting the actual landing position

**Decision**: `moveTask` already returns the updated task row, whose `position` column is the final 0-based index. The tool reports `position + 1` as the landed 1-based position in both the text content and `structuredContent` (FR-005: "response reports where the card actually landed").

**Rationale**: The returned row is read inside the same transaction after renumbering, so it is authoritative — no extra query, no race.

**Alternatives considered**: Having the service return a separate `landedIndex` field — rejected: the task row already carries it.

## R4: Extending `createTask` with an optional lane

**Decision**: Change `createTask(db, lanes, rawTitle, rawNote?, source?)` to accept an optional target lane (exact signature/shape decided at implementation, e.g. an options object or trailing parameter). When the lane is omitted, behavior is byte-identical to today: the card lands at the bottom of `lanes[0]` (FR-010). When given, the lane is validated against `lanes` **before** any insert; an unconfigured lane produces a validation failure and no row is written (FR-011, FR-014). The MCP `create-task` tool adds `lane: z.string().optional()` to its inputSchema. The REST route and UI create flow do not pass a lane and are untouched (spec assumption: lane choice on create is MCP-only).

**Rationale**: Smallest change that satisfies FR-009–FR-011; the existing max-position query already parameterizes on lane, so bottom placement generalizes for free.

**Alternatives considered**: A new `createTaskInLane` service function — rejected: two creation code paths invite drift in note handling and position logic. Create-then-move inside the tool — rejected: two transactions, transiently visible wrong state, and a needless moving part.

## R5: Validation error messages that name the valid lanes

**Decision**: On `invalid-lane` (from either tool), the tool layer formats: `Unknown lane "<given>". Valid lanes: To Do, In Progress, Waiting, Done` — built from `context.lanes` at call time, never hardcoded. On `task-not-found`, `move-task` returns `Task <id> not found`, matching the existing `get-task`/`add-note` phrasing. Errors are returned via the existing `toolError()` helper (`isError: true` MCP result, not a thrown protocol error).

**Rationale**: FR-007/FR-011 require errors to name the valid lanes so agents can self-correct; deriving from `context.lanes` keeps the message correct if `config/lanes.json` ever changes. `toolError()` is the established pattern for every domain error in `tools.ts`.

**Alternatives considered**: Throwing MCP protocol errors — rejected: existing tools return `isError` results for domain failures; protocol errors are reserved for transport/auth problems.

## R6: Error precedence for move-task

**Decision**: Keep `moveTask`'s existing precedence — task existence is checked before lane validity. Zod input-shape validation (non-integer/`< 1` position, wrong types) happens first at the tool boundary.

**Rationale**: The spec never pins an order between "unknown task" and "unknown lane" for a call that has both wrong; reusing the service's existing order avoids touching shared code. Both paths leave the board unchanged either way (the transaction returns before any write).

**Alternatives considered**: Validating the lane in the tool layer before calling the service — viable, but adds a second source of lane-validation truth; rejected in favor of one validator in the service.

## R7: Within-lane no-op move (edge case)

**Decision**: Trust `moveTask`'s existing behavior for "move a card to its current position": the card is excluded from the destination snapshot, re-spliced at the same index, and positions rewritten to identical values — a semantic no-op that succeeds and returns the unchanged position. A dedicated integration test pins this (edge case: "succeeds as a no-op; response reports the position the card occupies").

**Rationale**: Reading the implementation shows this already works; the test converts that reading into evidence per Constitution III.

**Alternatives considered**: Short-circuiting no-ops in the tool — rejected: extra code for identical observable behavior.

## R8: Test approach

**Decision**: Primary coverage is integration tests in `tests/integration/mcp-move-tools.test.ts` (new) following the `mcp-capture-tools.test.ts` pattern: real Fastify app on an ephemeral port, `:memory:` SQLite, stub identity provider, real `@modelcontextprotocol/sdk` client over StreamableHTTP. Board state is asserted through both the `list-board` MCP tool and the `GET /api/board` REST endpoint (the web app's data source) to cover FR-012's dual-surface requirement at the automated level. `create-task` lane scenarios extend the same pattern. Service-level tests extend `tests/integration/tasks.test.ts` coverage for the `createTask` signature change. Browser evidence for the web-app-visibility criteria (SC-004, the "after a page reload" clauses) comes from the `browser-tester` agent at implementation time.

**Rationale**: The MCP client transport tests exercise auth, zod schemas, and serialization exactly as a real agent would (FR-013 rides on the existing auth tests plus this transport); asserting via `GET /api/board` proves web-app parity without a browser in the fast loop.

**Alternatives considered**: Unit-testing `createMcpServer` with an in-process client only — rejected: the repo's established pattern is full-transport integration tests, and they cover the auth gate for free.
