# Contract: Operator Deployment Surface

**Feature**: 006-home-server-deploy | **Date**: 2026-08-07

This is the external interface the feature exposes. Its consumer is the operator (Tyler) following `docs/deploy.md`, plus the operator's Caddy. Anything listed here is acceptance surface; changing it after release is a breaking change to the deploy doc.

## Files the repo ships

| File | Contract |
|---|---|
| `compose.yaml` | Defines the whole stack; every command below runs against it from the repo root. |
| `Dockerfile` | Builds the app image locally; never assumes a registry. |
| `.env.example` | Lists **every** setting the deployment reads, each with an explanatory comment (FR-002). Copy to `.env` and edit — that is the entire configuration step. |
| `docs/deploy.md` | The deploy doc; SC-001 requires it to be sufficient on its own. |

## Environment settings (read from `.env` by compose)

| Variable | Required | Default | Behavior when missing |
|---|---|---|---|
| `CONNECTOR_PASSWORD` | yes | — | `docker compose up` fails before starting containers with an error containing the variable name (FR-011). |
| `WORK_HELPER_PORT` | no | `8080` | Stack publishes on 8080. |

No other settings are **required** by the deployed stack — the app has internal env overrides (`DATABASE_PATH`, `LANES_CONFIG_PATH`, `PERSON_FIELDS_CONFIG_PATH`, `PORT`) whose defaults already align with the image and mounts, so the deployment leaves them unset; lane/person-field config is files in `./config/` (below).

## Lifecycle commands (the documented operator interface)

| Operation | Command(s) | Postcondition |
|---|---|---|
| First deploy | `git clone …` → `cp .env.example .env` → edit → `docker compose up -d --build` | UI, API, and MCP reachable at `http://<host>:${WORK_HELPER_PORT:-8080}` (FR-001, FR-003) |
| Stop / start | `docker compose down` / `docker compose up -d` | All user data intact afterwards (FR-004) |
| Update | `git pull` → `docker compose up -d --build` | New code running; all user data intact (FR-005) |
| Apply config edit | edit file in `./config/` → `docker compose restart` | New lanes/fields live (FR-007) |
| Logs | `docker compose logs -f` | Startup errors (missing setting, malformed config) visible here |
| Crash / reboot | *(none)* | Stack self-recovers; app responds within 30 s of a crash (FR-006) |

## Mounted paths

| Host path (in clone) | Container path | Purpose |
|---|---|---|
| `./data/` | `/app/data` | All user data (`work-helper.db`); survives every lifecycle operation above |
| `./config/` | `/app/config` | `lanes.json`, `person-fields.json`; edit + restart to apply |

## Network contract (Caddy integration)

- Network name: `work-helper` (created by compose on first `up`).
- One-time attach: `docker network connect work-helper <caddy-container-name>`.
- Upstream DNS name from inside the network: `work-helper`, port `8080` — independent of `WORK_HELPER_PORT`.

### Caddyfile snippet (verbatim from the deploy doc; hostname is the only edit — FR-009)

```caddy
work-helper.example.com {
	reverse_proxy work-helper:8080
}
```

Contract with the app: Caddy's `reverse_proxy` sends `X-Forwarded-For`; the app (Fastify `trustProxy: true`) attributes each request to the forwarded client IP, so MCP per-IP lockout counts real clients (FR-010). Proxies that strip forwarding headers degrade lockout to the proxy's address and are unsupported (spec edge case).

## HTTP surface behind the single port

All of the following are served on the one published port, both directly and through Caddy:

| Path | What |
|---|---|
| `/`, `/people`, `/people/:id`, `/tasks/:id` | Vue client (direct navigation to any of these returns the app shell — SPA fallback) |
| `/api/*` | REST API consumed by the client |
| `/mcp` | MCP endpoint (Streamable HTTP; Bearer token required) |
| `/oauth/*`, `/.well-known/*` | OAuth flow incl. the connector password page and lockout behavior from feature 004 |

## Failure-mode contract (spec edge cases)

| Condition | Observable behavior |
|---|---|
| `.env` missing or `CONNECTOR_PASSWORD` empty | `docker compose up` exits with an error naming `CONNECTOR_PASSWORD`; nothing starts |
| Host port already in use | Docker's port-conflict error; deploy doc points at `WORK_HELPER_PORT` |
| Malformed file in `./config/` | Container exits at startup; `docker compose logs` shows an error naming the file (existing loader behavior) |
| `docker compose down` while Caddy is attached to the network | Stack stops normally; a cosmetic "active endpoints" network-removal error is expected and documented |
| Client bypasses Caddy (direct port) | App works; lockout counts the direct client address |
