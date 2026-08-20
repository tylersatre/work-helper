# Data Model: MCP Mark Emails Read

No schema changes and no migration. The feature flips one existing column (`email_messages.is_read`) and derives everything else; the mailbox connection's write permission lives in the identity platform, not in the database (research R2).

## Entities

### Email message (existing `email_messages` table — unchanged schema)

| Field | Type | Role in this feature |
|-------|------|----------------------|
| `id` | integer PK autoincrement | The id agents pass in `messageIds` — the same id `get-conversation` (`messages[].id`) and `emails-for-person` (`emails[].messageId`) already expose |
| `graph_message_id` | text, not null, unique | Immutable Outlook id; looked up server-side to address the Graph PATCH; **never exposed** through MCP or REST (existing invariant, preserved) |
| `is_read` | integer (boolean mode), not null | The one column this feature writes — set only after the mailbox accepted the change |
| `conversation_id` | integer FK → `email_conversations.id` | Groups messages for the conversation-level unread derivation |
| `source_folder`, `flag_status`, `categories`, `importance`, subject/body/participant data | various | Explicitly **untouched** by the tool (FR-007); asserted unchanged in tests |

**Invariants**:

- `is_read` changes through exactly three paths after this feature: sync's refresh from the mailbox (existing), the initial insert during sync (existing), and `setEmailReadState` (new) — which writes the store only after the mailbox write succeeded (FR-003), and writes only this column.
- A message whose mailbox copy is gone keeps its stored row and stored `is_read` (snapshot rule); the tool reports it `failed` and leaves it alone.

### Conversation unread indicator (derived — unchanged)

`hasUnread` is computed per conversation as "any message with `is_read = 0`" in `listConversations` (`src/server/services/email/queries.ts:109`), which backs both the `list-conversations` MCP tool and `GET /api/emails/conversations` (the Emails page). Flipping stored `is_read` therefore propagates to every read surface with no new code (FR-009/FR-010).

### Mailbox connection & write permission (not a table)

Connection state lives in the MSAL file token cache plus in-memory sign-in state (existing). This feature adds no storage: whether the sign-in can change mail is determined at call time by write-scope token acquisition with probe classification (research R2), yielding one of: connected-with-write, `no-write-permission` (pre-feature sign-in), `expired`, `never-signed-in`. Sign-ins made after this feature ships consent to `Mail.Read`, `Mail.ReadWrite`, `Calendars.Read`, `offline_access`.

### Per-message outcome (response value, not persisted)

| Field | Type | Meaning |
|-------|------|---------|
| `messageId` | integer | Echoes the requested id, in input order |
| `status` | `marked` \| `already-in-state` \| `not-found` \| `failed` | What happened to this id |
| `reason` | string, present iff `status = failed` | e.g. "The mailbox no longer has this message" |

Nothing outcome-shaped is stored — the spec explicitly leaves history/audit to the `email-change-tracking` stub.

### Sync run history (existing `sync_runs` table — unchanged, deliberately uninvolved)

`setEmailReadState` bypasses `SyncCoordinator`; no row is ever inserted (FR-011). Tests assert the table is unchanged across tool calls.

## State transitions

`set-email-read-state(messageIds[1..50], state)` — per call:

1. Input validation (handler): count 1–50, state ∈ {read, unread} → violation ⇒ whole-call validation error, nothing touched.
2. Write-access preflight (`provider.verifyWriteAccess()`): not connected / expired / no write permission ⇒ whole-call error, no per-message outcomes, nothing touched.
3. Sequentially per id, in input order:
   - no row ⇒ `not-found` (nothing touched);
   - stored `is_read` already equals requested ⇒ `already-in-state` (no Graph call, no store write — also how duplicate ids resolve);
   - else PATCH mailbox ⇒ on success, update that row's `is_read` and report `marked`; on mailbox-gone, `failed` + reason, store untouched; on any other mailbox error, `failed` + reason, store untouched, loop continues.
4. Response assembles outcomes in input order plus counts. Successes are never rolled back (FR-006).

Read state per message (store view): `unread ⇄ read`, driven only by sync refresh or a successful mailbox-first tool write. There are no other transitions — viewing, linking, and fetching never change it (FR-010).
