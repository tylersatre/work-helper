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

Edit `.env` and set `MCP_TOKEN_SECRET` to any long random value, and `AUTHENTIK_USERINFO_URL` to your Authentik instance's userinfo endpoint (see [.env settings](#env-settings) below — both are required, `docker compose up` refuses to start without them; if you haven't set up Authentik yet, see [Fronting with Caddy and Authentik](#fronting-with-caddy-and-authentik)). Then:

```bash
docker compose up -d --build
```

The app is now reachable at `http://<your-server>:8080` (or the port you set in `WORK_HELPER_PORT`) — the kanban board, the People page, and the MCP endpoint all live on this one port.

## .env settings

| Setting | Required | Default | Meaning |
|---|---|---|---|
| `MCP_TOKEN_SECRET` | yes | — | Token-signing key material for MCP access tokens. `docker compose up` refuses to start without it. Rotate this value to revoke every connected MCP client at once. |
| `AUTHENTIK_USERINFO_URL` | yes | — | Your Authentik instance's userinfo endpoint, reachable from the app container — e.g. `http://<authentik-server-container>:9000/application/o/userinfo/` on the shared `work-helper` network. Used to verify that an MCP connect request genuinely came through your Authentik sign-in. See [Fronting with Caddy and Authentik](#fronting-with-caddy-and-authentik) below. |
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

`work-helper:8080` is the container's DNS name on the `work-helper` Docker network compose creates — not `WORK_HELPER_PORT`, which is unrelated and only matters for direct (non-Caddy) access. The `header_up X-Forwarded-For {remote_host}` line makes explicit what Caddy already does by default (overwrite `X-Forwarded-For` with the address it actually observed, discarding anything a client sent) — keep it in place for accurate client-IP attribution in logs.

One-time setup: attach your existing Caddy container to the `work-helper` network so it can resolve that DNS name:

```bash
docker network connect work-helper <your-caddy-container-name>
```

A client that bypasses Caddy and hits `WORK_HELPER_PORT` directly can still reach the board and API. Either way, MCP client connections only work once Authentik fronts `/oauth/authorize` too — see [Fronting with Caddy and Authentik](#fronting-with-caddy-and-authentik) below.

## Fronting with Caddy and Authentik

This is the deployed setup: Authentik sits in front of the web UI, so opening work-helper in a browser requires an Authentik login. MCP's one interactive step — approving a client's connection request on `/oauth/authorize` — also requires that same Authentik sign-in, and the app verifies that the approval request genuinely came through your Authentik instance (never just a self-declared header) before showing the approval page. The rest of the MCP/OAuth surface — `/oauth/register`, `/oauth/token`, `/mcp`, and discovery — is deliberately carved out of Authentik and stays reachable headless, because those calls come from programs that cannot complete an interactive login.

Caddy routes the hostname to Authentik's embedded outpost rather than to work-helper directly — Authentik authenticates the request and then proxies it to the app:

```caddy
work-helper.example.com {
	reverse_proxy authentik-server:9000
}
```

In the Authentik admin UI:

1. Create a **Proxy Provider** with mode **Proxy** (not *Forward auth*), External host `https://work-helper.example.com` (your real hostname), and Upstream `http://work-helper:8080`.
2. In the provider's advanced protocol settings, set **Unauthenticated Paths** (one regex per line) to exactly:

   ```text
   ^/mcp
   ^/oauth/register
   ^/oauth/token
   ^/\.well-known/
   ```

   `/oauth/authorize` is deliberately *not* in this list — it's the one interactive step, and it needs your Authentik login to protect it. Without the four paths above, headless MCP clients hit Authentik's login redirect on registration, token exchange, `/mcp`, or discovery and never reach the app.
3. Create the Application pointing at that provider.
4. Assign the provider to the embedded outpost: **Applications → Outposts → authentik Embedded Outpost → edit**, and add the application there.

One-time setup: attach the Authentik server container to the `work-helper` network so the outpost can reach the upstream, and so the app container can reach Authentik's userinfo endpoint (same idea as the Caddy attach step above):

```bash
docker network connect work-helper <your-authentik-server-container-name>
```

Then set `AUTHENTIK_USERINFO_URL` in `.env` to this Authentik instance's userinfo endpoint over that network, e.g. `http://<your-authentik-server-container-name>:9000/application/o/userinfo/`, and restart the stack (`docker compose up -d`).

To verify the setup end to end: the hostname in a browser should bounce through an Authentik login and then land on an approval page naming your Authentik username — approving it connects the MCP client that requested it. `curl https://work-helper.example.com/.well-known/oauth-authorization-server` should return endpoint URLs that start with `https://work-helper.example.com`, confirming the forwarded host and protocol survive the Caddy → Authentik → app chain.

**Timing check (manual acceptance)**: once this is set up, add work-helper's `/mcp` URL to your MCP client and note the wall-clock time from pasting that URL to the first successful tool call — it should take well under 2 minutes, with your Authentik account as the only credential entered anywhere.

**Cutover note**: if you're upgrading from an earlier version of work-helper that used a shared `CONNECTOR_PASSWORD`, deploying this version revokes every client connected under that flow — the token-signing key moves from `CONNECTOR_PASSWORD` to `MCP_TOKEN_SECRET`, so each MCP client must reconnect through the Authentik sign-in above.

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
- **Missing `MCP_TOKEN_SECRET` or `AUTHENTIK_USERINFO_URL`** — `docker compose up` refuses to start any container (missing `MCP_TOKEN_SECRET`) or the app exits at startup (missing `AUTHENTIK_USERINFO_URL`), printing an error naming the specific variable. Set it in `.env` and retry.
- **Malformed config file** — the container exits at startup; `docker compose logs` shows an error naming the specific file in `./config/`. Fix that file and `docker compose restart`.
- **"active endpoints" warning on `docker compose down`** — expected and harmless if your Caddy container is attached to the `work-helper` network. The stack still stops; the next `docker compose up -d` reuses the existing network. The documented update procedure (`git pull` + `up -d --build`) never runs `down`, so you'll only see this if you stop the stack manually.
- **A client bypassing Caddy or Authentik** — hitting `WORK_HELPER_PORT` or the app container directly still reaches the board and API, but `/oauth/authorize` always answers with a 403 rejection page unless the request carries a genuine Authentik-forwarded assertion — there is no fallback path.
- **Hostname shows the Authentik dashboard instead of work-helper** — the embedded outpost isn't claiming the hostname, so requests fall through to the Authentik core UI. Check the three usual causes: the provider is an OAuth2/OIDC provider instead of a **Proxy Provider**, the provider's mode is *Forward auth* instead of **Proxy**, or the provider was never assigned to the embedded outpost (step 4 above).
- **MCP client can't connect through Authentik** — check the provider's **Unauthenticated Paths** are exactly the four lines in step 2 above (`^/mcp`, `^/oauth/register`, `^/oauth/token`, `^/\.well-known/`); without them Authentik redirects the MCP client to a login page it cannot use.
- **work-helper shows an error page instead of the Authentik login screen when connecting an MCP client** — either `/oauth/authorize` was left out of the Unauthenticated Paths change above (it must stay authenticated), or the request bypassed the outpost entirely (hit the app container or `WORK_HELPER_PORT` directly instead of going through Caddy → Authentik).
