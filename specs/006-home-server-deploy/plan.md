# Implementation Plan: Home Server Deploy

**Branch**: `006-home-server-deploy` | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-home-server-deploy/spec.md`

## Summary

Package the existing single-process app (Fastify serving the API, the MCP endpoint, and the built Vue client) as a one-container Docker Compose stack deployable from a fresh clone with `docker compose up -d --build`. The app already has the load-bearing pieces: production single-port serving (`serveClient` in [app.ts](../../src/server/app.ts)), proxy-aware client IPs (`trustProxy: true`, used by the lockout via `request.ip`), env-driven config paths (`LANES_CONFIG_PATH`, `PERSON_FIELDS_CONFIG_PATH` defaulting to `config/*.json`), and SQLite at `./data/work-helper.db` created and migrated at startup. This feature adds the packaging (`Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`), two small code changes (fail fast in production when `CONNECTOR_PASSWORD` is missing — FR-011; SPA history fallback so direct navigation to `/people` works when the client is served statically — US1), a deploy doc with a paste-ready Caddyfile snippet (FR-009), and a Docker-driven acceptance test suite that exercises the deployed stack's real lifecycle: fresh deploy, persistence across `down`/`up` and rebuild, in-container crash recovery, config-edit-and-restart, and proxied per-client lockout attribution through a real Caddy container.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js ≥ 22 (ESM, NodeNext)

**Primary Dependencies**: Fastify 5 (+ `@fastify/static`), Vue 3 + Vite 8 (client build), better-sqlite3 + Drizzle ORM, `@modelcontextprotocol/sdk`. New for this feature: Docker Engine + Compose v2 (the server's one prerequisite), Caddy 2 (operator-provided; the automated check runs `caddy:2-alpine`). No new npm dependencies.

**Storage**: SQLite file `data/work-helper.db` (created and migrated by `createDb` at startup from the `drizzle/` folder), bind-mounted host directory `./data/` per the spec clarification — ordinary files on the host, no named volume.

**Testing**: Vitest. Existing unit/integration/component suites stay in `npm test` (the Stop-hook gate). New `tests/deploy/` suite — sequential, long timeouts, shells out to `docker compose` — runs via `npm run test:deploy` and is excluded from the default config (needs Docker and minutes of wall clock; the implement and verify phases run it explicitly).

**Target Platform**: Linux home server with only Docker installed; image built on-server from the clone (arch-neutral by construction — no registry images per PRD). Development and automated checks run on macOS Docker Desktop (Docker 29.4 verified present).

**Project Type**: Web app + MCP server packaged as a single container behind a compose stack.

**Performance Goals**: Single operator; post-crash recovery within 30 s with zero operator action (SC-003).

**Constraints**: One published port serving UI + API + MCP (default 8080, overridable via `.env` — FR-003); no prebuilt/registry images; no bundled Caddy; TLS entirely Caddy's job; placeholder hostname only, repo-wide (FR-012); dev-phase data policy — no new migration machinery.

**Scale/Scope**: One operator (Tyler), one server, test data only. Roughly: 4 new infra files, 2 small server changes, 1 deploy doc, ~6 deploy acceptance tests + 2 fast test files.

## Constitution Check

*GATE: evaluated before Phase 0; re-evaluated after Phase 1 design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec Is the Source of Truth | PASS | PRD `docs/product/features/home-server-deploy.md` → spec 006 with clarifications; this plan derives from that spec only. |
| II. Test-First (NON-NEGOTIABLE) | PASS | Every change is ordered red → green: env fail-fast and SPA fallback get failing vitest tests first; the infra itself is driven by failing deploy acceptance tests (red while no `Dockerfile`/`compose.yaml` exists, green once the stack deploys). |
| III. Evidence Over Assertion | PASS | Each acceptance scenario maps to an automated check in `tests/deploy/` or the fast suites (mapping in [quickstart.md](quickstart.md)); browser-tester drives the actually-deployed stack at its published port for evidence; verifier re-runs both. |
| IV. Architecture Constraints | PASS | This feature *implements* the constitution's "self-hosted Docker" deployment target. TypeScript throughout (deploy tests included); MCP server untouched; no ingestion changes. |
| V. Small Vertical Slices, Trunk via PR | PASS | Single feature branch `006-home-server-deploy`, lands via PR, Conventional Commits. |
| Data & migrations (dev phase) | PASS | Persistence here is container-lifecycle only (bind mount survives rebuilds); no data-preserving migration paths, backups, or backfills added. A schema-changing update may still reset data under the policy — the spec's assumptions say exactly this. |

**Post-design re-check (after Phase 1)**: PASS — the design adds no projects, no new frameworks, no migration machinery; Complexity Tracking below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-home-server-deploy/
├── plan.md              # This file
├── research.md          # Phase 0 output — all decisions + rationale
├── data-model.md        # Phase 1 output — deployment artifacts & lifecycle states
├── quickstart.md        # Phase 1 output — how to validate the feature end to end
├── contracts/
│   └── deployment-surface.md  # Phase 1 output — the operator-facing contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
Dockerfile                  # NEW — multi-stage: builder (npm ci, npm run build, prune dev deps) → runtime (dist/, node_modules, drizzle/, config/; NODE_ENV=production, PORT=8080)
.dockerignore               # NEW — keeps data/, node_modules/, dist/, .git, .claude/, docs/evidence out of the build context
compose.yaml                # NEW — service `work-helper`: build ., restart unless-stopped, init: true, ${WORK_HELPER_PORT:-8080}:8080, ./data + ./config bind mounts, network named `work-helper`, CONNECTOR_PASSWORD required via ${VAR:?} interpolation
.env.example                # NEW — CONNECTOR_PASSWORD (required, explained), WORK_HELPER_PORT (optional, default 8080, explained)
docs/
└── deploy.md               # NEW — first deploy, updates, .env reference, Caddyfile snippet + network attach, troubleshooting

src/server/
├── env.ts                  # NEW — production env validation: missing CONNECTOR_PASSWORD → clear error naming the setting (FR-011)
├── index.ts                # CHANGED — calls the validation before building the app
└── app.ts                  # CHANGED — clientDir option (default dist/client) + SPA history fallback for non-API GET/HEAD when serving the client

tests/
├── unit/env.test.ts                    # NEW — fail-fast validation red/green
├── integration/spa-fallback.test.ts    # NEW — serveClient serves index.html for /people, /tasks/1; API 404s stay JSON
└── deploy/                             # NEW — Docker lifecycle acceptance suite (sequential)
    ├── harness.ts                      # temp-dir working-tree copy, .env write, free-port pick, compose project mgmt, teardown
    ├── fresh-deploy.test.ts            # US1: lanes render, person creatable, single port
    ├── persistence.test.ts             # US2: down/up + simulated-update rebuild keep data
    ├── recovery.test.ts                # US5: in-container process kill → responding again ≤ 30 s
    ├── config-mount.test.ts            # US6: add "Blocked" lane on host, restart, board shows it; malformed config fails startup naming the file
    ├── mcp-connect.test.ts             # US3: password page → tools list on the deployed stack
    └── caddy-proxy.test.ts             # US4: doc's snippet (hostname substituted) in a caddy:2-alpine container; proxied password → tools list; two client containers prove per-client lockout

vitest.config.ts            # CHANGED — exclude tests/deploy/** from the default run
vitest.deploy.config.ts     # NEW — includes only tests/deploy, fileParallelism false, testTimeout ≥ 180 s
package.json                # CHANGED — adds "test:deploy" script
README.md                   # CHANGED — points at docs/deploy.md
```

**Structure Decision**: Keep the existing single-project layout — this feature adds packaging around the app, not new source trees. Infra files live at the repo root where Docker expects them; the deploy doc joins the existing `docs/` tree; deployment acceptance tests get their own `tests/deploy/` sibling to the existing suites because they differ in kind (minutes-long, Docker-dependent, sequential) and must not run in the Stop-hook gate.

## Complexity Tracking

No constitution violations — nothing to justify.
