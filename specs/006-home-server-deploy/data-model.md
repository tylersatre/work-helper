# Data Model: Home Server Deploy

**Feature**: 006-home-server-deploy | **Date**: 2026-08-07

This feature changes no database schema — the app's SQLite schema and Drizzle migrations are untouched. The "entities" here are the deployment artifacts from the spec's Key Entities, made concrete.

## Entities

### Deployment stack

The unit started, stopped, updated, and restarted together (spec: Deployment stack).

| Field | Value |
|---|---|
| Compose file | `compose.yaml` at the repo root |
| Service | `work-helper` (the only service) |
| Image | Built locally from `Dockerfile` (multi-stage, `node:22-bookworm-slim`) — never pulled from a registry |
| In-container port | 8080, fixed (`PORT=8080` baked into the image) |
| Published port | `${WORK_HELPER_PORT:-8080}` on the host → 8080 in the container |
| Restart policy | `unless-stopped` (with `init: true` so a crashed app process exits the container and the policy fires) |
| Runtime env | `NODE_ENV=production` (image), `CONNECTOR_PASSWORD` (from `.env`, required via `${VAR:?}` interpolation) |

**Relationships**: mounts the Data store and the Mounted config directory; joins the shared network; is the upstream of the Caddyfile snippet.

### Environment file (`.env`)

Operator-created from `.env.example`, never committed (spec: Environment file).

| Setting | Required | Default | Meaning |
|---|---|---|---|
| `CONNECTOR_PASSWORD` | yes | — | Password MCP clients enter on the connector password page. Missing ⇒ `docker compose up` aborts naming the setting (FR-011). |
| `WORK_HELPER_PORT` | no | `8080` | Host port the stack publishes for direct (non-Caddy) access (FR-003). |

**Validation rules**: compose interpolation rejects a missing/empty `CONNECTOR_PASSWORD` before any container starts; `src/server/env.ts` re-validates inside the container (production only) and exits non-zero with the setting's name.

### Data store

| Field | Value |
|---|---|
| Host path | `./data/` in the clone (bind mount) |
| Container path | `/app/data` |
| Contents | `work-helper.db` (SQLite; all tasks, people, notes, tags, links — FR-004) |
| Lifecycle | Created and migrated by the app at first startup (`createDb` — `mkdirSync` + Drizzle `migrate`); survives `down`/`up`, rebuilds, and updates because it lives outside the containers; excluded from the image by `.dockerignore` |

### Mounted config directory

| Field | Value |
|---|---|
| Host path | `./config/` in the clone (bind mount; these are the repo's tracked config files) |
| Container path | `/app/config` |
| Contents | `lanes.json` (kanban lanes), `person-fields.json` (custom person fields) |
| Apply changes | Edit on host → `docker compose restart` (FR-007, US6) |
| Validation | Existing loaders reject unreadable/malformed files at startup with an error naming the file (spec edge case) |

### Shared network

| Field | Value |
|---|---|
| Name | `work-helper` (compose-managed; explicit `name:` so it is stable across clone directory names) |
| Members | The `work-helper` service (DNS alias `work-helper`); the operator's Caddy container after a one-time `docker network connect work-helper <caddy-container>` |

### Caddyfile snippet

Documented in `docs/deploy.md` (spec: Caddyfile snippet). Placeholder hostname `work-helper.example.com`; upstream `work-helper:8080`; substituting the hostname is the only edit (FR-009, FR-012). Caddy's `reverse_proxy` supplies `X-Forwarded-For`, which the app honors via `trustProxy: true` (FR-010).

### Deploy doc

`docs/deploy.md` (spec: Deploy doc) — first deploy, `.env` reference, updates, stop/start/logs, Caddy integration, troubleshooting keyed to the spec's edge cases. The README links to it. SC-001 treats this doc as the sole source a reader needs.

## State transitions (stack lifecycle)

```text
absent ──(clone + cp .env.example .env + edit)──► configured
configured ──(docker compose up -d --build)──► running          [US1: first deploy]
running ──(docker compose down)──► stopped ──(up -d)──► running  [US2: data intact]
running ──(git pull + up -d --build)──► running (new image)      [US2: data intact]
running ──(app process dies)──► restarting ──(≤30 s)──► running  [US5: no operator action]
running ──(edit config/ + restart)──► running (new config)       [US6]
running ──(server reboot)──► running (daemon + unless-stopped)   [FR-006]
configured-but-invalid (.env missing password) ──(up)──► failed with error naming CONNECTOR_PASSWORD [FR-011]
```

Invariant across every transition except `absent`: the contents of `./data/` are never created, modified, or deleted by lifecycle operations — only by the app serving user actions (SC-002).
