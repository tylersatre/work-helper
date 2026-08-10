# US3 — Agents see tags on people and tasks (evidence)

Feature: 011-tags, User Story 3 (`get-person` / `get-task` MCP tools include tag names for authorized agents).

**Surface**: MCP-only criterion — reachable only through the MCP tool contract, not the browser. Per the constitution (Principle III), recorded automated-check output is the surface-appropriate evidence here; there is no UI to screenshot.

## Acceptance scenario covered

Given person "Sam Rivera" tagged "VIP" and task "Follow up with Sam" tagged "VIP" and "Q3", when an authorized agent fetches Sam Rivera's detail with `get-person` and the task's detail with `get-task`, then the person response includes the tag name "VIP" and the task response includes the tag names "VIP" and "Q3" — names only, with no colors or ids.

Covered by `tests/integration/mcp-read-tools.test.ts`, describe block `US3 (011-tags): tags on get-person and get-task`:

- `get-person structuredContent includes tags as an array of tag names ordered case-insensitively` — asserts `tags: ['VIP']`
- `get-task structuredContent includes tags as an array of tag names ordered case-insensitively` — asserts `tags: ['Q3', 'VIP']` (name-ordered case-insensitively)
- `an untagged person returns tags: []`
- `an untagged task returns tags: []`
- `tag entries are plain strings carrying no color or id data` — asserts every entry in `tags` is a `string`

These tests drive the real MCP tool surface through the SDK client (`@modelcontextprotocol/sdk`), authenticated via the mcp-authentik-auth flow's stub identity provider, exactly as `get-person`/`get-task` would be called by an external agent.

## Recorded output

Command: `npx vitest run tests/integration/mcp-read-tools.test.ts --reporter=verbose`

```text
 RUN  v4.1.10 work-helper

 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > list-board returns all configured lanes in order with seeded tasks in the right lanes (US2-AS1) 175ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > list-board succeeds when the client omits `arguments` entirely (a conversational client calling a zero-arg tool) 60ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-task returns title, lane, notes newest-first, and linked people (US2-AS2) 58ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-task errors for an unknown task id 52ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > search-people finds Sam Rivera by substring and excludes Ana Alvarez (US2-AS3) 52ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > search-people returns an empty success result for no matches 55ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-person returns first/last/email/phone/extraFields (US2-AS3) 50ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-person errors for an unknown person id 50ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-person and search-people return the primary email when a person has two, the second marked primary (mcp-tools contract assertion 1) 50ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-person returns null email and phone for a person with neither (mcp-tools contract assertion 2) 55ms
 ✓ tests/integration/mcp-read-tools.test.ts > US2: read tools > get-person and search-people immediately return the promoted survivor after the primary email is removed (mcp-tools contract assertion 3) 54ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3: position field and board-mirror ordering > list-board includes position on every task summary 47ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3: position field and board-mirror ordering > get-task includes position 48ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3: position field and board-mirror ordering > create-task includes position and appends at the bottom of the first configured lane 53ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3: position field and board-mirror ordering > list-board mirrors GET /api/board lane membership and (position, id) order after arranging the board via the placement endpoint (FR-010/SC-005) 48ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3 (011-tags): tags on get-person and get-task > get-person structuredContent includes tags as an array of tag names ordered case-insensitively 48ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3 (011-tags): tags on get-person and get-task > get-task structuredContent includes tags as an array of tag names ordered case-insensitively 54ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3 (011-tags): tags on get-person and get-task > an untagged person returns tags: [] 46ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3 (011-tags): tags on get-person and get-task > an untagged task returns tags: [] 46ms
 ✓ tests/integration/mcp-read-tools.test.ts > US3 (011-tags): tags on get-person and get-task > tag entries are plain strings carrying no color or id data 49ms

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  13:22:04
   Duration  1.92s (transform 101ms, setup 144ms, import 547ms, tests 1.15s, environment 0ms)
```

The `US3 (011-tags)` describe block (5 tests, all passing) is the evidence for this user story; the surrounding `US2` and `US3: position field...` blocks in the same file are pre-existing coverage from earlier features included here because they share the file.
