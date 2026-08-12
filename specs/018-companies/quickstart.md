# Quickstart: Validating the Companies feature

How to prove the feature works end-to-end. Contracts live in [contracts/http-api.md](contracts/http-api.md) and [contracts/mcp-tools.md](contracts/mcp-tools.md); table shapes in [data-model.md](data-model.md).

## Prerequisites

- Node >= 22, dependencies installed (`npm install` — the worktree SessionStart hook normally does this).
- This worktree on branch `018-companies`; dev ports derive from the `018-` prefix: API **3018**, UI **5118**.

## Automated checks (the gate)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

All four must pass (the Stop hook enforces this). Feature-specific suites, runnable in isolation while developing:

```bash
npx vitest run tests/integration/companies.test.ts          # CRUD, validation, ordering, delete-unlink
npx vitest run tests/integration/company-links.test.ts      # person assignment, card links, tag attachments
npx vitest run tests/integration/mcp-company-tools.test.ts  # 8 MCP tools + get-person/get-task company fields
npx vitest run tests/integration/migration-upgrade.test.ts  # fresh vs upgraded schema parity (migration 0002)
npx vitest run tests/component                              # companies-page, company-detail, linked-companies, person-form, app-shell
```

Expected: all green; the MCP suite's recorded output doubles as the evidence for User Story 7 (agent parity), per the constitution's evidence rule.

## Manual / browser validation

Start the dev servers:

```bash
npm run dev   # API on :3018, UI on http://localhost:5118
```

Then walk the user stories (the browser-tester agent automates these same flows and saves evidence to `docs/evidence/018-companies/`):

1. **Companies page (US1)**: Nav shows "Companies"; empty state on first visit; create "Acme Inc" → appears in list and survives reload; create "Zephyr Co" → sorts after "Acme Inc"; creating "acme inc" → 409 validation message; blank name → "A name is required"; open detail → empty people/cards/tags states; rename to "Acme Corp" → reflected on detail + list after reload.
2. **Person assignment (US2)**: Edit a person → company field searches existing companies (substring, case-insensitive), select one, save → person record shows it, company detail lists the person; switch and clear likewise; all states survive reload.
3. **Card links (US3)**: Open a card's detail → linked-companies search adds companies (already-linked ones are not offered); remove one → both the card and the companies' cards sections update; survives reload.
4. **Load-more (US4)**: Seed 30 people + 30 cards linked to one company (test setup / API calls), open its detail → each section shows 25 with its own load-more; one click reveals all 30; sections paginate independently.
5. **Tags (US5)**: On a company detail, type an existing tag's name in the tag input → suggestion attaches the existing tag as a chip; the Tags page count is unchanged.
6. **Delete (US6)**: Delete from company detail → confirmation names linked people/card counts (including 0/0); cancel changes nothing; confirm removes the company everywhere while people, cards, and tags survive.

Quick API smoke checks from the shell, if useful during development:

```bash
curl -s localhost:3018/api/companies | jq                                        # alphabetical list
curl -s -X POST localhost:3018/api/companies -H 'content-type: application/json' -d '{"name":"Acme Inc"}' | jq
curl -s -X POST localhost:3018/api/companies -H 'content-type: application/json' -d '{"name":"acme inc"}' | jq  # expect 409 message
```

## MCP validation (US7)

The integration suite is authoritative (real SDK client through the OAuth approval helper). For an interactive check against the dev server, connect any authorized MCP client to the `/mcp` endpoint on :3018 and drive: `create-company` → `list-companies` → `get-company` → `rename-company` → `set-person-company` → `add-company-to-task` → `get-person`/`get-task` (verify `company`/`companies` fields) → `delete-company`, confirming each step in the web UI as you go (SC-008).

## Migration safety check

```bash
ls drizzle/                      # exactly one new file: 0002_*.sql (0000/0001 untouched)
git diff main -- drizzle/        # additive statements only: 3× CREATE TABLE, 1× CREATE UNIQUE INDEX, 1× ALTER TABLE ADD COLUMN
```

The `migration-upgrade` test proves an existing database upgraded by 0002 matches a fresh database's schema, and that pre-existing rows survive.

## Definition of done

Every acceptance scenario in [spec.md](spec.md) has a passing automated check, browser evidence exists for stories 1–6, recorded MCP test output covers story 7, and the `verifier` agent has independently confirmed both — before the PR is opened.
