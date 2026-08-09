# Quickstart: validating MCP Authentik Auth

Runnable scenarios proving the feature end to end. Contracts: [oauth-http.md](./contracts/oauth-http.md), [identity-verification.md](./contracts/identity-verification.md), [config.md](./contracts/config.md); entity semantics: [data-model.md](./data-model.md).

## Prerequisites

- Node >= 22, `npm install` done (SessionStart hook handles fresh worktrees).
- Docker Engine with Compose v2 for the deploy suite.
- No Authentik instance needed for anything automated — tests and the dev loop use the simulated outpost (research R6/R7). Real Authentik appears only in Tyler's manual acceptance.

## 1. Unit + integration suites (US1–US5 automated coverage)

```bash
npm test
```

Expected: green run including the new `mcp-identity`, `mcp-approval-tickets`, `mcp-approval-page` unit tests and the rewritten `mcp-connect` (happy path ends in a successful `tools/list`), new `mcp-forged-identity` (every bypass attempt in [identity-verification.md](./contracts/identity-verification.md)'s rejection table ends 403 with no code), `mcp-revocation` (restart keeps tokens, rotation revokes) — and zero remaining references to `CONNECTOR_PASSWORD`, the password page, or the lockout in `src/`.

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all clean (also enforced by the Stop-hook verification gate).

## 2. Interactive walkthrough without Authentik (browser evidence path)

```bash
# terminal 1 — dev server, MCP configured, verifier pointed at the sim's stub userinfo
MCP_TOKEN_SECRET=dev-secret AUTHENTIK_USERINFO_URL=http://127.0.0.1:9400/application/o/userinfo/ npm run dev

# terminal 2 — simulated Authentik outpost + userinfo (ports per its --help; 9400 here)
npx tsx scripts/outpost-sim.ts --upstream http://127.0.0.1:3010 --username tyler
```

(Feature 010 dev ports: API 3010, UI 5110.) Then:

- Browse an authorize URL **through the sim's port**: expect the approval page naming `tyler` — never a password field (FR-001/FR-002; screenshot evidence).
- Click **Deny**: expect the client's redirect with `error=access_denied` and no code (US3).
- Hit the same authorize URL **directly on port 3010** (bypassing the sim): expect the 403 rejection page with a clear "must be reached through Authentik" error (US2 browser-visible case).
- Full client check: add the sim's `/mcp` URL as an MCP server in Claude Code (`claude mcp add --transport http ...`); the browser step shows the approval page; approving connects and `tools/list` succeeds (US1 simulated end to end).

## 3. Security probes by hand (US2, SC-002)

With the dev server up as above (no sim needed for these — they attack the app directly):

```bash
# forged JWT header straight at the app: expect 403, no Location header, no code anywhere
curl -si 'http://127.0.0.1:3010/oauth/authorize?response_type=code&client_id=<registered-id>&redirect_uri=<registered-uri>&code_challenge=xxx&code_challenge_method=S256' \
  -H 'X-authentik-jwt: forged.token.value'

# identity convenience header alone (no JWT at all): expect the same 403
curl -si 'http://127.0.0.1:3010/oauth/authorize?...' -H 'X-authentik-username: tyler'
```

The same probes run automatically in `tests/integration/mcp-forged-identity.test.ts`; the recorded output of that test is the SC-002 evidence.

## 4. Deploy suite (real image, restart + rotation, no CONNECTOR_PASSWORD)

```bash
npm run test:deploy
```

Expected: `fresh-deploy` proves `docker compose up` fails fast naming `MCP_TOKEN_SECRET` when it's missing and starts cleanly without any `CONNECTOR_PASSWORD`; `mcp-connect` connects a real MCP client through the containerized app with the stub identity provider container on the `work-helper` network and ends in `tools/list`; restart-with-same-secret keeps the client's tool calls working (SC-003) and secret-rotation + restart rejects them until a full re-connect (SC-004).

## 5. Manual acceptance (Tyler, real Authentik — SC-001)

Follow the updated `docs/deploy.md` on the home server: narrow the proxy provider's Unauthenticated Paths to the four-line list in [config.md](./contracts/config.md), set `MCP_TOKEN_SECRET` and `AUTHENTIK_USERINFO_URL` in `.env`, redeploy, then add `https://work-helper.<domain>/mcp` to Claude Code. Expected: browser step lands on Authentik login (or skips straight to approval with a live session), approval page names your Authentik username, approving connects, first tool call succeeds, all inside 2 minutes with the Authentik account as the only credential entered anywhere.
