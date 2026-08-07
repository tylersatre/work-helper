import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import {
  TestOAuthClientProvider,
  connectThroughPasswordGate,
  extractCode,
  startConnect,
  submitPassword,
} from './helpers/oauth-client.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const PASSWORD = 'correct-horse-battery';
const IP_A = '10.0.0.1';
const IP_B = '10.0.0.2';

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

async function startTestApp(dbPath: string = ':memory:', connectorPassword: string | undefined = PASSWORD) {
  const { db } = createDb(dbPath);
  app = buildApp({ db, lanes: LANES, connectorPassword });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  return { serverUrl: `http://127.0.0.1:${address.port}` };
}

describe('US4: per-IP lockout', () => {
  it('locks an IP after three consecutive wrong passwords; other IPs are unaffected (US4-AS1, FR-008)', async () => {
    const { serverUrl } = await startTestApp();

    const provider = new TestOAuthClientProvider();
    const authorizationUrl = await startConnect(`${serverUrl}/mcp`, provider);

    const first = await submitPassword(authorizationUrl, 'wrong-1', { xForwardedFor: IP_A });
    expect(first.status).toBe(401);

    const second = await submitPassword(authorizationUrl, 'wrong-2', { xForwardedFor: IP_A });
    expect(second.status).toBe(401);

    const third = await submitPassword(authorizationUrl, 'wrong-3', { xForwardedFor: IP_A });
    expect(third.status).toBe(423);

    const correctFromA = await submitPassword(authorizationUrl, PASSWORD, { xForwardedFor: IP_A });
    expect(correctFromA.status).toBe(423);

    const correctFromB = await submitPassword(authorizationUrl, PASSWORD, { xForwardedFor: IP_B });
    expect(correctFromB.status).toBe(302);
    expect(typeof extractCode(correctFromB)).toBe('string');
  });

  it('clears on restart (rebuild over the same DB) (US4-AS2, FR-009)', async () => {
    // A file-backed DB (rather than :memory:) lets "restart" rebuild the app over the same data.
    const dir = mkdtempSync(join(tmpdir(), 'wh-mcp-lockout-'));
    const filePath = join(dir, 'test.db');

    const { serverUrl: serverUrl1 } = await startTestApp(filePath);
    const provider1 = new TestOAuthClientProvider();
    const authorizationUrl1 = await startConnect(`${serverUrl1}/mcp`, provider1);
    await submitPassword(authorizationUrl1, 'wrong-1', { xForwardedFor: IP_A });
    await submitPassword(authorizationUrl1, 'wrong-2', { xForwardedFor: IP_A });
    const locked = await submitPassword(authorizationUrl1, 'wrong-3', { xForwardedFor: IP_A });
    expect(locked.status).toBe(423);

    await app!.close();

    const { serverUrl: serverUrl2 } = await startTestApp(filePath);
    const provider2 = new TestOAuthClientProvider();
    const authorizationUrl2 = await startConnect(`${serverUrl2}/mcp`, provider2);
    const afterRestart = await submitPassword(authorizationUrl2, PASSWORD, { xForwardedFor: IP_A });
    expect(afterRestart.status).toBe(302);
  });

  it('resets the count after two wrongs then a right, from a fresh IP', async () => {
    const { serverUrl } = await startTestApp();
    const provider = new TestOAuthClientProvider();
    const authorizationUrl = await startConnect(`${serverUrl}/mcp`, provider);

    await submitPassword(authorizationUrl, 'wrong-1', { xForwardedFor: '10.0.0.9' });
    await submitPassword(authorizationUrl, 'wrong-2', { xForwardedFor: '10.0.0.9' });
    const right = await submitPassword(authorizationUrl, PASSWORD, { xForwardedFor: '10.0.0.9' });
    expect(right.status).toBe(302);
  });

  it('a locked IP with a previously issued bearer token can still call tools (lockout never touches /mcp)', async () => {
    const { serverUrl } = await startTestApp();

    const provider = await connectThroughPasswordGate(`${serverUrl}/mcp`, PASSWORD, { xForwardedFor: IP_A });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
    await client.connect(transport);

    const lockoutProvider = new TestOAuthClientProvider();
    const authorizationUrl = await startConnect(`${serverUrl}/mcp`, lockoutProvider);
    await submitPassword(authorizationUrl, 'wrong-1', { xForwardedFor: IP_A });
    await submitPassword(authorizationUrl, 'wrong-2', { xForwardedFor: IP_A });
    const lockedResponse = await submitPassword(authorizationUrl, 'wrong-3', { xForwardedFor: IP_A });
    expect(lockedResponse.status).toBe(423);

    const { tools } = await client.listTools();
    expect(Array.isArray(tools)).toBe(true);

    await client.close();
  });
});
