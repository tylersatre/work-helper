import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';
const ROTATED_MCP_TOKEN_SECRET = 'a-brand-new-secret';

let app: FastifyInstance | undefined;
let stub: StubIdentityProvider | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
  if (stub) {
    await stub.close();
    stub = undefined;
  }
});

// Authentik itself doesn't restart when work-helper does — one stub instance simulates it across
// every "restart" in a test, exactly like the real deployment's Authentik server.
async function startTestApp(dbPath: string, mcpTokenSecret: string | undefined): Promise<string> {
  if (!stub) {
    stub = await startStubIdentityProvider();
  }
  const { db } = createDb(dbPath);
  app = buildApp({ db, lanes: LANES, mcpTokenSecret, identityVerifier: createIdentityVerifier(stub.url) });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function connectAndListBoard(serverUrl: string, provider: Awaited<ReturnType<typeof connectThroughApproval>>) {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
  const result = await client.callTool({ name: 'list-board', arguments: {} });
  return { client, result };
}

describe('US4: revocation by rotating MCP_TOKEN_SECRET', () => {
  it('restart with the same secret: the same token keeps working, zero re-authorization needed (SC-003)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-revocation-'));
    const dbPath = join(dir, 'test.db');

    const serverUrl1 = await startTestApp(dbPath, MCP_TOKEN_SECRET);
    const provider = await connectThroughApproval(`${serverUrl1}/mcp`, { assertion: stub!.mint('tyler') });
    const { client: client1, result: result1 } = await connectAndListBoard(serverUrl1, provider);
    expect(result1.isError).toBeFalsy();
    await client1.close();
    await app!.close();

    const serverUrl2 = await startTestApp(dbPath, MCP_TOKEN_SECRET);
    const client2 = new Client({ name: 'test-client', version: '1.0.0' });
    const transport2 = new StreamableHTTPClientTransport(new URL(`${serverUrl2}/mcp`), { authProvider: provider });
    await client2.connect(transport2);
    const result2 = await client2.callTool({ name: 'list-board', arguments: {} });
    expect(result2.isError).toBeFalsy();
    await client2.close();
  });

  it('restart with a rotated secret: the next call gets 401 with the resource_metadata challenge, and reconnecting requires the full approval flow (SC-004)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-revocation-'));
    const dbPath = join(dir, 'test.db');

    const serverUrl1 = await startTestApp(dbPath, MCP_TOKEN_SECRET);
    const provider = await connectThroughApproval(`${serverUrl1}/mcp`, { assertion: stub!.mint('tyler') });
    await app!.close();

    const serverUrl2 = await startTestApp(dbPath, ROTATED_MCP_TOKEN_SECRET);

    const staleResponse = await fetch(`${serverUrl2}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${(provider.tokens() as { access_token: string }).access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(staleResponse.status).toBe(401);
    const wwwAuthenticate = staleResponse.headers.get('www-authenticate');
    expect(wwwAuthenticate).toContain('Bearer');
    expect(wwwAuthenticate).toContain(`resource_metadata="${serverUrl2}/.well-known/oauth-protected-resource"`);

    // A full reconnect through the approval flow succeeds on the rotated secret.
    const reconnected = await connectThroughApproval(`${serverUrl2}/mcp`, { assertion: stub!.mint('tyler') });
    const { result } = await connectAndListBoard(serverUrl2, reconnected);
    expect(result.isError).toBeFalsy();
  });

  it('two clients connected under the same secret are both cut off by one rotation (edge case)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-revocation-'));
    const dbPath = join(dir, 'test.db');

    const serverUrl1 = await startTestApp(dbPath, MCP_TOKEN_SECRET);
    const providerA = await connectThroughApproval(`${serverUrl1}/mcp`, { assertion: stub!.mint('tyler') });
    const providerB = await connectThroughApproval(`${serverUrl1}/mcp`, { assertion: stub!.mint('tyler') });
    await app!.close();

    const serverUrl2 = await startTestApp(dbPath, ROTATED_MCP_TOKEN_SECRET);

    for (const provider of [providerA, providerB]) {
      const response = await fetch(`${serverUrl2}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${(provider.tokens() as { access_token: string }).access_token}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(response.status).toBe(401);
    }
  });
});
