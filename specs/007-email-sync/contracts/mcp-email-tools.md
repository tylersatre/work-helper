# Contract: MCP Email Tools

**Feature**: 007-email-sync | **Surface**: work-helper MCP server (`src/server/mcp/tools.ts`, streamable HTTP at `POST /mcp`)

All four tools are registered on the same `McpServer` as the existing tools and are therefore reachable only with a valid bearer token issued by the existing OAuth flow (FR-014) — an unauthenticated request never reaches any tool. Following the existing convention, every tool returns `structuredContent` matching its `outputSchema` plus a one-line human `content` text; failures return `isError: true` with a message (`toolError`). Input validation is zod on `inputSchema`, enforced by the MCP SDK before the handler runs.

Timestamps in all outputs are epoch milliseconds, matching existing tools.

## sync-emails

Pulls Inbox + Sent messages in a date range from the connected mailbox into the store (FR-001–FR-006, FR-015, FR-016).

**Input**:

| Field | Type | Rules |
|---|---|---|
| startDate | string | required, `YYYY-MM-DD` |
| endDate | string | required, `YYYY-MM-DD`, not before startDate |

Validation failures (either date missing/malformed, or start after end) fail the call with a validation error stating that a start and end date are required / that the range is invalid; nothing is synced.

**Output** (`structuredContent`):

| Field | Type | Meaning |
|---|---|---|
| status | `"complete" \| "interrupted"` | `interrupted` = connection lost mid-run; stored progress kept |
| syncedCount | number | Newly stored messages this run only — already-stored messages are never counted |
| error | string, only when interrupted | What went wrong mid-run |

**Errors** (`isError: true`): mailbox unreachable or sign-in expired before anything stored → message identifying the connection problem and pointing at `npm run mail:signin`; store unchanged.

**Semantics**: range = whole days in the server's local timezone, both endpoints inclusive; only Inbox and Sent folders; idempotent across overlapping re-runs (dedupe on mailbox immutable id); read-only toward the mailbox.

## list-conversations

Lists synced conversations, newest activity first (FR-007).

**Input**:

| Field | Type | Rules |
|---|---|---|
| limit | number | optional, integer 1–200, default 50 |
| cursor | string | optional, opaque cursor from a previous response |

**Output**:

| Field | Type | Meaning |
|---|---|---|
| conversations | array | Ordered by `(latestMessageAt DESC, id DESC)` |
| conversations[].id | number | Conversation id for get-conversation |
| conversations[].subject | string | Subject of the thread's earliest message (may be `""`) |
| conversations[].messageCount | number | |
| conversations[].latestMessageAt | number | |
| nextCursor | string \| null | Present (non-null) only while more conversations remain |

Paging is keyset-based: no conversation is ever returned twice, and every conversation left unchanged during paging is returned exactly once. A conversation that receives new mail mid-paging moves ahead of the cursor and may be absent from the remaining pages of that sequence — it appears on the first page of a fresh listing (its keys are immutable between syncs, so this only occurs under a concurrent sync). An invalid/corrupt cursor is a tool error.

## get-conversation

Fetches one conversation's full thread — never paged (FR-008, FR-010).

**Input**:

| Field | Type | Rules |
|---|---|---|
| conversationId | number | required, positive integer |

**Output**:

| Field | Type | Meaning |
|---|---|---|
| id | number | |
| subject | string | Same derivation as list-conversations |
| messages | array | Chronological `(sentAt ASC, id ASC)` — always the complete thread |
| messages[].id | number | |
| messages[].subject | string | The message's own subject (may be `""`) |
| messages[].sentAt | number | |
| messages[].bodyText | string | Derived plain text; the stored original HTML is never returned by this tool |
| messages[].sourceFolder | `"inbox" \| "sent"` | |
| messages[].participants | array | Every address occurrence with its role; same address may appear once per role |
| messages[].participants[].address | string | As stored (original casing) |
| messages[].participants[].role | `"from" \| "to" \| "cc" \| "bcc"` | |
| messages[].participants[].person | `{ id: number, name: string } \| null` | The linked person, or null for unlinked addresses (FR-010) |

**Errors**: unknown `conversationId` → tool error "Conversation N not found".

## emails-for-person

Every synced email involving any of a person's addresses (FR-013).

**Input**:

| Field | Type | Rules |
|---|---|---|
| personId | number | required, positive integer |
| limit | number | optional, integer 1–200, default 50 |
| cursor | string | optional, opaque cursor from a previous response |

**Output**:

| Field | Type | Meaning |
|---|---|---|
| person | `{ id: number, name: string }` | |
| emails | array | Distinct messages, ordered `(sentAt DESC, id DESC)`; each exactly once across pages |
| emails[].messageId | number | |
| emails[].conversationId | number | For drill-down via get-conversation (which returns bodies) |
| emails[].subject | string | |
| emails[].sentAt | number | |
| emails[].addresses | array | Which of the person's addresses this email involves, with each occurrence's role — one entry per (address, role) pair |
| emails[].addresses[].address | string | |
| emails[].addresses[].role | `"from" \| "to" \| "cc" \| "bcc"` | |
| nextCursor | string \| null | Present (non-null) only while more emails remain |

**Errors**: unknown `personId` → tool error "Person N not found"; invalid cursor → tool error. A person with no addresses or no involved mail returns an empty `emails` array (not an error).
