# Data Model: Card–Email Links

One new table; no changes to any existing table. Decisions referenced from [research.md](research.md).

## New table: `task_conversations` (D1)

The card–conversation link entity from the spec ("at most one link exists per pair; removing it deletes nothing but the association itself").

| Column | Type | Constraints |
|---|---|---|
| `task_id` | integer | NOT NULL, FK → `tasks.id`, `ON DELETE CASCADE` |
| `conversation_id` | integer | NOT NULL, FK → `email_conversations.id`, `ON DELETE CASCADE` |

- **Primary key**: composite (`task_id`, `conversation_id`) — structurally forbids duplicate links (FR-005 backstop).
- **Index**: `task_conversations_conversation_id` on (`conversation_id`) — serves the conversation→cards reverse lookup; the composite PK serves task→conversations.
- **Drizzle export**: `taskConversations` in `src/server/db/schema.ts`, mirroring `taskCompanies` (`schema.ts:225-236`).
- **Migration**: `drizzle/0004_*.sql`, purely additive (D8).

### Relationship semantics

- Many-to-many: a task may link many conversations; a conversation may link many tasks (FR-003).
- Links are conversation-level only — no message-level linking exists in the model (FR-003).
- `ON DELETE CASCADE` from `tasks`: deleting a card silently removes its links; conversations and messages are untouched (spec edge case). Enforced by `pragma('foreign_keys = ON')` set in `createDb`.
- `ON DELETE CASCADE` from `email_conversations`: symmetric hygiene; the app never deletes conversations today.
- Unlinking deletes only the join row (FR-012); re-linking afterwards is an ordinary insert.

## Derived read models (no storage)

### `LinkedConversationSummary` — task detail's linked conversations (D4)

Computed per task by `conversationsForTask(db, taskId)` in `src/server/services/task-conversations.ts`:

| Field | Source |
|---|---|
| `id` | `email_conversations.id` via the join table |
| `subject` | earliest message's subject in the conversation (same rule as `listConversations`) |
| `participants` | `participantsForConversation(db, id)` — deduped by address, each `{ address, displayName, person: { id, name } \| null }` |
| `latestMessageAt` | `MAX(email_messages.sent_at)` for the conversation — reflects newly synced replies automatically (spec edge case) |

Ordering: `latestMessageAt DESC, id DESC`. Unpaginated (FR-015).

### `LinkedCardSummary` — conversation detail's linked cards (D5)

Computed per conversation by `cardsForConversation(db, conversationId)`:

| Field | Source |
|---|---|
| `id` | `tasks.id` via the join table |
| `title` | `tasks.title` |
| `lane` | `tasks.lane` |

Ordering: `title COLLATE NOCASE ASC` (matches `getCompanyDetail` cards). Unpaginated (FR-015).

## Modified read paths

- `getTaskDetail` (`src/server/services/tasks.ts`) gains `conversations: LinkedConversationSummary[]` — flows into `GET /api/tasks/:id` and the `get-task` MCP tool with no route/tool query changes (FR-004, FR-011).
- `getConversation` (`src/server/services/email/queries.ts`) gains `cards: LinkedCardSummary[]` — flows into `GET /api/emails/conversations/:id` and the `get-conversation` MCP tool (FR-004, FR-011).
- `listTasksByLane` (list-board) and `listConversations` (list-conversations, Emails page) are **unchanged** (FR-013).

## Shared types (`src/shared/types.ts`)

```ts
export interface LinkedConversationSummary {
  id: number;
  subject: string;
  participants: EmailParticipantSummary[]; // existing shared type
  latestMessageAt: number;
}

export interface LinkedCardSummary {
  id: number;
  title: string;
  lane: string;
}
```

`TaskDetail` gains `conversations: LinkedConversationSummary[]`; `EmailConversationDetail` gains `cards: LinkedCardSummary[]`.

## Service result types (D2, D3)

`TaskDetailRecord` below is shorthand for the `getTaskDetail` return type — implemented as `NonNullable<ReturnType<typeof getTaskDetail>>` per the house pattern in `src/server/services/tasks.ts` (see `LinkPersonResult`/`UnlinkPersonResult`), not a new named type.

```ts
export type LinkConversationResult =
  | { ok: true; task: TaskDetailRecord }
  | { ok: false; error: 'task-not-found' | 'conversation-not-found' | 'already-linked' };

export type UnlinkConversationResult =
  | { ok: true; task: TaskDetailRecord }
  | { ok: false; error: 'task-not-found' | 'conversation-not-found' | 'link-not-found' };
```

State transitions: unlinked → linked (insert; fails `already-linked` if the row exists) and linked → unlinked (delete; fails `link-not-found` if the row doesn't exist). Both validate task then conversation existence first, in that order, so error messages name the missing entity (FR-006).
