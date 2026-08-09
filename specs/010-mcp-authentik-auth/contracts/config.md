# Contract: Configuration & deployment

The operator-facing contract: environment variables, startup gates, and the Authentik/Caddy configuration `docs/deploy.md` must document (FR-008, FR-009, FR-010).

## Environment variables

| Variable | Required | Enforced by | Meaning |
|---|---|---|---|
| `MCP_TOKEN_SECRET` | production: yes | `compose.yaml` `${MCP_TOKEN_SECRET:?...}` gate **and** `validateEnv` (fail-fast at startup) | Token-signing key material. Unchanged across restarts ⇒ connected clients keep working; changed ⇒ every issued token is invalid on next use (the revoke-all lever). |
| `AUTHENTIK_USERINFO_URL` | production: yes | `validateEnv` | The deployment's Authentik userinfo endpoint, reachable from the app container — `http://<authentik-server-container>:9000/application/o/userinfo/` on the shared `work-helper` Docker network. |
| `CONNECTOR_PASSWORD` | **removed** | — | No longer read anywhere; must disappear from `compose.yaml`, `.env.example`, `validateEnv`, and docs. The app starts without it in every environment. |
| `WORK_HELPER_PORT`, `MS_CLIENT_ID` | unchanged | — | Not touched by this feature. |

Non-production behavior: with `MCP_TOKEN_SECRET` unset, MCP/OAuth endpoints answer `503` unconfigured (today's behavior, new message). With it set but `AUTHENTIK_USERINFO_URL` unset, programmatic endpoints work and `/oauth/authorize` rejects every request `403` fail-closed — a misconfigured deployment can never fall back to an unauthenticated grant.

## Startup validation contract

- `validateEnv` (production only, as today): missing `MCP_TOKEN_SECRET` or missing `AUTHENTIK_USERINFO_URL` ⇒ process exits non-zero with an error naming the specific variable and pointing at `.env.example`.
- `compose.yaml`: `docker compose up` without `MCP_TOKEN_SECRET` refuses to start and prints an error naming it (same `:?` mechanism that guarded `CONNECTOR_PASSWORD`).
- Deploy-suite assertion: `tests/deploy/fresh-deploy.test.ts` pins the missing-variable error message.

## Authentik configuration (documented in `docs/deploy.md`, FR-010)

The Proxy Provider (mode **Proxy**, external host `https://work-helper.<domain>`, upstream `http://work-helper:8080`) changes exactly one setting — **Unauthenticated Paths** becomes:

```text
^/mcp
^/oauth/register
^/oauth/token
^/\.well-known/
```

Consequences the doc must state:

- `/oauth/authorize` now requires an Authentik session: browsers are redirected to Authentik login (FR-001), and the outpost forwards the `X-authentik-jwt` assertion on proxied requests.
- `/oauth/register`, `/oauth/token`, `/mcp`, and discovery stay reachable by headless MCP clients (FR-005).
- The app container must reach the Authentik server container for userinfo verification: the existing `docker network connect work-helper <authentik-server-container>` step already provides this; `.env` gains `AUTHENTIK_USERINFO_URL` pointing at that container.
- Troubleshooting updates: "MCP client can't connect" now checks the four-line unauthenticated-paths list; "browser step shows a work-helper error page instead of Authentik login" means `/oauth/authorize` was left unauthenticated or the request bypassed the outpost; stale `CONNECTOR_PASSWORD` troubleshooting rows are removed.

## Cutover note (documented, accepted by spec edge case)

Deploying this feature revokes clients connected under the password flow (token key material changes source); each reconnects through the Authentik flow. No migration path is built (development phase).
