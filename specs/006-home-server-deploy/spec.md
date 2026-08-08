# Feature Specification: Home Server Deploy

**Feature Branch**: `006-home-server-deploy`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "@docs/product/features/home-server-deploy.md"

## Clarifications

### Session 2026-08-07

- Q: When the stack is deployed, should the web UI and the MCP endpoint be reachable at a single published address (one port serving both), or at two separately published addresses? → A: Single published port — the deployed app serves the built UI, the API, and the MCP endpoint all on one port.
- Q: Does the existing Caddy run on the same machine as the stack, or a different one? → A: Same machine, and Caddy is itself a Docker container on a shared Docker network — the snippet's upstream is the app container's name (`work-helper:<port>`), not `localhost`.
- Q: Should user data live in a bind-mounted host directory or a Docker named volume? → A: Bind-mounted host directory (e.g. `./data/` in the clone, alongside the mounted config directory) — data is ordinary files on the host.
- Q: What default port should the stack publish on the host for direct (non-Caddy) access? → A: 8080, overridable via a setting in `.env`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time deployment with one documented command (Priority: P1)

As Tyler, I clone the repo onto my home server (a machine that has only Docker installed), create `.env` from the documented `.env.example`, run the single documented deploy command, and the app comes up working: the kanban board shows its lanes and the People page can create a person.

**Why this priority**: Nothing else in this feature matters until the stack can be brought up from a fresh clone. This is the core deliverable — everything else (persistence, recovery, proxying) builds on a working first deploy.

**Independent Test**: On a machine with Docker and a fresh clone, follow only the documented steps and verify the app is reachable and functional at its published address. Delivers a usable deployed app on its own.

**Acceptance Scenarios**:

1. **Given** a machine with Docker and a fresh clone of the repo, where `.env` has been created from the documented `.env.example` with connector password "correct-horse-battery" and the shipped config files are unmodified, **When** I run the documented first-time deploy command (`docker compose up -d --build`) and browse to the app's published address, **Then** the kanban board loads showing lanes To Do, In Progress, Waiting, Done, and the People page loads and can create a person.

---

### User Story 2 - Data survives restarts, rebuilds, and updates (Priority: P1)

As Tyler, tasks and people I create in the deployed app are still there after I stop and restart the stack, and after I update the app by pulling the latest code and rebuilding. Losing data on an update fails acceptance.

**Why this priority**: A deployment that loses data on routine operations is worse than no deployment — Tyler would not trust it with even test data. Persistence is what turns a demo into a home-server install.

**Independent Test**: Create identifiable data through the UI, cycle the stack (stop/start, then update/rebuild), and verify the data is still visible. Testable without any proxy or recovery machinery.

**Acceptance Scenarios**:

1. **Given** the deployed stack with a task "Deployed task" created via the UI and a person "Sam Rivera" created on the People page, **When** I run `docker compose down` followed by `docker compose up -d`, **Then** the board still shows "Deployed task" and the People page still shows "Sam Rivera".
2. **Given** the deployed stack with a task "Survives updates" created via the UI, **When** I run the documented update steps (pull the latest code, then `docker compose up -d --build`), **Then** the board still shows "Survives updates" after the rebuilt stack is up.

---

### User Story 3 - Remote MCP access on the deployed stack (Priority: P2)

As Tyler, an MCP client (e.g. Claude Desktop) can connect to the deployed stack's MCP endpoint, I authenticate on the password page using the connector password from `.env`, and the client can then use the server's tools.

**Why this priority**: Reaching the MCP server from anywhere is a primary motivation for deploying to the home server at all, but it depends on User Story 1 being in place first.

**Independent Test**: Point an MCP client at the deployed stack's MCP endpoint, complete the password page with the `.env` password, and list the server's tools.

**Acceptance Scenarios**:

1. **Given** the deployed stack with connector password "correct-horse-battery" in `.env`, **When** an MCP client connects to the stack's MCP endpoint and I enter "correct-horse-battery" on the password page, **Then** the page reports success and a follow-up call listing the server's tools succeeds.

---

### User Story 4 - Fronted by Tyler's existing Caddy via a documented snippet (Priority: P2)

As Tyler, I paste the deploy doc's Caddyfile snippet into the Caddy I already run, substitute only the placeholder hostname with my real domain, and both the app and the MCP endpoint are reachable through that domain. Security behavior that depends on knowing who the client is — specifically the MCP per-IP lockout — still sees real client addresses, not the proxy's.

**Why this priority**: The domain-fronted setup is how Tyler actually uses the deployment day to day, and the forwarded-client-IP behavior is a security correctness requirement — without it, one attacker could lock everyone out (or evade lockout entirely) because all traffic would appear to come from Caddy.

**Independent Test**: Run a Caddy instance configured with the documented snippet (hostname substituted) in front of the stack, browse to the app through it, connect an MCP client through it, and exercise the lockout from two client addresses. The automated check runs its own Caddy container in front of the stack.

**Acceptance Scenarios**:

1. **Given** a Caddy instance configured with the deploy doc's Caddyfile snippet, changed only by substituting the placeholder hostname (the automated check runs its own Caddy container in front of the stack), **When** I browse to the app through that Caddy, **Then** the kanban board loads, and an MCP client connecting through the same host reaches the password page and — after entering the correct password — can list the server's tools through the proxy.
2. **Given** the stack fronted by Caddy per the documented snippet, **When** one client fails the MCP password three times in a row and a second client with a different IP then tries the correct password through the same Caddy, **Then** the first client is locked out and the second client succeeds — the per-IP lockout counts the forwarded client IPs, not Caddy's own address.

---

### User Story 5 - The stack recovers on its own (Priority: P2)

As Tyler, if the app crashes or the server reboots, the stack comes back without me running anything — I never have to notice an outage happened.

**Why this priority**: A home server reboots for updates and power blips; a deployment that stays down until manually restarted fails the "set and forget" expectation of a self-hosted install.

**Independent Test**: Force-kill the app container and verify it is back and responding within 30 seconds with no compose command run.

**Acceptance Scenarios**:

1. **Given** the deployed stack is running, **When** the app container is force-killed (simulating a crash or a server reboot), **Then** Docker brings it back without any compose command being run, and within 30 seconds the app responds again.

---

### User Story 6 - Operational config lives in a mounted directory (Priority: P3)

As Tyler, the kanban lane and person-field config files live in a directory on the server that is mounted into the stack, so I can edit them with any editor and apply the change by restarting the stack.

**Why this priority**: Valuable for day-to-day tailoring, but the deployment is fully usable with the shipped defaults; this can land last without blocking anything.

**Independent Test**: Edit the lane config file in the mounted directory on the host, restart the stack, and verify the board reflects the change.

**Acceptance Scenarios**:

1. **Given** the deployed stack with the kanban lane config in the mounted config directory, **When** I add a lane "Blocked" between "Waiting" and "Done" in that file and restart the stack, **Then** the board shows five lanes in the order To Do, In Progress, Waiting, Blocked, Done.

---

### Edge Cases

- `.env` is missing or lacks a required value (e.g. the connector password): the stack must fail fast with a clear error naming the missing setting, rather than starting with an insecure or broken default.
- The published host port (default 8080) is already taken on the server: the deploy command fails with Docker's port-conflict error; the deploy doc points the reader at the `.env` port setting to change.
- A config file in the mounted directory is malformed: the app surfaces a clear startup error identifying the file rather than silently falling back to defaults (matches the app's existing config-validation behavior).
- The proxy in front of the stack does not send forwarded-client-IP information (a proxy other than the documented snippet): lockout counting degrades to seeing the proxy's address; the documented snippet is the supported configuration and includes what the app needs.
- Requests that bypass Caddy and hit the stack's published port directly: the app still works and lockout counts the direct client address.
- The app container crash-loops (repeated kills): Docker keeps restarting it per its restart policy; this feature requires recovery from a single kill within 30 seconds, not crash-loop diagnostics (monitoring is out of scope).
- An update changes the data schema: during the development phase the data policy permits a reset in that case (see Assumptions); the update-survival criterion applies to updates that do not change the schema.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repo MUST be deployable on a machine that has only Docker installed, by cloning the repo, creating `.env` from the shipped example file, and running the single documented first-time deploy command (`docker compose up -d --build`).
- **FR-002**: The repo MUST ship a documented `.env.example` listing every setting the deployment needs — including the MCP connector password — with a comment or doc line explaining each.
- **FR-003**: The documented deploy command MUST build and start the full stack in the background and leave the app's UI and MCP endpoint reachable at a single published address — one port serving both, unlike dev's separate UI and API ports. The published host port defaults to 8080 and is overridable via a setting in `.env`.
- **FR-004**: All user data created through the app (tasks, people, notes, tags, links) MUST be stored in a bind-mounted host directory (e.g. `./data/` in the clone) — ordinary files on the host, outside the containers' lifecycle — so that it survives `docker compose down` + `up`, image rebuilds, and the documented update procedure.
- **FR-005**: The deploy doc MUST describe an update procedure — pull the latest code, then rerun the build-and-start command — after which previously created data is still present.
- **FR-006**: The stack MUST restart automatically after an app crash and after a server reboot, with no compose command run by the operator; after a force-kill the app MUST respond again within 30 seconds.
- **FR-007**: The kanban lane and person-field config files MUST live in a host directory mounted into the stack; editing a file there and restarting the stack MUST apply the change.
- **FR-008**: The MCP connector password gate MUST work on the deployed stack exactly as it does in development: correct password succeeds and enables tool listing; the existing per-IP lockout applies.
- **FR-009**: The deploy doc MUST include a Caddyfile snippet using a placeholder hostname (e.g. `work-helper.example.com`) such that substituting the hostname is the only edit needed; the snippet's upstream is the app container's name on a Docker network shared with Caddy (`work-helper:<port>`), and the deploy doc MUST describe how to connect the operator's Caddy container to that network. Through a Caddy configured with that snippet, the app UI and the MCP endpoint MUST both be reachable on the same host.
- **FR-010**: When fronted by the documented Caddy configuration, the app MUST attribute requests to the forwarded client address, so the MCP per-IP lockout counts distinct real clients rather than the proxy: a client that fails the password three times is locked out while a different client succeeding through the same proxy is unaffected.
- **FR-011**: If a required setting is missing from `.env`, the stack MUST fail to start with a clear error naming the missing setting rather than running with a default.
- **FR-012**: The repo and docs MUST NOT contain Tyler's real hostname; all examples use a placeholder domain.

### Key Entities

- **Deployment stack**: The set of services started by the deploy command — the app (UI + MCP server) and its supporting pieces — treated as one unit that is started, stopped, updated, and restarted together.
- **Environment file (`.env`)**: The operator-created file holding per-install settings (e.g. the MCP connector password), created once from the shipped example and never committed.
- **Data store**: A host directory (e.g. `./data/` in the clone) bind-mounted into the stack, holding all user data as ordinary host files, so containers can be destroyed and rebuilt around it.
- **Mounted config directory**: A host directory containing the operational config files (kanban lanes, person fields) that the stack reads at startup.
- **Caddyfile snippet**: The documented reverse-proxy fragment with a placeholder hostname that Tyler pastes into his existing Caddy (a container sharing a Docker network with the stack, reaching the app by container name) to publish the app and MCP endpoint at his domain.
- **Deploy doc**: The repo document describing first-time deploy, updates, and Caddy integration end to end.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from a fresh clone on a Docker-equipped machine, a reader following only the deploy doc reaches a working app (board and People page usable in a browser) without consulting any other source or performing any undocumented step.
- **SC-002**: 100% of data created before a stack stop/start or a code update is still visible afterwards — zero data loss across the documented lifecycle operations.
- **SC-003**: After a forced app crash, the app responds again within 30 seconds with zero operator actions.
- **SC-004**: A lane added to the mounted config file appears on the board, in the specified position, after one restart.
- **SC-005**: An MCP client holding the connector password can go from "not connected" to "tools listed" against the deployed stack, both directly and through the documented proxy configuration.
- **SC-006**: With the stack behind the documented proxy, per-client lockout decisions are made per real client: three failures from one client lock out only that client, and a different client's correct password still succeeds.
- **SC-007**: A repo-wide search finds no occurrence of Tyler's real hostname; every hostname in docs and config examples is the placeholder domain.

## Assumptions

- Docker (with the Compose plugin) is the one prerequisite on the server, and the Docker daemon itself starts on boot — the stack's auto-start after reboot rides on Docker's restart policies, with no separate init/system integration shipped by this feature.
- Docker Compose and Caddy are product decisions recorded in the PRD and constitution (deployment target: self-hosted Docker; Tyler's existing Caddy fronts the stack), not implementation choices this spec is free to revisit. The deploy command and Caddyfile snippet are user-facing surface for this feature — Tyler types them — so the spec names them deliberately.
- TLS/certificates are entirely Caddy's job; the stack itself serves plain HTTP to the proxy and to the automated checks.
- Tyler's Caddy runs as a Docker container on the same machine as the stack and reaches the app over a shared Docker network by container name (`work-helper:<port>`); the snippet ships with that upstream, so the placeholder hostname remains the only edit. The stack still publishes a host port for direct (non-proxied) access.
- The MCP password gate and per-IP lockout (three failures) already exist from the MCP server feature (004); this feature does not change their rules, only ensures they behave correctly in the deployed and proxied environment.
- This deployment is not production: it holds test data only, and the constitution's development-phase data policy stays in force. Update-survival (FR-004/FR-005) is about container lifecycle — data must never be lost because containers were rebuilt — while a schema-changing update may still reset data under the dev-phase policy until the production cutover flips it.
- Backups/restore, monitoring, automatic updates, prebuilt registry images, a bundled Caddy container, email ingestion config, and multi-server setups are all explicitly out of scope per the PRD.
- Single operator (Tyler), single server; concurrent-operator concerns don't apply.
