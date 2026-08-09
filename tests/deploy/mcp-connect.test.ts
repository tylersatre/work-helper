import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { connectThroughApproval } from '../integration/helpers/oauth-client.js';
import { createHarness, startStubIdentityContainer, type Harness } from './harness.js';

async function listBoardTools(mcpUrl: string, provider: Awaited<ReturnType<typeof connectThroughApproval>>): Promise<string[]> {
  const client = new Client({ name: 'deploy-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => tool.name);
}

describe('US4: remote MCP access on the deployed stack, restart, and rotation', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it('connects through the approval flow against the containerized app and lists tools (SC-005)', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const token = randomBytes(24).toString('base64url');
    await startStubIdentityContainer(harness, token);

    const mcpUrl = `${harness.baseUrl}/mcp`;
    const provider = await connectThroughApproval(mcpUrl, { assertion: token });

    const names = await listBoardTools(mcpUrl, provider);
    expect(names).toEqual(expect.arrayContaining(['list-board', 'get-task']));
  }, 300_000);

  it('restart with the secret unchanged: a previously issued token keeps working (SC-003)', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const token = randomBytes(24).toString('base64url');
    await startStubIdentityContainer(harness, token);

    const mcpUrl = `${harness.baseUrl}/mcp`;
    const provider = await connectThroughApproval(mcpUrl, { assertion: token });
    const namesBeforeRestart = await listBoardTools(mcpUrl, provider);
    expect(namesBeforeRestart).toEqual(expect.arrayContaining(['list-board']));

    const restart = await harness.restart();
    expect(restart.code, `docker compose restart failed:\n${restart.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const namesAfterRestart = await listBoardTools(mcpUrl, provider);
    expect(namesAfterRestart).toEqual(expect.arrayContaining(['list-board']));
  }, 300_000);

  it('rotating MCP_TOKEN_SECRET and recreating: the old token gets 401, and a full reconnect succeeds (SC-004)', async () => {
    harness = await createHarness();
    const currentHarness = harness;

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const token = randomBytes(24).toString('base64url');
    await startStubIdentityContainer(harness, token);

    const mcpUrl = `${harness.baseUrl}/mcp`;
    const provider = await connectThroughApproval(mcpUrl, { assertion: token });
    const namesBeforeRotation = await listBoardTools(mcpUrl, provider);
    expect(namesBeforeRotation).toEqual(expect.arrayContaining(['list-board']));

    currentHarness.writeEnv({
      MCP_TOKEN_SECRET: 'a-freshly-rotated-secret',
      AUTHENTIK_USERINFO_URL: currentHarness.identityProviderUrl,
      WORK_HELPER_PORT: String(currentHarness.port),
    });
    const recreate = await currentHarness.up(['--force-recreate']);
    expect(recreate.code, `docker compose up --force-recreate failed:\n${recreate.stderr}`).toBe(0);
    await currentHarness.waitForHttp('/api/board');

    const staleResponse = await currentHarness.fetchApp('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${(provider.tokens() as { access_token: string }).access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(staleResponse.status).toBe(401);

    const reconnected = await connectThroughApproval(mcpUrl, { assertion: token });
    const namesAfterReconnect = await listBoardTools(mcpUrl, reconnected);
    expect(namesAfterReconnect).toEqual(expect.arrayContaining(['list-board']));
  }, 300_000);
});
