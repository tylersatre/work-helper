import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { connectThroughPasswordGate, startConnect, submitPassword, TestOAuthClientProvider } from './helpers/oauth-client.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a-brand-new-password';

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

async function startTestApp(dbPath: string, connectorPassword: string | undefined) {
  const { db } = createDb(dbPath);
  app = buildApp({ db, lanes: LANES, connectorPassword });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function connectAndListBoard(serverUrl: string, provider: Awaited<ReturnType<typeof connectThroughPasswordGate>>) {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
  const result = await client.callTool({ name: 'list-board', arguments: {} });
  return { client, result };
}

describe('US5: revocation by changing the password', () => {
  it('restart with the same password: the same token keeps working, no re-auth needed (US5-AS1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-revocation-'));
    const dbPath = join(dir, 'test.db');

    const serverUrl1 = await startTestApp(dbPath, PASSWORD);
    const provider = await connectThroughPasswordGate(`${serverUrl1}/mcp`, PASSWORD);
    const { client: client1, result: result1 } = await connectAndListBoard(serverUrl1, provider);
    expect(result1.isError).toBeFalsy();
    await client1.close();
    await app!.close();

    const serverUrl2 = await startTestApp(dbPath, PASSWORD);
    const client2 = new Client({ name: 'test-client', version: '1.0.0' });
    const transport2 = new StreamableHTTPClientTransport(new URL(`${serverUrl2}/mcp`), { authProvider: provider });
    await client2.connect(transport2);
    const result2 = await client2.callTool({ name: 'list-board', arguments: {} });
    expect(result2.isError).toBeFalsy();
    await client2.close();
  });

  it('restart with a changed password: the next call gets 401, and reconnecting demands the new password (US5-AS2)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-revocation-'));
    const dbPath = join(dir, 'test.db');

    const serverUrl1 = await startTestApp(dbPath, PASSWORD);
    const provider = await connectThroughPasswordGate(`${serverUrl1}/mcp`, PASSWORD);
    await app!.close();

    const serverUrl2 = await startTestApp(dbPath, NEW_PASSWORD);

    const staleResponse = await fetch(`${serverUrl2}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${(provider.tokens() as { access_token: string }).access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(staleResponse.status).toBe(401);
    expect(staleResponse.headers.get('www-authenticate')).toContain('Bearer');

    // Reconnecting: the client's cached registration still resolves, but the old password is refused...
    const reconnectProvider = new TestOAuthClientProvider();
    const authorizationUrl = await startConnect(`${serverUrl2}/mcp`, reconnectProvider);
    const oldPasswordAttempt = await submitPassword(authorizationUrl, PASSWORD);
    expect(oldPasswordAttempt.status).toBe(401);

    // ...and the new password completes the connection.
    const newPasswordAttempt = await submitPassword(authorizationUrl, NEW_PASSWORD);
    expect(newPasswordAttempt.status).toBe(302);
  });

  it('two clients connected with the same password are both cut off by one change (edge case)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-revocation-'));
    const dbPath = join(dir, 'test.db');

    const serverUrl1 = await startTestApp(dbPath, PASSWORD);
    const providerA = await connectThroughPasswordGate(`${serverUrl1}/mcp`, PASSWORD);
    const providerB = await connectThroughPasswordGate(`${serverUrl1}/mcp`, PASSWORD);
    await app!.close();

    const serverUrl2 = await startTestApp(dbPath, NEW_PASSWORD);

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
