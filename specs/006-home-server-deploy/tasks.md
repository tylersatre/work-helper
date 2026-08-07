# Tasks: Home Server Deploy

**Input**: Design documents from `/specs/006-home-server-deploy/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/deployment-surface.md](contracts/deployment-surface.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. TDD is non-negotiable (constitution II): every code and infra change below is ordered red → green — the test task runs and fails for the right reason before the implementation task exists. Deploy acceptance tests shell out to real Docker (research R9); the fast suites stay Docker-free.

**Organization**: Tasks are grouped by user story (spec priorities P1 → P3) so each story is independently implementable and testable. `compose.yaml` and `docs/deploy.md` are deliberately built up incrementally — each story's failing deploy test drives exactly the compose keys / doc sections that story needs, converging on the full design in [data-model.md](data-model.md). Do not front-load later stories' compose keys into US1; that would put code ahead of its failing test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US6)
- Every task names its exact file path(s)

## Path Conventions

Single project at the repository root: app code in `src/`, tests in `tests/`, Docker/compose infra files at the root where Docker expects them, deploy doc in `docs/`.

---

## Phase 1: Setup (deploy-suite plumbing)

**Purpose**: Wire up the separate deploy test runner so deploy tests can exist without slowing or breaking the Stop-hook gate (`npm test`).

- [X] T001 [P] Create `vitest.deploy.config.ts`: includes only `tests/deploy/**`, `fileParallelism: false` (sequential files), `testTimeout` ≥ 180_000 ms and hook timeouts to match (research R9)
- [X] T002 [P] Update `vitest.config.ts` to exclude `tests/deploy/**` from the default run so `npm test` stays fast and Docker-free
- [X] T003 [P] Add `"test:deploy": "vitest run --config vitest.deploy.config.ts"` script to `package.json`

**Checkpoint**: `npm test` still green and unchanged in scope; `npm run test:deploy` runs (zero test files found is fine at this point).

---

## Phase 2: Foundational (deploy test harness)

**Purpose**: The shared harness every deploy acceptance test uses. Test infrastructure, not product code — TDD's failing-test-first rule applies to the product changes the tests drive, not to the harness itself.

**⚠️ CRITICAL**: No user-story deploy test can be written before this exists.

- [X] T004 Implement `tests/deploy/harness.ts` (research R9): copy the working tree via `git ls-files --cached --others --exclude-standard` into a scratch temp dir; write `.env` with a test `CONNECTOR_PASSWORD` and a dynamically chosen free host port as `WORK_HELPER_PORT`; run `docker compose -p <unique-project-name>` commands in that dir; HTTP poll/request helpers against the published port; teardown runs `docker compose down -v --rmi local`, removes any extra test containers (Caddy, clients), and deletes the temp dir

**Checkpoint**: Harness importable; nothing uses it yet.

---

## Phase 3: User Story 1 — First-time deployment with one documented command (Priority: P1) 🎯 MVP

**Goal**: Fresh clone on a Docker-only machine + `.env` from `.env.example` + `docker compose up -d --build` ⇒ working app (board lanes, People page with person creation) on one published port (default 8080, `.env`-overridable); missing `CONNECTOR_PASSWORD` fails fast naming the setting.

**Independent Test**: On a machine with Docker and a fresh copy of the repo, follow only the documented steps and verify the app is reachable and functional at its published address (harness-driven in `tests/deploy/fresh-deploy.test.ts`).

### Tests for User Story 1 (write first, confirm RED)

- [X] T005 [P] [US1] Write failing unit test `tests/unit/env.test.ts`: with `NODE_ENV=production` and `CONNECTOR_PASSWORD` unset or empty, the env validation fails with an error naming `CONNECTOR_PASSWORD` (FR-011); with it set, validation passes; outside production, missing password does not fail (dev behavior unchanged). Run `npm test` — RED because `src/server/env.ts` does not exist
- [X] T006 [P] [US1] Write failing integration test `tests/integration/spa-fallback.test.ts`: `buildApp({ serveClient: true, clientDir: <fixture dir with index.html> })` returns the fixture `index.html` with 200 for GET `/people` and GET `/tasks/1`; GET `/api/nope` keeps the JSON 404; non-GET/HEAD requests are not swallowed (research R11). Run `npm test` — RED because the `clientDir` option and fallback do not exist

### Implementation for User Story 1

- [X] T007 [P] [US1] Create `src/server/env.ts` (production-only validation: missing/empty `CONNECTOR_PASSWORD` → clear error naming the setting, exit non-zero) and call it from `src/server/index.ts` before building the app (research R4); `tests/unit/env.test.ts` GREEN
- [X] T008 [P] [US1] Add `clientDir` option (default `dist/client` under cwd) and SPA history fallback to `src/server/app.ts`: when serving the client, a not-found GET/HEAD whose path does not start with `/api`, `/mcp`, `/oauth`, or `/.well-known` gets `index.html` (200); everything else keeps the JSON 404 (research R11); `tests/integration/spa-fallback.test.ts` GREEN
- [X] T009 [US1] Write failing deploy test `tests/deploy/fresh-deploy.test.ts` using the harness: (a) documented command `docker compose up -d --build` on a fresh copy ⇒ lanes To Do, In Progress, Waiting, Done and person creation work via HTTP on the single published port, and GET `/people` returns the app shell (SPA fallback deployed); the harness's dynamically chosen `WORK_HELPER_PORT` doubles as proof the port override works (FR-003); (b) `docker compose up` with `.env` lacking `CONNECTOR_PASSWORD` fails before any container starts with output naming `CONNECTOR_PASSWORD` (FR-011, compose layer). Run `npm run test:deploy` — RED because no `Dockerfile`/`compose.yaml` exists
- [X] T010 [P] [US1] Create `.dockerignore` excluding `data/`, `node_modules/`, `dist/`, `.git`, `.claude/`, `docs/evidence`, `.env` so user data and host artifacts never enter the build context (plan structure; research R5)
- [X] T011 [P] [US1] Create `Dockerfile` (research R2): multi-stage on `node:22-bookworm-slim`; builder installs `python3 make g++`, runs `npm ci`, `npm run build`, `npm prune --omit=dev`; runtime installs `procps` (deliberately front-loaded for US5's in-container `pkill` crash simulation — see T027; an image utility, not behavior, so it does not violate the no-front-loading rule), copies `node_modules`, `dist/`, `drizzle/`, `config/`, `package.json` into `WORKDIR /app`; `ENV NODE_ENV=production PORT=8080`; `CMD ["node", "dist/server-build/server/index.js"]`
- [X] T012 [P] [US1] Create `compose.yaml` with the single service `work-helper`: `build: .`, ports `"${WORK_HELPER_PORT:-8080}:8080"`, environment `CONNECTOR_PASSWORD: ${CONNECTOR_PASSWORD:?CONNECTOR_PASSWORD is required — create .env from .env.example}` (research R3, R4). Restart policy, `init`, bind mounts, and the network name are added by US5/US2/US6/US4 respectively, each behind its own failing test
- [X] T013 [P] [US1] Create `.env.example` documenting every deployment setting with an explanatory comment each: `CONNECTOR_PASSWORD` (required) and `WORK_HELPER_PORT` (optional, default 8080) (FR-002)
- [X] T014 [P] [US1] Create `docs/deploy.md` with the first-deploy sections: prerequisites (Docker with Compose is the only one), first deploy steps (clone → `cp .env.example .env` → edit password → `docker compose up -d --build`), `.env` settings reference, stop/start and logs commands; placeholder-hostname policy applies repo-wide (`work-helper.example.com` only — FR-012)
- [X] T015 [US1] Run `npm run test:deploy -- fresh-deploy` — GREEN; run `npm test` — still GREEN

**Checkpoint**: The stack deploys from a fresh copy with the documented command and is fully usable — this is the MVP.

---

## Phase 4: User Story 2 — Data survives restarts, rebuilds, and updates (Priority: P1)

**Goal**: Tasks and people survive `docker compose down`/`up` and the documented update procedure (pull + rebuild); data lives as ordinary host files in `./data/`.

**Independent Test**: Create identifiable data via the deployed app, cycle the stack (down/up, then simulated update + rebuild), verify the data is still there (`tests/deploy/persistence.test.ts`).

### Tests for User Story 2 (write first, confirm RED)

- [X] T016 [US2] Write failing deploy test `tests/deploy/persistence.test.ts` using the harness: (a) create task "Deployed task" and person "Sam Rivera" via the published port, `docker compose down` then `up -d`, assert both still present (SC-002); (b) create task "Survives updates", modify a source file in the temp copy (simulated update per research R9), `docker compose up -d --build`, assert the task survives the rebuild. Run — RED because without a data bind mount the database dies with the container on `down`

### Implementation for User Story 2

- [X] T017 [P] [US2] Add the `./data:/app/data` bind mount to `compose.yaml` (research R5 — code defaults resolve against `WORKDIR /app`, so no extra env needed; `.dockerignore` already excludes `data/`)
- [X] T018 [P] [US2] Add the update-procedure section to `docs/deploy.md`: `git pull` → `docker compose up -d --build`, data stays because it lives in `./data/` on the host (FR-005); note the dev-phase caveat that a schema-changing update may reset data (spec assumption)
- [X] T019 [US2] Run `npm run test:deploy -- persistence` — GREEN; re-run `npm run test:deploy -- fresh-deploy` — still GREEN

**Checkpoint**: Both P1 stories done — deploy + persistence make the install trustworthy with test data.

---

## Phase 5: User Story 3 — Remote MCP access on the deployed stack (Priority: P2)

**Goal**: An MCP client connects to the deployed stack's MCP endpoint, authenticates via the password page with the `.env` password, and lists tools (FR-008).

**Independent Test**: Point an MCP-style client flow at the deployed stack's published port, complete the password page, list tools (`tests/deploy/mcp-connect.test.ts`).

### Tests for User Story 3

- [X] T020 [US3] Write deploy test `tests/deploy/mcp-connect.test.ts` using the harness: drive the feature-004 connector password flow against the deployed stack's published port with the harness's `.env` password — password page reachable, correct password succeeds, and a follow-up MCP tools-list call succeeds (SC-005). Run it — this story verifies existing behavior in the deployed environment, so it may pass immediately; a failure pinpoints a packaging gap

### Implementation for User Story 3

- [X] T021 [US3] Only if T020 is RED: fix the packaging gap it identifies (e.g. env plumbing in `compose.yaml`/`Dockerfile`, missing artifact in the runtime image) and re-run to GREEN; if T020 passed immediately, record that outcome and mark this task complete with no code change

**Checkpoint**: MCP works on the deployed stack exactly as in development.

---

## Phase 6: User Story 4 — Fronted by Tyler's existing Caddy via a documented snippet (Priority: P2)

**Goal**: The deploy doc ships a Caddyfile snippet (placeholder hostname is the only edit) reaching the app by container name over a shared Docker network; per-IP MCP lockout attributes forwarded client IPs, not Caddy's address (FR-009, FR-010).

**Independent Test**: Run a real `caddy:2-alpine` container configured with the doc's snippet in front of the stack; browse the app and reach the MCP password page through it; prove per-client lockout from two client containers with distinct IPs (`tests/deploy/caddy-proxy.test.ts`).

### Tests for User Story 4 (write first, confirm RED)

- [X] T022 [US4] Write failing deploy test `tests/deploy/caddy-proxy.test.ts` (research R10): parse the Caddyfile snippet verbatim out of `docs/deploy.md` and assert its hostname is the placeholder `work-helper.example.com` (FR-012 automated slice); substitute the hostname to `work-helper.localhost` (the only edit), mount it into a `caddy:2-alpine` container attached to the `work-helper` network; from two throwaway client containers with distinct network IPs, call through Caddy via `curl --resolve work-helper.localhost:443:<caddy-ip> -k`: (a) board reachable and MCP password page reachable through Caddy (SC-005); (b) client A fails the password three times and is locked out, then client B succeeds with the correct password and a follow-up MCP tools-list call through Caddy using client B's credentials succeeds — lockout counted per forwarded client IP, and the full connect-to-tools-listed flow is proven through the documented proxy (FR-010, SC-005 proxied leg, SC-006). Run — RED because the doc has no snippet and the compose network is not named `work-helper`

### Implementation for User Story 4

- [X] T023 [P] [US4] Name the compose-managed default network `work-helper` in `compose.yaml` (explicit `name:` so it is stable across clone directory names — research R7)
- [X] T024 [P] [US4] Add the Caddy section to `docs/deploy.md`: the verbatim snippet (`work-helper.example.com { reverse_proxy work-helper:8080 }` per the contract), the statement that substituting the hostname is the only edit, the one-time `docker network connect work-helper <caddy-container>` attach, and a note that the upstream port 8080 is independent of `WORK_HELPER_PORT` (FR-009)
- [X] T025 [US4] Run `npm run test:deploy -- caddy-proxy` — GREEN

**Checkpoint**: Domain-fronted access works with real per-client lockout attribution.

---

## Phase 7: User Story 5 — The stack recovers on its own (Priority: P2)

**Goal**: After an app crash (or reboot, by the same restart-policy mechanism), Docker brings the app back with no operator action, responding within 30 seconds (FR-006).

**Independent Test**: Force-kill the app process inside the container and verify a genuine container restart plus the app responding again within 30 s with no compose command (`tests/deploy/recovery.test.ts`).

### Tests for User Story 5 (write first, confirm RED)

- [X] T026 [US5] Write failing deploy test `tests/deploy/recovery.test.ts` using the harness (research R6): `docker exec <container> pkill -9 node`, then assert a genuine restart happened — `docker inspect` shows `RestartCount` ≥ 1 (or `StartedAt` changed) — and the published port responds again within 30 s with no compose command run (SC-003). The restart assertion is what makes this RED today: without `init: true`, node is PID 1 and ignores the kill (RestartCount stays 0); with init but no restart policy the container would stay exited

### Implementation for User Story 5

- [X] T027 [US5] Add `restart: unless-stopped` and `init: true` to the `work-helper` service in `compose.yaml` (research R6; `procps`/`pkill` already in the runtime image from T011)
- [X] T028 [US5] Run `npm run test:deploy -- recovery` — GREEN

**Checkpoint**: Crash/reboot recovery is hands-off.

---

## Phase 8: User Story 6 — Operational config lives in a mounted directory (Priority: P3)

**Goal**: `config/lanes.json` and `config/person-fields.json` are host files mounted into the stack; edit + restart applies the change (FR-007).

**Independent Test**: Add a "Blocked" lane to the host copy of `config/lanes.json`, `docker compose restart`, board shows five lanes in order (`tests/deploy/config-mount.test.ts`).

### Tests for User Story 6 (write first, confirm RED)

- [X] T029 [US6] Write failing deploy test `tests/deploy/config-mount.test.ts` using the harness: edit `config/lanes.json` in the temp copy on the host to insert lane "Blocked" between "Waiting" and "Done", run `docker compose restart`, assert the board reports five lanes in order To Do, In Progress, Waiting, Blocked, Done (SC-004); then write malformed JSON to the host `config/lanes.json`, restart, and assert the container fails startup with `docker compose logs` naming the file (spec edge case — proves the existing loader's error survives packaging), restoring the valid config before teardown. Run — RED because without a config mount the container still reads the config baked into the image for both assertions

### Implementation for User Story 6

- [X] T030 [P] [US6] Add the `./config:/app/config` bind mount to `compose.yaml` (research R5)
- [X] T031 [P] [US6] Add the config section to `docs/deploy.md`: which files live in `./config/`, edit + `docker compose restart` to apply, malformed files fail startup with an error naming the file (existing loader behavior — spec edge case), and the local-config-edits vs `git pull` collision note (stash or commit before pulling — research R5)
- [X] T032 [US6] Run `npm run test:deploy -- config-mount` — GREEN

**Checkpoint**: All six user stories independently done.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Finish the deploy doc's acceptance surface, wire the README, and run the full evidence pass.

- [X] T033 [P] Add the troubleshooting section to `docs/deploy.md`, one entry per spec edge case: host port already taken → change `WORK_HELPER_PORT` in `.env`; missing `CONNECTOR_PASSWORD` → the compose error text and fix; malformed config file → startup error names the file in `docker compose logs`; `docker compose down` "active endpoints" network warning while Caddy is attached is cosmetic (research R7); requests bypassing Caddy on the direct port work and are lockout-counted by their own address
- [X] T034 [P] Update `README.md` to link `docs/deploy.md` as the deployment guide
- [X] T035 Full verification pass per [quickstart.md](quickstart.md): `npm test` GREEN, then `npm run test:deploy` (all six files) GREEN, and confirm teardown leaves no containers, networks, local images, or temp dirs behind
- [X] T036 Browser evidence: deploy a scratch copy per quickstart, run the `browser-tester` agent against the deployed stack's published port (not the Vite dev server), saving screenshots under `docs/evidence/006-home-server-deploy/`, covering every browser-visible acceptance criterion per story — US1: board lanes, person creation, direct `/people` navigation; US2: the created task and person still visible after `docker compose down` + `up -d`; US3: the connector password page rendering and reporting success with the `.env` password; US4: the board loading through the test Caddy container (publish a host port on the evidence Caddy, browse the substituted `work-helper.localhost` hostname, accept the internal CA); US6: the board showing five lanes in order after the config edit + restart
- [X] T037 Run the `verifier` agent to independently confirm every acceptance scenario: re-runs `npm test` and `npm run test:deploy`, checks the evidence against spec scenarios, and performs the out-of-repo real-hostname search for SC-007 (research R12 — the repo cannot contain the real hostname even as a grep target). Constitution III evidence baseline (recorded at `/speckit-analyze` remediation): criteria with no browser-visible surface — the 30 s recovery timing (SC-003), per-forwarded-client lockout attribution (SC-006), and compose fail-fast (FR-011) — are evidenced by the deploy suite's captured command output; every browser-visible criterion has a T036 screenshot

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — blocks all deploy test authoring
- **US1 (Phase 3)**: after Foundational. Blocks every other story — US2–US6 all exercise the stack US1 creates (`Dockerfile`/`compose.yaml`)
- **US2 (Phase 4), US3 (Phase 5), US4 (Phase 6), US5 (Phase 7), US6 (Phase 8)**: each depends only on US1, not on each other; executed in priority order (P1 → P2 → P3) when run sequentially
- **Polish (Phase 9)**: T033/T034 anytime after their content exists; T035–T037 after all stories

### Within Each User Story

- The story's test task runs and is RED for the stated reason before its implementation tasks
- Every task that edits `compose.yaml` (T012, T017, T023, T027, T030) conflicts on that file — never parallel with each other, always inside their own story's red→green window
- Same for `docs/deploy.md` (T014, T018, T024, T031, T033)
- Deploy test files execute sequentially by design (`fileParallelism: false`); "run — GREEN" tasks are checkpoints, not parallelizable

### Parallel Opportunities

- Phase 1: T001, T002, T003 together
- US1 tests: T005 + T006 together; then implementations T007 + T008 together; after T009 is red, T010–T014 together (five different files)
- After US1 completes, the *authoring* of T016, T020, T022, T026, T029 could proceed in parallel (different test files) — but their compose/doc edits and green-runs must serialize per story

---

## Parallel Example: User Story 1

```text
# After T004 (harness) and T009 (fresh-deploy RED), launch together:
Task: "Create .dockerignore"                    (T010)
Task: "Create Dockerfile"                       (T011)
Task: "Create compose.yaml"                     (T012)
Task: "Create .env.example"                     (T013)
Task: "Create docs/deploy.md first-deploy part" (T014)
# Then T015 verifies GREEN sequentially.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Harness) → Phase 3 (US1)
2. **STOP and VALIDATE**: `npm run test:deploy -- fresh-deploy` green means a fresh clone deploys with one documented command — a demonstrable MVP

### Incremental Delivery

1. US1 → deployable app (MVP)
2. US2 → trustworthy persistence (both P1 stories done — the honest "home-server install" bar)
3. US3 → remote MCP verified; US4 → Caddy fronting + lockout attribution; US5 → hands-off recovery
4. US6 → mounted config convenience
5. Polish → troubleshooting doc, README link, full-suite pass, browser evidence, verifier sign-off

Each story leaves all earlier stories' deploy tests green — re-run them at every checkpoint (`npm run test:deploy` runs everything written so far).

---

## Notes

- Total: 37 tasks — Setup 3, Foundational 1, US1 11, US2 4, US3 2, US4 4, US5 3, US6 4, Polish 5
- The deploy suite needs Docker running and takes minutes (image builds dominate; later files reuse layer cache) — it is deliberately outside `npm test` and the Stop-hook gate
- Commit after each task or story checkpoint (Conventional Commits); the whole feature lands as one PR from `006-home-server-deploy`
- Never write Tyler's real hostname anywhere in the repo — placeholder `work-helper.example.com` only (FR-012)
