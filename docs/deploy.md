# Deploying work-helper

This is the complete guide to running work-helper on a home server with Docker. Following only the steps below is enough — no other setup is required.

## Prerequisites

- Docker Engine with Compose v2 (`docker compose version` succeeds). That's the only prerequisite — work-helper builds its own image from source, so no other tools or runtimes are needed on the server.

## First deploy

```bash
git clone <your-fork-or-clone-url>
cd work-helper
cp .env.example .env
```

Edit `.env` and set `CONNECTOR_PASSWORD` to a password of your choice (see [.env settings](#env-settings) below). Then:

```bash
docker compose up -d --build
```

The app is now reachable at `http://<your-server>:8080` (or the port you set in `WORK_HELPER_PORT`) — the kanban board, the People page, and the MCP endpoint all live on this one port.

## .env settings

| Setting | Required | Default | Meaning |
|---|---|---|---|
| `CONNECTOR_PASSWORD` | yes | — | The password MCP clients enter on the connector password page. `docker compose up` refuses to start without it. |
| `WORK_HELPER_PORT` | no | `8080` | The host port the stack publishes. Change this if 8080 is already taken on your server. |

## Updating

```bash
git pull
docker compose up -d --build
```

All your data lives in `./data/` on the host, outside the container, so it survives every update — the new image starts up, sees the existing files, and keeps going. (Dev-phase caveat: a schema-changing update may still reset data — this project doesn't yet build data-preserving migrations.)

## Fronting with Caddy

If you already run Caddy on your server, front work-helper with it instead of exposing `WORK_HELPER_PORT` directly. Add this to your Caddyfile, substituting your real hostname for the placeholder — that's the only edit:

```caddy
work-helper.example.com {
	reverse_proxy work-helper:8080
}
```

`work-helper:8080` is the container's DNS name on the `work-helper` Docker network compose creates — not `WORK_HELPER_PORT`, which is unrelated and only matters for direct (non-Caddy) access.

One-time setup: attach your existing Caddy container to the `work-helper` network so it can resolve that DNS name:

```bash
docker network connect work-helper <your-caddy-container-name>
```

Caddy's `reverse_proxy` sends `X-Forwarded-For`, and work-helper trusts it — so MCP's per-client lockout (below) attributes attempts to the real client IP, not Caddy's, as long as clients go through this documented setup. A client that bypasses Caddy and hits `WORK_HELPER_PORT` directly still works; its lockout is just counted by its own address.

## Stop, start, and logs

```bash
docker compose down       # stop the stack
docker compose up -d      # start it again
docker compose logs -f    # follow logs (startup errors show up here)
```
