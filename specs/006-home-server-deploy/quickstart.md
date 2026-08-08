# Quickstart: Validating Home Server Deploy

**Feature**: 006-home-server-deploy | **Date**: 2026-08-07

How to prove this feature works end to end. Interface details live in [contracts/deployment-surface.md](contracts/deployment-surface.md); decisions and rationale in [research.md](research.md).

## Prerequisites

- Docker Desktop running (`docker version` succeeds) — the deploy suite and the manual pass both drive real containers.
- Node ≥ 22 and `npm ci` done (standard for this repo; the worktree SessionStart hook handles it).
- No stale test containers from a previous aborted run: `docker ps -a --filter name=work-helper` should be empty of leftovers (the harness tears down after itself; clean up manually only after a hard interrupt).

## Automated checks

### Fast suites (Stop-hook gate — no Docker needed)

```bash
npm test
```

Covers the two code changes: production env fail-fast (`tests/unit/env.test.ts`) and SPA history fallback (`tests/integration/spa-fallback.test.ts`), plus all pre-existing suites. Expected: all green in well under a minute.

### Deploy acceptance suite (requires Docker; slow by nature)

```bash
npm run test:deploy
```

Runs `tests/deploy/` sequentially via `vitest.deploy.config.ts`. Each file copies the working tree to a temp dir, writes a test `.env`, and drives `docker compose` for real — expect several minutes total, dominated by image builds (later files reuse Docker layer cache). Expected: all green; teardown leaves no containers, networks, images (`--rmi local`), or temp dirs behind.

Not automated: FR-006's server-reboot leg rides on the spec assumption (Docker daemon starts on boot + `restart: unless-stopped`) — the force-kill test exercises the same restart-policy mechanism, but no reboot is performed by the suite.

| Test file | Proves (spec ref) |
|---|---|
| `fresh-deploy.test.ts` | US1/SC-001: fresh copy + documented command ⇒ board lanes To Do/In Progress/Waiting/Done and person creation work on the single published port; FR-011: missing password fails fast naming `CONNECTOR_PASSWORD` |
| `persistence.test.ts` | US2/SC-002: task + person survive `down`+`up`; task survives simulated update (source change + `up -d --build`) |
| `recovery.test.ts` | US5/SC-003: `docker exec … pkill -9 node` ⇒ responding again within 30 s, no compose command run |
| `config-mount.test.ts` | US6/SC-004: "Blocked" lane added to host `config/lanes.json` + restart ⇒ five lanes in order; malformed config ⇒ startup error naming the file in compose logs |
| `mcp-connect.test.ts` | US3/SC-005: password page with `.env` password ⇒ success ⇒ tools list on the deployed stack |
| `caddy-proxy.test.ts` | US4/SC-005/SC-006: doc's snippet (hostname → `work-helper.localhost`) in `caddy:2-alpine`; board + password page reachable through it; correct password through Caddy leads to a successful tools list (SC-005's proxied leg); two client containers prove per-client lockout (FR-010) |

## Manual smoke (mirrors the deploy doc)

From a scratch copy of the repo (not this worktree — keep its `./data` clean):

```bash
cp .env.example .env
```

Edit `.env`: set `CONNECTOR_PASSWORD` (and optionally `WORK_HELPER_PORT` if 8080 is taken locally). Then:

```bash
docker compose up -d --build
```

Expected outcomes, in order:

1. Browse `http://localhost:8080` — kanban board with lanes To Do, In Progress, Waiting, Done; `/people` loads directly (SPA fallback) and can create a person.
2. Point an MCP client (e.g. Claude Desktop) at `http://localhost:8080/mcp` — password page appears; the `.env` password succeeds; tools list.
3. `docker compose down && docker compose up -d` — created data still there.
4. `docker exec $(docker compose ps -q work-helper) pkill -9 node` — within 30 s the app answers again with no compose command.
5. Cleanup: `docker compose down -v --rmi local` and delete the scratch copy.

## Browser evidence

`browser-tester` runs against the deployed stack's published port (not the Vite dev server) after `docker compose up -d --build` in the scratch copy — screenshots under `docs/evidence/006-home-server-deploy/` covering every browser-visible criterion: board lanes and person creation and direct `/people` navigation (US1), data still present after `down`/`up` (US2), the connector password page (US3), the board through the evidence Caddy (US4), and the five-lane board after the config edit (US6). Criteria with no browser-visible surface — the 30 s recovery timing, per-client lockout attribution, compose fail-fast — are evidenced by deploy-suite command output. The `verifier` agent re-runs `npm test` and `npm run test:deploy` itself and checks the evidence against each acceptance scenario.

## Placeholder-hostname check (SC-007/FR-012)

Automated: the deploy suite asserts `docs/deploy.md` contains the `work-helper.example.com` snippet. Manual (verifier/Tyler, since the real hostname must never appear in the repo — including in a grep target): repo-wide search for the real hostname returns nothing.
