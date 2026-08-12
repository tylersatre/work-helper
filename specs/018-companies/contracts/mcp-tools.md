# MCP Tool Contract: Companies

Eight new tools plus two modified responses, all in `src/server/mcp/tools.ts`, registered via the official SDK's `server.registerTool(name, { description, inputSchema, outputSchema }, handler)` with raw zod shapes (module-scope reusable shape consts, matching `personDetailSchema` et al.). Every failure returns `toolError(message)` (`{ content: [{ type: 'text', text }], isError: true }`) with messages worded identically to the HTTP layer (FR-014: same validation rules). All tools require the standard Bearer-token auth from the mcp-server feature — no new auth surface.

Shared shape const: `companySummarySchema = { id: z.number(), name: z.string() }`.

## New tools

### `create-company`

- Input: `{ name: z.string() }`.
- Output: `companySummarySchema`. Text: `Created company "<name>".`
- Errors: "A name is required" (blank/whitespace after trim); "That company name is already in use" (case-insensitive duplicate).

### `rename-company`

- Input: `{ companyId: z.number().int().positive(), name: z.string() }`.
- Output: `companySummarySchema` (updated). Text: `Renamed company to "<name>".`
- Errors: `Company <id> not found`; "A name is required"; "That company name is already in use" (own-name recasing allowed).

### `delete-company`

- Input: `{ companyId: z.number().int().positive() }`.
- Output: `{ deleted: z.boolean() }`. Text: `Deleted company "<name>". <n> person assignment(s) cleared, <m> card link(s) removed.`
- Errors: `Company <id> not found`.
- Side effects identical to HTTP DELETE: assignments cleared, card links and tag attachments removed; people/cards/tags survive.

### `list-companies`

- Input: none (`{}`).
- Output: `{ companies: z.array(z.object(companySummarySchema)) }` — alphabetical by name, case-insensitive. Text: `<n> company/companies.`

### `get-company`

- Input: `{ companyId: z.number().int().positive() }`.
- Output: `{ ...companySummarySchema, people: [{ id, firstName, lastName }] (ordered lastName/firstName NOCASE), cards: [{ id, title, lane }] (ordered title NOCASE), tags: z.array(z.string()) }` — complete unpaginated lists; tags flattened to names, read-only (matching `get-person`; MCP tag writes for companies are out of scope). Text: `Company "<name>".`
- Errors: `Company <id> not found`.

### `set-person-company`

- Input: `{ personId: z.number().int().positive(), companyId: z.number().int().positive().nullable() }` — a number sets/switches, `null` clears.
- Output: the person detail (same shape as `get-person`, including the new `company` field). Text: `Set <person>'s company to "<name>".` / `Cleared <person>'s company.`
- Errors: `Person <id> not found`; `Company <id> not found`.

### `add-company-to-task`

- Input: `{ taskId: z.number().int().positive(), companyId: z.number().int().positive() }`.
- Output: the task detail (same shape as `get-task`, including the new `companies` field). Text: `Added "<company>" to task "<title>".`
- Errors: `Task <id> not found`; `Company <id> not found`. Adding an already-linked company is a no-op returning the unchanged detail.

### `remove-company-from-task`

- Input: `{ taskId: z.number().int().positive(), companyId: z.number().int().positive() }`.
- Output: the task detail. Text: `Removed "<company>" from task "<title>".`
- Errors: `Task <id> not found`.

## Modified responses (FR-015)

### `get-person`

`personDetailSchema` gains `company: z.object(companySummarySchema).nullable()`; `personDetail()` populates it. All tools that return the person shape (`get-person`, `update-person`, `set-person-company`, contact-entry tools) carry the field automatically.

### `get-task`

Task detail output gains `companies: z.array(z.object(companySummarySchema))` (ordered name NOCASE), populated wherever the task detail is assembled (`get-task`, `add-note`, link tools).

## Parity guarantee (FR-014/FR-015, SC-008)

Every tool calls the same `src/server/services/companies.ts` / `people.ts` / `tasks.ts` functions as the HTTP routes — no duplicated business logic — so web-app and MCP mutations are immediately visible to each other by construction. The integration test `tests/integration/mcp-company-tools.test.ts` drives the full lifecycle through a real SDK `Client` (the `mcp-read-tools.test.ts` recipe) and cross-checks state through the HTTP API within the same app instance.
