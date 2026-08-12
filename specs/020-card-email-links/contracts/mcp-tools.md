# MCP Tool Contracts: Card–Email Links

All tools live on the existing `work-helper` MCP server (`src/server/mcp/tools.ts`, `registerTool` pattern) behind the existing mcp-authentik-auth transport gate — unauthenticated or unauthorized `tools/call` requests are rejected at the transport before any tool runs, identically to every other write tool (research D9). Errors use the house `toolError` shape: `{ content: [{ type: 'text', text: <message> }], isError: true }`.

## New tool: `link-conversation-to-task`

Links an email conversation to a task. (FR-001)

**Input schema**:

| Field | Type | Rules |
|---|---|---|
| `taskId` | number | integer, positive |
| `conversationId` | number | integer, positive |

**Behavior**: validates the task exists, then the conversation, then that no link exists for the pair; inserts one `task_conversations` row.

**Output** (success): full task detail — the same `taskDetailOutputSchema` as `get-task`, including the new `conversations` array (see below). Text content: `` Linked conversation "<subject>" to task "<title>". ``

**Errors** (each leaves stored links unchanged — FR-005, FR-006, SC-003):

| Condition | Message |
|---|---|
| task id doesn't exist | `Task <taskId> not found` |
| conversation id doesn't exist | `Conversation <conversationId> not found` |
| pair already linked | `Task <taskId> is already linked to conversation <conversationId>` |

## New tool: `unlink-conversation-from-task`

Removes the link between a conversation and a task; deletes nothing else (FR-002, FR-012).

**Input schema**: identical to `link-conversation-to-task`.

**Behavior**: validates the task exists, then the conversation, then that the link exists; deletes the one join row. The card, the conversation, and all messages survive; the pair can be re-linked afterwards.

**Output** (success): full task detail (same schema as `get-task`). Text content: `` Unlinked conversation "<subject>" from task "<title>". ``

**Errors**:

| Condition | Message |
|---|---|
| task id doesn't exist | `Task <taskId> not found` |
| conversation id doesn't exist | `Conversation <conversationId> not found` |
| pair not linked | `Task <taskId> is not linked to conversation <conversationId>` |

## Modified tool response: `get-task`

`taskDetailOutputSchema` gains:

```ts
conversations: z.array(z.object({
  id: z.number(),
  subject: z.string(),
  participants: z.array(z.object({
    address: z.string(),
    displayName: z.string(),
    person: z.object({ id: z.number(), name: z.string() }).nullable(),
  })),
  latestMessageAt: z.number(),
}))
```

Ordered `latestMessageAt DESC, id DESC`; unpaginated (FR-004, FR-015). Input schema, all other output fields, and the not-found error are unchanged.

## Modified tool response: `get-conversation`

Output schema gains:

```ts
cards: z.array(z.object({ id: z.number(), title: z.string(), lane: z.string() }))
```

Ordered by `title COLLATE NOCASE`; unpaginated (FR-004, FR-015). Everything else unchanged.

## Explicitly unchanged (FR-013, FR-014)

- `list-board` — no link data anywhere in its response.
- `list-conversations` — no link data anywhere in its response.
- `create-task` — no new inputs; creating a card from an email is `create-task` followed by `link-conversation-to-task` (User Story 5).
