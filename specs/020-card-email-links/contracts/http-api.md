# HTTP API Contracts: Card–Email Links

No new endpoints and no HTTP write path — links are written exclusively through the MCP tools (research D6), and the web app is read-only for links (FR-010). Two existing detail endpoints gain fields that flow through from their services automatically.

## Modified: `GET /api/tasks/:id`

Response body (`TaskDetail`) gains:

```ts
conversations: LinkedConversationSummary[]
// { id, subject, participants: { address, displayName, person: { id, name } | null }[], latestMessageAt }
```

- Ordered `latestMessageAt DESC, id DESC`; unpaginated; `[]` when the card has no links.
- Status codes, error shape, and all other fields unchanged.

## Modified: `GET /api/emails/conversations/:id`

Response body (`EmailConversationDetail`) gains:

```ts
cards: LinkedCardSummary[]
// { id, title, lane }
```

- Ordered by title, case-insensitive; unpaginated; `[]` when the conversation has no links.
- Status codes (including the 404 `Conversation not found` shape), error shape, and all other fields unchanged.

## Explicitly unchanged

- `GET /api/board` and `GET /api/emails/conversations` (list surfaces) carry no link data (FR-013).
- `POST /api/tasks` and every other task/email route: untouched.

## UI consumption contract

- `TaskDetailPage.vue` renders `conversations` in a read-only "Emails" section (`LinkedConversations.vue`): each entry is a link to `/emails/<id>` showing subject (via `subjectOrPlaceholder`), participant names (person name where linked, else non-empty display name, else address), and `latestMessageAt` (via `absoluteLocal`); empty array renders the styled empty state "No linked emails" (FR-007, FR-009, SC-005).
- `EmailConversationPage.vue` renders `cards` in a read-only "Cards" section (`LinkedCards.vue`): each entry is a link to `/tasks/<id>` showing title and lane; empty array renders the styled empty state "No linked cards" (FR-008, FR-009, SC-005).
- Neither section renders any control that creates or removes links (FR-010).
