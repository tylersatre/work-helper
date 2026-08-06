# Research: Create Task

**Feature**: `001-create-task` | **Date**: 2026-08-06

This is the first feature in a greenfield repository (no `package.json`
exists yet), so this research resolves the foundational stack for the
whole app, not just this slice. Constraints already decided by the
constitution and product brief (not re-litigated here): TypeScript
throughout, MCP server on `@modelcontextprotocol/sdk` (out of scope for
this feature), email ingestion via Microsoft Graph (out of scope),
self-hosted Docker deployment target.

Package versions below were confirmed against the npm registry on
2026-08-06.

## R1. Runtime

**Decision**: Node.js 24 (Active LTS); `engines` set to `>=22`.

**Rationale**: Current Active LTS, native TypeScript-adjacent tooling
support, required baseline for Vite 8 and Vitest 4. Docker images for
Node 24 LTS are standard.

**Alternatives considered**: Bun/Deno — rejected; smaller ecosystem
compatibility surface and no benefit for a self-hosted single-user app.
Node 22 — fine, but 24 is the current LTS and there's no legacy
constraint.

## R2. HTTP server framework

**Decision**: Fastify 5 (v5.11.x).

**Rationale**: TypeScript-first with good type inference; `app.inject()`
lets integration tests exercise real routes without binding a port, which
fits the TDD loop cleanly; `@fastify/static` serves the built client in
production so one process serves both API and UI; the same app instance
can later host Graph ingestion jobs and sit beside the MCP server.

**Alternatives considered**: Express 5 — weaker TypeScript story, no
built-in inject-style testing. Hono — good, but its edge-runtime focus
buys nothing here and Fastify's plugin ecosystem (static serving,
lifecycle hooks) is more mature for a long-lived self-hosted server.
Next.js/Remix full-stack — couples the API to a frontend framework;
the API must also serve future MCP/ingestion concerns that have no UI.

## R3. Database & data access

**Decision**: SQLite via `better-sqlite3` 13, with Drizzle ORM 0.45
(`drizzle-kit` for generated SQL migrations). Database file path
configurable via `DATABASE_PATH` env var (default `./data/work-helper.db`);
tests use `:memory:`.

**Rationale**: Single-user self-hosted tool — a file-based, zero-ops
database is the right operational shape and maps directly to a Docker
volume. `better-sqlite3` is the mature synchronous driver, ideal at this
concurrency level. Drizzle gives a typed schema and real migrations
without a codegen step or runtime binary, and its table types flow into
the shared TypeScript types.

**Alternatives considered**: Prisma — heavier (codegen, query engine),
overkill at this scale. `node:sqlite` built-in — still maturing, no
migration tooling. Postgres — operational overhead (second container)
with no single-user benefit; SQLite keeps the Docker story to one
container + one volume. Raw SQL — no typed schema or migration history.

## R4. Frontend

**Decision**: Vue 3.5 + Vite 8 single-page app (`<script setup>` SFCs,
`@vitejs/plugin-vue` 6, `vue-tsc` 3 for typechecking SFCs). Dev: Vite
dev server proxies `/api` to Fastify. Prod: Vite build output served by
Fastify via `@fastify/static`.

**Rationale**: Tyler (product owner) directed Vue for this project
(2026-08-06), overriding the initially proposed React. Vue is a sound
fit on its own terms: it is Vite's home-team framework with first-class
TypeScript support via `<script setup>` + `vue-tsc`, and the kanban
roadmap (drag between lanes, sorting, filtering) is well served by its
ecosystem (vuedraggable, Atlassian's pragmatic-drag-and-drop).

**Alternatives considered**: React — initially proposed, rejected by
Tyler's explicit direction. Server-rendered templates — simplest for
this slice but hostile to the drag-and-drop kanban that's the point of
the board. SvelteKit/Solid — viable, but not asked for and no ecosystem
advantage here. Nuxt — SSR machinery buys nothing for a self-hosted
internal SPA.

## R5. Testing

**Decision**: Vitest 4 for all automated tests — unit (shared validation,
config loader), API integration (Fastify `app.inject()` against in-memory
SQLite), and component (Vue Testing Library + jsdom). Browser evidence
comes from the `browser-tester` agent driving the real dev server via
Playwright MCP (already configured at project level), with artifacts in
`docs/evidence/create-task/`.

**Rationale**: One test runner across server and client keeps the TDD
loop and the verification gate (single `npm test`) simple. `app.inject()`
+ `:memory:` SQLite makes red→green cycles fast and hermetic. Playwright
evidence stays the acceptance layer per the constitution — it is not
duplicated as a third automated suite in this feature.

**Alternatives considered**: Jest — slower, second-class ESM/Vite story.
Separate Playwright test suite in-repo — redundant with the mandated
browser-tester agent flow for a slice this small; can be added later if
CI needs headless E2E without agents.

## R6. Lane configuration mechanism

**Decision**: JSON file at `config/lanes.json` containing an ordered
array of lane-name strings, e.g.
`["To Do", "In Progress", "Waiting", "Done"]`. Loaded and validated with
zod at server startup; path overridable via `LANES_CONFIG_PATH` env var.

**Rationale**: Tyler decided "config file" in the PRD; JSON needs no
extra dependency, preserves order natively, and validates trivially. An
env-var path override keeps it Docker-friendly (mount or bake the file).
Startup validation (non-empty array, non-empty unique strings) fails fast
with a clear error — spec-wise, handling of missing/empty config is out
of scope, so this is engineering hardening only, not spec'd behavior.

**Alternatives considered**: YAML — adds a dependency for comments we
don't need on a four-item list. Env var — ordered lists in env vars are
awkward to edit. DB-seeded lanes — contradicts the PRD decision and adds
management UI pressure this feature explicitly excludes.

## R7. Shared title validation

**Decision**: zod 4 schema in `src/shared/validation.ts`: title must be a
string that is non-empty after trimming; the trimmed value is what gets
stored. No maximum length (the spec sets no product-level max; the card
must render long titles via CSS wrapping, not truncation at write time).

**Rationale**: One schema imported by both the server route and the
client form means the "whitespace-only is rejected" rule (FR-005,
SC-003) cannot drift between layers. Server-side enforcement is the
authority; client-side use of the same schema provides the inline
validation message.

**Alternatives considered**: Hand-rolled checks per layer — the exact
drift risk shared schemas exist to prevent. DB CHECK constraint as sole
guard — produces driver errors, not user-facing validation messages.

## R8. Identifiers & ordering

**Decision**: `INTEGER PRIMARY KEY AUTOINCREMENT` task ids; tasks within
a lane render in creation order (`id ASC`). Tasks store the lane **name**
(string) as configured at creation time.

**Rationale**: Single-node SQLite — integer PKs are simplest and sort by
creation naturally. Lanes live only in config (FR-007), so there is no
lane table to foreign-key against; storing the name is the direct
representation. Lane renames/removals in config are explicitly out of
scope for this feature.

**Alternatives considered**: UUIDs — useful for distributed sync we don't
have. A lanes DB table synced from config — invents a second source of
truth for something the spec says is config-owned.

## R9. Project layout

**Decision**: Single npm package (no workspaces): `src/server/`,
`src/client/`, `src/shared/`, with `tests/` split by layer. The future
MCP server will live in `src/mcp/` consuming the same service/db layer.

**Rationale**: One package keeps install/test/build single-command for
the verification gate. Nothing in this slice needs workspace isolation;
splitting later is mechanical if the MCP server's dependency surface ever
demands it.

**Alternatives considered**: npm workspaces monorepo (server/client/shared
packages) — structure without payoff at ~10 source files; slows every
loop step now for flexibility we may never need.
