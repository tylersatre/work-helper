# Phase 0 Research: Card–Email Links

No NEEDS CLARIFICATION markers remained in the Technical Context — the stack is fully established by the codebase and the spec defers only naming/shape decisions here. Research therefore located the in-repo precedent for each design decision so the feature mirrors proven patterns. Each decision records what was chosen, why, and what was rejected.

## D1. Link storage: `task_conversations` join table

**Decision**: New `task_conversations` table — `taskId` (FK → `tasks.id`, `onDelete: 'cascade'`) + `conversationId` (FK → `email_conversations.id`, `onDelete: 'cascade'`), composite primary key on the pair, plus an index on `conversationId` for the reverse lookup (cards for a conversation).

**Rationale**: The relationship is many-to-many at conversation granularity (FR-003), which is exactly the `task_companies` shape (`src/server/db/schema.ts:225-236`). The composite PK makes duplicate links structurally impossible — the backstop behind FR-005's "at most one link per pair". Cascade from `tasks` implements the edge case "deleting a card removes its links; conversations unaffected" declaratively (`createDb` sets `pragma('foreign_keys = ON')`, so it's enforced everywhere including production). Cascade from `email_conversations` is symmetric hygiene — the app never deletes conversations, but if one ever goes, dangling links shouldn't survive it. The composite-PK column order (`taskId, conversationId`) serves the task→conversations lookup; the extra `conversationId` index serves conversation→cards, matching how `email_participants_address_id` supports reverse lookups.

**Alternatives considered**: A `card_conversation_links` table with its own autoincrement id and `createdAt` (rejected — no requirement orders or timestamps links, and every existing pair-link table in the schema is a bare composite-PK join table); message-level links (rejected — FR-003 explicitly forbids message targets).

## D2. Duplicate-link semantics: error, not no-op

**Decision**: The link service checks for an existing `(taskId, conversationId)` row inside the same transaction-free flow the company service uses and returns `{ ok: false, error: 'already-linked' }`; the MCP tool maps it to the message `Task <id> is already linked to conversation <id>`. The insert itself does **not** use `onConflictDoNothing`.

**Rationale**: FR-005 requires the duplicate call to *fail with a validation error stating the link already exists* — deliberately different from `add-company-to-task`, whose spec made re-linking a no-op. A pre-check plus plain insert gives the specific error message; the composite PK remains the race backstop (a single-writer better-sqlite3 connection makes the pre-check reliable in practice).

**Alternatives considered**: `onConflictDoNothing` + no-op success (rejected — violates FR-005); relying on the PK violation exception alone (rejected — the thrown SQLITE_CONSTRAINT error can't name the entities in a friendly message without string-parsing).

## D3. MCP tool names and error messages

**Decision**: Two tools — `link-conversation-to-task` (inputs `taskId`, `conversationId`, both positive ints) and `unlink-conversation-from-task` (same inputs). Errors via the existing `toolError` helper: `Task <id> not found`, `Conversation <id> not found`, `Task <id> is already linked to conversation <id>` (link), `Task <id> is not linked to conversation <id>` (unlink). Both tools return the updated task detail (same output schema as `get-task`) so agents see the resulting link set without a second call.

**Rationale**: Naming mirrors the spec's own vocabulary ("links a conversation to a card" / "unlinks") while following the `<verb>-<object>-to/from-task` pattern of `add-company-to-task`/`remove-company-from-task`. Not-found messages copy the exact house style (`Task ${taskId} not found` appears in `add-note`, `get-task`, and the company tools). Returning task detail matches both company tools, which return `taskDetailOutputSchema`. Unlinking a pair that isn't linked fails with a specific error (spec edge case) — again diverging from the company tool's silent delete, so the unlink service checks row existence first.

**Alternatives considered**: `link-email-to-card`/card vocabulary (rejected — the MCP surface consistently says "task": `get-task`, `create-task`, `add-company-to-task`; the UI says "card", the API says "task", and this feature keeps that convention); returning just `{ linked: true }` (rejected — existing link tools return the full detail and agents need the post-state).

## D4. Linked-conversation summary shape on `get-task` / task detail

**Decision**: `getTaskDetail` gains `conversations: LinkedConversationSummary[]` — `{ id, subject, participants: [{ address, displayName, person: { id, name } | null }], latestMessageAt }` — ordered `latestMessageAt DESC, id DESC`. Subject is the conversation's earliest message's subject; participants are the conversation-level deduped rollup; `latestMessageAt` is `MAX(sent_at)` so new synced replies update the displayed date automatically (spec edge case).

**Rationale**: The spec's assumption block fixes the fields: subject, participants, latest-message date. All three already have canonical implementations in `src/server/services/email/queries.ts` — earliest-message subject and `MAX(sent_at)` from `listConversations`/`conversationsForPerson`, participant rollup from `participantsForConversation` (deduped by address, preferring the most recent non-empty display name, with linked-person refs). Reusing `participantsForConversation` directly means person links inside the section render identically to the Emails list page. Newest-activity-first ordering matches every conversation list in the app.

**Alternatives considered**: Including `messageCount`/`hasUnread`/`hasAttachments` (rejected — the spec deliberately scopes the entry to three fields "without recreating full list rows"); ordering by link insertion (rejected — the join table has no ordering column by D1, and recency matches user expectation).

## D5. Linked-card summary shape on `get-conversation` / conversation detail

**Decision**: `getConversation` (in `email/queries.ts`) gains `cards: LinkedCardSummary[]` — `{ id, title, lane }` — ordered by `title COLLATE NOCASE`. The field is assembled by `cardsForConversation` from the new `task-conversations` service and rides along for every `getConversation` caller (MCP tool and HTTP route alike).

**Rationale**: FR-004 requires each card with its lane; `{ id, title, lane }` is exactly the `companyCardSchema` shape from `get-company`, and title-ordered `COLLATE NOCASE` matches `getCompanyDetail`'s cards query. Extending `getConversation` itself (rather than each caller) guarantees the MCP response and the web view can never disagree (FR-011's "appears identically"). Import direction is safe: `email/queries.ts` already imports from `db/schema.js`, and `cardsForConversation` needs only `tasks` + `taskConversations` tables — no circular dependency.

**Alternatives considered**: Assembling `cards` separately in the route and the tool (rejected — two call sites to keep in sync for no benefit); embedding the query inline in `email/queries.ts` (rejected — the link queries belong together in the new service so the feature's data access is one reviewable module).

## D6. HTTP surface: extend the two existing detail endpoints, add nothing

**Decision**: No new HTTP endpoints and no HTTP write path. `GET /api/tasks/:id` picks up `conversations` automatically via `getTaskDetail`; `GET /api/emails/conversations/:id` picks up `cards` automatically via `getConversation`. Link/unlink exist **only** as MCP tools.

**Rationale**: FR-010 forbids any UI link-management control, and the UI is the only HTTP consumer — an HTTP write path would be dead code that contradicts the read-only rule. Both detail endpoints already return their service's full record, so the new fields flow through with zero route changes (`routes/tasks.ts` returns `getTaskDetail` output; `routes/emails.ts` returns `getConversation` output). FR-013 is honored because `listConversations` and `listTasksByLane` are untouched.

**Alternatives considered**: REST endpoints `POST/DELETE /api/tasks/:id/conversations` mirroring the company-link routes (rejected — no consumer exists; the company routes exist because the UI has add/remove controls, which this feature explicitly excludes).

## D7. UI: two read-only components with styled empty states

**Decision**: New `LinkedConversations.vue` (rendered in a new "Emails" section on `TaskDetailPage.vue`) and `LinkedCards.vue` (rendered in a new "Cards" section on `EmailConversationPage.vue`). Each renders a list of `RouterLink` entries — conversations link to `/emails/:id` showing subject, participant names (person name where linked, else display name, else address), and the latest-message date via the existing `absoluteLocal` formatter; cards link to `/tasks/:id` showing title and lane. When the list is empty, each shows a styled muted empty-state message ("No linked emails" / "No linked cards") matching the section-header styling conventions of the host pages. Neither component takes callbacks or renders buttons — props in, navigation out, nothing else.

**Rationale**: FR-007/FR-008 fix the fields, FR-009 the navigation, FR-010 the read-only constraint, SC-005 the deliberate empty state. Section placement mirrors how `TaskDetailPage` already stacks People/Companies/Notes/Tags sections (`task-detail-section` blocks), and `subjectOrPlaceholder` + `absoluteLocal` from `src/client/utils/` handle blank subjects and date formatting consistently with the Emails pages. Dedicated components (rather than inline page markup) match the `LinkedCompanies`/`PersonEmailSection` convention and keep component tests focused. Styling follows the existing dark-theme scoped-CSS conventions of both host pages (no pure-black, muted rgba text for secondary info).

**Alternatives considered**: Reusing `LinkedCompanies.vue` generically (rejected — it is a read-write search/add/remove control; stripping that would complicate a shipped component to save ~40 lines); a shared generic "linked list" component (rejected — the two sections render different fields and link targets; premature abstraction).

## D8. Migration strategy

**Decision**: Edit `schema.ts`, then `npx drizzle-kit generate` producing `drizzle/0004_*.sql` with a single `CREATE TABLE task_conversations` (composite PK, two FKs with cascade, one index). Review the generated SQL; no hand-adjustment expected since the change is a pure table addition.

**Rationale**: Purely additive — no existing table or row is touched, so production data is safe by construction (constitution "Data & migrations"). Landed migrations `0000`–`0003` remain untouched. `tests/integration/migration-upgrade.test.ts` (the fresh-vs-upgraded parity precedent extended by 018 and 019) will be extended to cover the new table.

**Alternatives considered**: None viable — this is the only schema change the feature needs.

## D9. Authorization: inherit transport-level MCP auth, add nothing

**Decision**: Register both tools on the existing `McpServer` in `createMcpServer` with no tool-level auth code. The mcp-authentik-auth flow (bearer-token verification at the `/mcp` HTTP transport, `src/server/mcp/auth/`) already gates every tool call, so unauthenticated/unauthorized clients are rejected before any tool executes — identically to every other write tool (spec edge case, and the spec's assumption "this feature adds no new auth model").

**Rationale**: All existing write tools (`create-task`, `add-company-to-task`, `create-person`, …) rely on exactly this transport-level gate; there is no per-tool authorization anywhere in `tools.ts`, and inventing one would be new auth surface the spec excludes. The existing `mcp-connect`/`mcp-revocation` integration tests already prove the rejection behavior; the new tool tests connect through `connectThroughApproval` like every other MCP test, and one test asserts an unauthenticated `tools/call` is rejected to pin the edge case to this feature's tools.

**Alternatives considered**: Per-tool scope checks (rejected — out of scope by spec: "Authentication / multi-user access control changes").

## D10. Test seeding strategy

**Decision**: Integration tests seed conversations by driving the real sync path with `FakeMailProvider` + `SeedMessage` fixtures (the `email-read-tools.test.ts` harness), then create tasks via the real `create-task` tool or `createTask` service, then exercise link/unlink. Component tests mount the new components with literal props. Browser evidence uses the dev server's seeded fake mailbox (`dev-seed.ts` precedent) per the spec assumption "automated criteria run against a synced store seeded by test setup".

**Rationale**: Syncing through `FakeMailProvider` produces real `email_conversations` rows with correct ids, participants, and dates — links then reference genuinely synced data, matching the spec's Given clauses ("the synced store holds the conversation…"). This is the exact pattern of every existing email integration test; hand-inserting conversation rows would bypass participant/address wiring and could mask joins that only work against synthetic data.

**Alternatives considered**: Direct DB inserts of conversation/message rows (rejected — duplicates sync logic and drifts from production data shape).
