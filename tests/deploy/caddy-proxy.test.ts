import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractTicket } from '../integration/helpers/oauth-client.js';
import { createHarness, startStubIdentityContainer, type Harness } from './harness.js';

const PLACEHOLDER_HOSTNAME = 'work-helper.example.com';
const TEST_HOSTNAME = 'work-helper.localhost';
const REDIRECT_URI = 'http://localhost:8976/callback';
const CURL_IMAGE = 'curlimages/curl:8.11.1';

interface CurlResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function extractCaddySnippet(docContents: string): string {
  const match = docContents.match(/```caddy\n([\s\S]*?)```/);
  if (!match) {
    throw new Error('no ```caddy fenced block found in docs/deploy.md');
  }
  return match[1].trimEnd();
}

function parseCurlOutput(raw: string): CurlResult {
  const sepIndex = raw.indexOf('\r\n\r\n');
  const sep = sepIndex !== -1 ? '\r\n\r\n' : '\n\n';
  const idx = sepIndex !== -1 ? sepIndex : raw.indexOf('\n\n');
  if (idx === -1) {
    throw new Error(`could not find header/body separator in curl output:\n${raw}`);
  }
  const headerBlock = raw.slice(0, idx);
  const body = raw.slice(idx + sep.length);
  const lines = headerBlock.split(/\r?\n/);
  const statusMatch = lines[0]?.match(/^HTTP\/\S+\s+(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status, headers, body };
}

function parseSseJson(body: string): unknown {
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith('data:'));
  if (!dataLine) {
    throw new Error(`no SSE data line in body: ${body}`);
  }
  return JSON.parse(dataLine.slice('data:'.length).trim());
}

function extractCode(location: string): string {
  const url = new URL(location);
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error(`no code in Location: ${location}`);
  }
  return code;
}

describe('US4: fronted by Caddy via the documented snippet', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it("proxies through the doc's Caddyfile snippet, including the full Authentik-verified connect flow (SC-005)", async () => {
    harness = await createHarness();
    const currentHarness = harness;

    async function curlIn(container: string, args: string[], retryMs = 0): Promise<CurlResult> {
      const deadline = Date.now() + retryMs;
      let lastError: unknown;
      do {
        const result = await currentHarness.docker(['exec', container, 'curl', ...args]);
        if (result.code === 0 && result.stdout.length > 0) {
          const parsed = parseCurlOutput(result.stdout);
          // Caddy can 502 for a moment right after `network connect` while its upstream DNS lookup catches up.
          if (parsed.status !== 502 && parsed.status !== 503) {
            return parsed;
          }
          lastError = `HTTP ${parsed.status}`;
        } else {
          lastError = result.stderr || result.stdout;
        }
        if (retryMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } while (Date.now() < deadline);
      throw new Error(`curl in ${container} failed: ${String(lastError)}`);
    }

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const token = randomBytes(24).toString('base64url');
    await startStubIdentityContainer(harness, token);

    // The doc's snippet must use the placeholder hostname — the real hostname never lives in the repo (FR-012).
    const docContents = harness.readFile('docs/deploy.md');
    const snippet = extractCaddySnippet(docContents);
    expect(snippet).toContain(`${PLACEHOLDER_HOSTNAME} {`);
    expect(snippet).toContain('reverse_proxy work-helper:8080');

    const testCaddyfile = snippet.replace(PLACEHOLDER_HOSTNAME, TEST_HOSTNAME);
    harness.writeFile('Caddyfile', testCaddyfile);

    const caddyContainerName = `${harness.projectName}-caddy`;
    const caddyRun = await harness.docker([
      'run',
      '-d',
      '--name',
      caddyContainerName,
      '-v',
      `${join(harness.dir, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`,
      'caddy:2-alpine',
    ]);
    expect(caddyRun.code, `docker run caddy failed:\n${caddyRun.stderr}`).toBe(0);
    const caddyId = caddyRun.stdout.trim();
    harness.trackContainer(caddyId);

    // The documented one-time attach step.
    const connect = await harness.docker(['network', 'connect', 'work-helper', caddyId]);
    expect(connect.code, `docker network connect failed:\n${connect.stderr}`).toBe(0);

    const inspect = await harness.docker([
      'inspect',
      '-f',
      '{{(index .NetworkSettings.Networks "work-helper").IPAddress}}',
      caddyId,
    ]);
    const caddyIp = inspect.stdout.trim();
    expect(caddyIp, `could not determine Caddy's IP on the work-helper network:\n${inspect.stderr}`).not.toBe('');
    const resolveArg = `${TEST_HOSTNAME}:443:${caddyIp}`;

    const clientRun = await harness.docker(['run', '-d', '--network', 'work-helper', '--entrypoint', 'sleep', CURL_IMAGE, '600']);
    expect(clientRun.code, `docker run client failed:\n${clientRun.stderr}`).toBe(0);
    const clientContainer = clientRun.stdout.trim();
    harness.trackContainer(clientContainer);

    // Board reachable through Caddy (SC-005).
    const board = await curlIn(clientContainer, ['--resolve', resolveArg, '-k', '-s', '-i', `https://${TEST_HOSTNAME}/api/board`], 20_000);
    expect(board.status).toBe(200);
    expect(JSON.parse(board.body)).toMatchObject({ lanes: expect.any(Array) });

    // Register an MCP client through Caddy.
    const register = await curlIn(clientContainer, [
      '--resolve',
      resolveArg,
      '-k',
      '-s',
      '-i',
      '-X',
      'POST',
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'caddy-deploy-test', token_endpoint_auth_method: 'none' }),
      `https://${TEST_HOSTNAME}/oauth/register`,
    ]);
    expect(register.status).toBe(201);
    const { client_id: clientId } = JSON.parse(register.body) as { client_id: string };

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = randomBytes(8).toString('base64url');
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    }).toString();

    // The approval page is reachable through Caddy, with the X-authentik-jwt header (simulating the
    // outpost) surviving the proxy hop intact, and no password field anywhere (SC-005, FR-002/FR-008).
    const approvalPage = await curlIn(clientContainer, [
      '--resolve',
      resolveArg,
      '-k',
      '-s',
      '-i',
      '-H',
      `X-authentik-jwt: ${token}`,
      `https://${TEST_HOSTNAME}/oauth/authorize?${authorizeParams}`,
    ]);
    expect(approvalPage.status).toBe(200);
    expect(approvalPage.body).not.toMatch(/type="password"/);
    const ticket = extractTicket(approvalPage.body);

    // A direct hit with no X-authentik-jwt header is rejected fail-closed, even through Caddy (US2).
    const bypassAttempt = await curlIn(clientContainer, [
      '--resolve',
      resolveArg,
      '-k',
      '-s',
      '-i',
      `https://${TEST_HOSTNAME}/oauth/authorize?${authorizeParams}`,
    ]);
    expect(bypassAttempt.status).toBe(403);

    const approve = await curlIn(clientContainer, [
      '--resolve',
      resolveArg,
      '-k',
      '-s',
      '-i',
      '-X',
      'POST',
      '-H',
      `X-authentik-jwt: ${token}`,
      '-d',
      new URLSearchParams({ ticket, action: 'approve' }).toString(),
      `https://${TEST_HOSTNAME}/oauth/authorize`,
    ]);
    expect(approve.status).toBe(302);
    const code = extractCode(approve.headers.location);

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
    }).toString();
    const tokenResponse = await curlIn(clientContainer, [
      '--resolve',
      resolveArg,
      '-k',
      '-s',
      '-i',
      '-X',
      'POST',
      '-d',
      tokenBody,
      `https://${TEST_HOSTNAME}/oauth/token`,
    ]);
    expect(tokenResponse.status).toBe(200);
    const { access_token: accessToken } = JSON.parse(tokenResponse.body) as { access_token: string };

    // The full connect-to-tools-listed flow succeeds through the documented proxy (SC-005).
    const toolsList = await curlIn(clientContainer, [
      '--resolve',
      resolveArg,
      '-k',
      '-s',
      '-i',
      '-X',
      'POST',
      '-H',
      `Authorization: Bearer ${accessToken}`,
      '-H',
      'Content-Type: application/json',
      '-H',
      'Accept: application/json, text/event-stream',
      '-d',
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      `https://${TEST_HOSTNAME}/mcp`,
    ]);
    expect(toolsList.status).toBe(200);
    const toolsResult = parseSseJson(toolsList.body) as { result: { tools: Array<{ name: string }> } };
    expect(toolsResult.result.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['list-board']));
  }, 300_000);
});
