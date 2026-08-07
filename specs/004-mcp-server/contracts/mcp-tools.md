# Contract: MCP tools (004-mcp-server)

Six tools, registered on an `McpServer` (`@modelcontextprotocol/sdk`) with Zod input schemas and declared output schemas. Every tool requires an authorized connection ([http-auth.md](http-auth.md)); there are no resources or prompts in this slice. All reads and writes go through the existing service layer (`src/server/services/*`), so tool data is the web app's live data (FR-020). Success results carry `structuredContent` matching the shapes below plus a human-readable `content` text summary; failures return tool errors (`isError: true`) with the messages given below — not protocol-level errors — so conversational clients can relay them.

Timestamps are epoch milliseconds throughout, matching the web app's API.

## `list-board` (FR-013)

Input: `{}` (no arguments).

Output `structuredContent`: `{ "lanes": [ { "name": string, "tasks": [ { "id": number, "title": string, "lane": string, "createdAt": number } ] } ] }` — every configured lane, in configured order, tasks in id-ascending order (same as `GET /api/board`).

## `get-task` (FR-014)

Input: `{ "taskId": number }` (positive integer).

Output `structuredContent`: `{ "id": number, "title": string, "lane": string, "createdAt": number, "notes": [ { "id": number, "text": string, "source": "ui" | "mcp", "createdAt": number } ], "people": [ { "id": number, "firstName": string, "lastName": string, "email": string | null } ] }`. Notes newest-first (the web app's order). `source` distinguishes UI-added from MCP-added.

Errors: unknown `taskId` → tool error `Task <id> not found`.

## `search-people` (FR-015)

Input: `{ "query": string }`.

Output `structuredContent`: `{ "people": [ { "id": number, "name": string, "email": string | null } ] }` — matches of the web app's people search (case-insensitive substring over first name, last name, email), name-and-email only by design; `name` is `"First Last"`. No matches → `{ "people": [] }` (success, not an error).

## `get-person` (FR-016)

Input: `{ "personId": number }` (positive integer).

Output `structuredContent`: `{ "id": number, "firstName": string, "lastName": string, "email": string | null, "phone": string | null, "extraFields": { [fieldName: string]: string } }` — `extraFields` carries every configured extra field that has a value (e.g. `{"Nickname": "Sammy"}`).

Errors: unknown `personId` → tool error `Person <id> not found`.

## `create-task` (FR-017, FR-019)

Input: `{ "title": string, "note"?: string }`.

Behavior: creates the task in the **first configured lane**; if `note` is present and non-blank, attaches it as the initial note with `source: "mcp"`. Persisted through the existing service — the card is immediately visible in the web app and survives reload (SC-004).

Output `structuredContent`: `{ "id": number, "title": string, "lane": string, "createdAt": number }`.

Errors: empty/whitespace-only `title` → tool error containing `Title is required`; nothing is created.

## `add-note` (FR-018, FR-019)

Input: `{ "taskId": number, "text": string }`.

Behavior: appends a note with `source: "mcp"` to the existing task; appears in the web app's detail view as the newest note, labeled "via MCP", surviving reload.

Output `structuredContent`: `{ "id": number, "taskId": number, "text": string, "source": "mcp", "createdAt": number }`.

Errors: unknown `taskId` → tool error `Task <id> not found` (no note created); empty/whitespace-only `text` → tool error containing `Note text is required` (no note created).
