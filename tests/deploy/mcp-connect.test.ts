import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { connectThroughPasswordGate } from '../integration/helpers/oauth-client.js';
import { createHarness, type Harness } from './harness.js';

describe('US3: remote MCP access on the deployed stack', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it('connects through the password page with the .env password and lists tools (SC-005)', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const mcpUrl = `${harness.baseUrl}/mcp`;
    const provider = await connectThroughPasswordGate(mcpUrl, harness.password);

    const client = new Client({ name: 'deploy-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['list-board', 'get-task']));

    await client.close();
  }, 300_000);
});
