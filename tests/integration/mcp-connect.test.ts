import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { connectThroughPasswordGate, extractCode, startConnect, submitPassword } from './helpers/oauth-client.js';
import type { FastifyInstance } from 'fastify';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const PASSWORD = 'correct-horse-battery';

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

async function startTestApp(connectorPassword?: string): Promise<{ app: FastifyInstance; serverUrl: string }> {
  const { db } = createDb(':memory:');
  app = buildApp({ db, lanes: LANES, connectorPassword });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  return { app, serverUrl: `http://127.0.0.1:${address.port}` };
}

describe('US1: connect through the password gate', () => {
  it('connects through the gate and lists tools (US1-AS1)', async () => {
    const { serverUrl } = await startTestApp(PASSWORD);
    const provider = await connectThroughPasswordGate(`${serverUrl}/mcp`, PASSWORD);

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['list-board', 'get-task', 'search-people', 'get-person', 'create-task', 'add-note']),
    );

    // contracts/mcp-tools.md: every tool declares an output schema, not just an input schema.
    for (const tool of tools) {
      expect(tool.outputSchema, `${tool.name} should declare an outputSchema`).toBeTruthy();
    }

    await client.close();
  });

  it('shows a retryable error on a wrong password, then completes on the correct one (US1-AS2)', async () => {
    const { serverUrl } = await startTestApp(PASSWORD);

    const authorizationUrl = await startConnect(`${serverUrl}/mcp`, new (
      await import('./helpers/oauth-client.js')
    ).TestOAuthClientProvider());

    const wrong = await submitPassword(authorizationUrl, 'totally-wrong-password');
    expect(wrong.status).toBe(401);
    const wrongBody = await wrong.text();
    expect(wrongBody).toContain('<input');
    expect(wrongBody.toLowerCase()).toContain('incorrect');

    const right = await submitPassword(authorizationUrl, PASSWORD);
    expect(right.status).toBe(302);
    const code = extractCode(right);
    expect(typeof code).toBe('string');
  });

  it('refuses an unauthenticated POST /mcp with 401 and WWW-Authenticate (US1-AS3, FR-012)', async () => {
    const { serverUrl } = await startTestApp(PASSWORD);

    const response = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(401);
    const wwwAuthenticate = response.headers.get('www-authenticate');
    expect(wwwAuthenticate).toContain('Bearer');
    expect(wwwAuthenticate).toContain(`${serverUrl}/.well-known/oauth-protected-resource`);
  });

  it('serves discovery documents matching contracts/http-auth.md', async () => {
    const { serverUrl } = await startTestApp(PASSWORD);

    const resource = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`);
    expect(resource.status).toBe(200);
    expect(await resource.json()).toEqual({
      resource: `${serverUrl}/mcp`,
      authorization_servers: [serverUrl],
      bearer_methods_supported: ['header'],
    });

    const authServer = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`);
    expect(authServer.status).toBe(200);
    expect(await authServer.json()).toMatchObject({
      issuer: serverUrl,
      authorization_endpoint: `${serverUrl}/oauth/authorize`,
      token_endpoint: `${serverUrl}/oauth/token`,
      registration_endpoint: `${serverUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  it('never allows passwordless access: every connector endpoint answers 503 when CONNECTOR_PASSWORD is unset', async () => {
    const { serverUrl } = await startTestApp(undefined);

    const resource = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`);
    expect(resource.status).toBe(503);

    const authServer = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`);
    expect(authServer.status).toBe(503);

    const register = await fetch(`${serverUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost:8976/callback'] }),
    });
    expect(register.status).toBe(503);

    const authorize = await fetch(`${serverUrl}/oauth/authorize?response_type=code&client_id=x&redirect_uri=http://localhost:8976/callback&code_challenge=abc&code_challenge_method=S256`);
    expect(authorize.status).toBe(503);

    const token = await fetch(`${serverUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=x&code_verifier=x&client_id=x&redirect_uri=http://localhost:8976/callback',
    });
    expect(token.status).toBe(503);

    const mcp = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(mcp.status).toBe(503);
  });

  it('rejects GET and DELETE /mcp with 405', async () => {
    const { serverUrl } = await startTestApp(PASSWORD);

    const get = await fetch(`${serverUrl}/mcp`);
    expect(get.status).toBe(405);

    const del = await fetch(`${serverUrl}/mcp`, { method: 'DELETE' });
    expect(del.status).toBe(405);
  });
});
