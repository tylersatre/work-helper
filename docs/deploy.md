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
| `MS_CLIENT_ID` | no | — | Entra ID app registration client id for email sync. Leave unset to run without email sync — the `sync-emails` tool reports a clear "not connected" error instead of failing to start. See [Email sync mailbox sign-in](#email-sync-mailbox-sign-in) below. |

## Updating

```bash
git pull
docker compose up -d --build
```

All your data lives in `./data/` on the host, outside the container, so it survives every update — the new image starts up, sees the existing files, and keeps going. (Dev-phase caveat: a schema-changing update may still reset data — this project doesn't yet build data-preserving migrations.)

## Fronting with Caddy

If you already run Caddy on your server, front work-helper with it instead of exposing `WORK_HELPER_PORT` directly. (If Authentik provides SSO on your server, use [Fronting with Caddy and Authentik](#fronting-with-caddy-and-authentik) below instead — the Caddy snippet is different.) Add this to your Caddyfile, substituting your real hostname for the placeholder — that's the only edit:

```caddy
work-helper.example.com {
	reverse_proxy work-helper:8080 {
		header_up X-Forwarded-For {remote_host}
	}
}
```

`work-helper:8080` is the container's DNS name on the `work-helper` Docker network compose creates — not `WORK_HELPER_PORT`, which is unrelated and only matters for direct (non-Caddy) access. The `header_up X-Forwarded-For {remote_host}` line makes explicit what Caddy already does by default (overwrite `X-Forwarded-For` with the address it actually observed, discarding anything a client sent) — keep it in place; it's the thing standing between MCP's per-client lockout (below) and a client that tries to forge that header.

One-time setup: attach your existing Caddy container to the `work-helper` network so it can resolve that DNS name:

```bash
docker network connect work-helper <your-caddy-container-name>
```

With the `header_up` override above, work-helper's per-client lockout attributes attempts to the real client IP, not Caddy's, as long as clients go through this documented setup. A client that bypasses Caddy and hits `WORK_HELPER_PORT` directly still works; its lockout is just counted by its own address (and that address is a self-declared header, not cryptographically verified — the documented Caddy setup is the supported configuration for correct attribution).

## Fronting with Caddy and Authentik

This is the deployed setup: Authentik sits in front of the web UI, so opening work-helper in a browser requires an Authentik login. The MCP and OAuth endpoints are deliberately carved out of Authentik and keep the app's own protection (the connector password flow plus bearer tokens), because MCP clients are programs — they cannot complete an interactive Authentik login.

Caddy routes the hostname to Authentik's embedded outpost rather than to work-helper directly — Authentik authenticates the request and then proxies it to the app:

```caddy
work-helper.example.com {
	reverse_proxy authentik-server:9000
}
```

In the Authentik admin UI:

1. Create a **Proxy Provider** with mode **Proxy** (not *Forward auth*), External host `https://work-helper.example.com` (your real hostname), and Upstream `http://work-helper:8080`.
2. In the provider's advanced protocol settings, add **Unauthenticated Paths** (one regex per line): `^/mcp`, `^/oauth/`, and `^/\.well-known/`. Without these, MCP clients hit Authentik's login redirect and never reach the connector password page.
3. Create the Application pointing at that provider.
4. Assign the provider to the embedded outpost: **Applications → Outposts → authentik Embedded Outpost → edit**, and add the application there.

One-time setup: attach the Authentik server container to the `work-helper` network so the outpost can reach the upstream (same idea as the Caddy attach step above):

```bash
docker network connect work-helper <your-authentik-server-container-name>
```

To verify the setup end to end: the hostname in a browser should bounce through an Authentik login and land on the kanban board, and `curl https://work-helper.example.com/.well-known/oauth-authorization-server` should return endpoint URLs that start with `https://work-helper.example.com` — that confirms the forwarded host and protocol survive the Caddy → Authentik → app chain. Per-client lockout attribution keeps working through this chain: Caddy records the real client address in `X-Forwarded-For` and Authentik's outpost passes it through.

## Configuration files

`./config/lanes.json` (kanban lane names, in order) and `./config/person-fields.json` (custom person fields) are ordinary host files, tracked in your clone. Edit one and apply it with:

```bash
docker compose restart
```

A malformed config file fails startup — `docker compose logs` names the file so you know what to fix. If you edit these on the server, `git pull` can conflict with your local changes; commit or stash your edits before pulling.

## Email sync mailbox sign-in

Email sync (the `sync-emails` MCP tool and friends) needs a one-time interactive sign-in that the container itself can't perform — `npm run mail:signin` opens a device-code flow, and the runtime image doesn't ship the dev tooling (`tsx`, `scripts/`) that command needs. Run it from your host clone instead, against the same `./data/` directory the container reads:

```bash
MS_CLIENT_ID=<your-app-registration-client-id> npm run mail:signin
```

This writes `./data/mail-token-cache.json` — the same path the container reads by default. Then set `MS_CLIENT_ID` in `.env` and restart the stack:

```bash
docker compose up -d
```

The refresh token in the cache keeps sync working unattended after this; re-run the command above only if the cache is invalidated (the tool's error message says so explicitly, pointing back at this command).

## Stop, start, and logs

```bash
docker compose down       # stop the stack
docker compose up -d      # start it again
docker compose logs -f    # follow logs (startup errors show up here)
```

## Troubleshooting

- **Host port already in use** — `docker compose up` reports the port as taken. Set a different `WORK_HELPER_PORT` in `.env` and retry.
- **Missing `CONNECTOR_PASSWORD`** — `docker compose up` refuses to start any container and prints an error naming `CONNECTOR_PASSWORD`. Set it in `.env` and retry.
- **Malformed config file** — the container exits at startup; `docker compose logs` shows an error naming the specific file in `./config/`. Fix that file and `docker compose restart`.
- **"active endpoints" warning on `docker compose down`** — expected and harmless if your Caddy container is attached to the `work-helper` network. The stack still stops; the next `docker compose up -d` reuses the existing network. The documented update procedure (`git pull` + `up -d --build`) never runs `down`, so you'll only see this if you stop the stack manually.
- **A client bypassing Caddy** — hitting `WORK_HELPER_PORT` directly still works; MCP's per-client lockout just counts that client by its own address instead of a forwarded one.
- **Hostname shows the Authentik dashboard instead of work-helper** — the embedded outpost isn't claiming the hostname, so requests fall through to the Authentik core UI. Check the three usual causes: the provider is an OAuth2/OIDC provider instead of a **Proxy Provider**, the provider's mode is *Forward auth* instead of **Proxy**, or the provider was never assigned to the embedded outpost (step 4 above).
- **MCP client can't connect through Authentik** — check the provider's **Unauthenticated Paths** include `^/mcp`, `^/oauth/`, and `^/\.well-known/` (step 2 above); without them Authentik redirects the MCP client to a login page it cannot use.
