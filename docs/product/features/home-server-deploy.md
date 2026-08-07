# Feature: home-server-deploy

## User story

As Tyler, I want to deploy work-helper to my home server by cloning the repo and running `docker compose up -d --build`, with a documented Caddyfile snippet for the Caddy I already run, so that the app and its MCP server are reachable at my domain and keep their data across restarts, updates, and reboots.

## Acceptance criteria

- **Given** a machine with Docker and a fresh clone of the repo, where `.env` has been created from the documented `.env.example` with connector password "correct-horse-battery" and the shipped config files are unmodified
  **When** I run the documented first-time deploy command (`docker compose up -d --build`) and browse to the app's published address
  **Then** the kanban board loads showing lanes To Do, In Progress, Waiting, Done, and the People page loads and can create a person

- **Given** the deployed stack with a task "Deployed task" created via the UI and a person "Sam Rivera" created on the People page
  **When** I run `docker compose down` followed by `docker compose up -d`
  **Then** the board still shows "Deployed task" and the People page still shows "Sam Rivera"

- **Given** the deployed stack with a task "Survives updates" created via the UI
  **When** I run the documented update steps (pull the latest code, then `docker compose up -d --build`)
  **Then** the board still shows "Survives updates" after the rebuilt stack is up

- **Given** the deployed stack is running
  **When** the app container is force-killed (simulating a crash or a server reboot)
  **Then** Docker brings it back without any compose command being run, and within 30 seconds the app responds again

- **Given** the deployed stack with the kanban lane config in the mounted config directory
  **When** I add a lane "Blocked" between "Waiting" and "Done" in that file and restart the stack
  **Then** the board shows five lanes in the order To Do, In Progress, Waiting, Blocked, Done

- **Given** the deployed stack with connector password "correct-horse-battery" in `.env`
  **When** an MCP client connects to the stack's MCP endpoint and I enter "correct-horse-battery" on the password page
  **Then** the page reports success and a follow-up call listing the server's tools succeeds

- **Given** a Caddy instance configured with the deploy doc's Caddyfile snippet, changed only by substituting the placeholder hostname (the automated check runs its own Caddy container in front of the stack)
  **When** I browse to the app through that Caddy
  **Then** the kanban board loads, and an MCP client connecting through the same host reaches the password page

- **Given** the stack fronted by Caddy per the documented snippet
  **When** one client fails the MCP password three times in a row and a second client with a different IP then tries the correct password through the same Caddy
  **Then** the first client is locked out and the second client succeeds — the per-IP lockout counts the forwarded client IPs, not Caddy's own address

## Out of scope

- Prebuilt images or a registry (GHCR etc.) — deploys build on the server from a clone, by decision.
- Bundling a Caddy container in the stack — Tyler's existing Caddy fronts it; this feature ships only a documented snippet with a placeholder hostname.
- TLS/certificates — Caddy's job, outside the stack.
- Automatic updates (watchtower, scheduled pulls) — updates are manual: pull, rebuild, restart.
- Backups and restore — deferred to the production cutover (see the `production-cutover` stub); this deployment still holds test data only.
- Flipping the constitution's development-phase data policy — by decision this deploy is not yet production; the policy ends when Tyler declares real data starts (see the `production-cutover` stub).
- Monitoring, alerting, or log aggregation.
- Email ingestion configuration (Microsoft Graph credentials) — no ingestion feature exists yet (see the `email-ingestion` stub).
- Putting Tyler's real hostname in the repo — docs use a placeholder like `work-helper.example.com`.
- Multi-server setups or high availability.

## Open questions

All interview questions were resolved with Tyler (2026-08-07):

- Deploy workflow: clone the repo on the server, `docker compose up -d --build`; updates are pull + rebuild.
- Caddy boundary: the stack joins/exposes what the snippet needs; Tyler pastes the snippet into his own Caddyfile. No bundled Caddy.
- Persistence: all data lives in a volume/bind mount and must survive restart, `compose down`, and updates — losing data on update fails acceptance.
- Production status: not yet production — still test data; the dev-phase data policy stays until Tyler declares otherwise.
- Config: `.env` from a documented `.env.example`, plus lane/person-field config files in a mounted directory; edit + restart applies changes.
- Reboot: the stack auto-starts with Docker after a reboot — no manual start.
- Hostname: placeholder in docs; Tyler substitutes his real domain.
- Tyler's manual acceptance pass: browsing to the https:// domain and seeing the kanban board and People pages work. Remote Claude Desktop MCP connection and update-survival are covered by the automated criteria above, not the manual pass.
- None remaining — ready for `/speckit-specify`.
