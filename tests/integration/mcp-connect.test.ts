import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { createIdentityVerifier, type IdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval, extractCode, extractTicket, getAuthorize, postApproval, startConnect } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';
const REDIRECT_URI = 'http://localhost:8976/callback';

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

async function startTestApp(opts: { mcpTokenSecret?: string; identityVerifier?: IdentityVerifier } = {}): Promise<{ app: FastifyInstance; serverUrl: string }> {
  const { db } = createDb(':memory:');
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: opts.mcpTokenSecret, identityVerifier: opts.identityVerifier });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  return { app, serverUrl: `http://127.0.0.1:${address.port}` };
}

async function startAppWithStub(): Promise<{ serverUrl: string; stub: StubIdentityProvider }> {
  stub = await startStubIdentityProvider();
  const identityVerifier = createIdentityVerifier(stub.url);
  const { serverUrl } = await startTestApp({ mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier });
  return { serverUrl, stub };
}

async function registerClient(serverUrl: string): Promise<string> {
  const response = await fetch(`${serverUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'us3-test-client' }),
  });
  const { client_id: clientId } = (await response.json()) as { client_id: string };
  return clientId;
}

function authorizeUrl(serverUrl: string, clientId: string, state: string): string {
  const codeChallenge = createHash('sha256').update(randomBytes(32)).digest('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${serverUrl}/oauth/authorize?${params.toString()}`;
}

describe('US1: connect through Authentik-verified approval', () => {
  it('connects through the approval flow and lists tools (US1-AS1)', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();
    const assertion = identityStub.mint('tyler');
    const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion });

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['list-board', 'get-task', 'search-people', 'get-person', 'create-task', 'add-note']),
    );

    for (const tool of tools) {
      expect(tool.outputSchema, `${tool.name} should declare an outputSchema`).toBeTruthy();
    }

    await client.close();
  });

  it('renders an approval page naming the verified username, with no password field, no-store, and a single-use code on approval', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();
    const assertion = identityStub.mint('tyler');

    const provider = new (await import('./helpers/oauth-client.js')).TestOAuthClientProvider();
    const authorizationUrl = await startConnect(`${serverUrl}/mcp`, provider);

    const approvalResponse = await getAuthorize(authorizationUrl, { assertion });
    expect(approvalResponse.status).toBe(200);
    expect(approvalResponse.headers.get('cache-control')).toBe('no-store');
    const html = await approvalResponse.text();
    expect(html).toContain('tyler');
    expect(html).not.toMatch(/type="password"/);

    const ticket = extractTicket(html);
    const origin = `${authorizationUrl.protocol}//${authorizationUrl.host}`;
    const approveResponse = await postApproval(origin, ticket, 'approve', { assertion });
    expect(approveResponse.status).toBe(302);
    const code = extractCode(approveResponse);
    expect(typeof code).toBe('string');

    const secondApprove = await postApproval(origin, ticket, 'approve', { assertion });
    expect(secondApprove.status).toBe(400);
  });

  it('refuses an unauthenticated POST /mcp with 401 and WWW-Authenticate (US1-AS3, FR-012)', async () => {
    const { serverUrl } = await startAppWithStub();

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

  it('serves discovery documents matching contracts/oauth-http.md', async () => {
    const { serverUrl } = await startAppWithStub();

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

  it('rejects an unknown client_id/redirect_uri with a 400 page and no redirect', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();
    const assertion = identityStub.mint('tyler');

    const response = await fetch(
      `${serverUrl}/oauth/authorize?response_type=code&client_id=unknown-client&redirect_uri=http://localhost:8976/callback&code_challenge=abc&code_challenge_method=S256`,
      { headers: { 'x-authentik-jwt': assertion } },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    const body = await response.text();
    expect(body.toLowerCase()).toContain('unknown');
  });

  it('redirects with error=invalid_request for a bad response_type or code_challenge', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();
    const assertion = identityStub.mint('tyler');

    const registerResponse = await fetch(`${serverUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost:8976/callback'] }),
    });
    const { client_id: clientId } = (await registerResponse.json()) as { client_id: string };

    const response = await fetch(
      `${serverUrl}/oauth/authorize?response_type=token&client_id=${clientId}&redirect_uri=http://localhost:8976/callback&code_challenge=abc&code_challenge_method=S256`,
      { headers: { 'x-authentik-jwt': assertion }, redirect: 'manual' },
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location as string);
    expect(redirectUrl.searchParams.get('error')).toBe('invalid_request');
  });

  it('never allows passwordless access: every connector endpoint answers 503 naming MCP_TOKEN_SECRET when unconfigured', async () => {
    const { serverUrl } = await startTestApp();

    const resource = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`);
    expect(resource.status).toBe(503);
    const resourceBody = await resource.json();
    expect(resourceBody.error.message).toContain('MCP_TOKEN_SECRET');

    const authServer = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`);
    expect(authServer.status).toBe(503);

    const register = await fetch(`${serverUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost:8976/callback'] }),
    });
    expect(register.status).toBe(503);

    const authorize = await fetch(
      `${serverUrl}/oauth/authorize?response_type=code&client_id=x&redirect_uri=http://localhost:8976/callback&code_challenge=abc&code_challenge_method=S256`,
    );
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
    const { serverUrl } = await startAppWithStub();

    const get = await fetch(`${serverUrl}/mcp`);
    expect(get.status).toBe(405);

    const del = await fetch(`${serverUrl}/mcp`, { method: 'DELETE' });
    expect(del.status).toBe(405);
  });
});

describe('US3: declining approval leaves the client unconnected', () => {
  it('action=deny redeems the ticket and redirects with error=access_denied (+ state), never a code', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();
    const assertion = identityStub.mint('tyler');
    const clientId = await registerClient(serverUrl);

    const approvalResponse = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId, 'my-state')), { assertion });
    expect(approvalResponse.status).toBe(200);
    const ticket = extractTicket(await approvalResponse.text());

    const denyResponse = await postApproval(serverUrl, ticket, 'deny', { assertion });
    expect(denyResponse.status).toBe(302);
    const location = denyResponse.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location as string);
    expect(redirectUrl.searchParams.get('error')).toBe('access_denied');
    expect(redirectUrl.searchParams.get('state')).toBe('my-state');
    expect(redirectUrl.searchParams.get('code')).toBeNull();

    const tokenResponse = await fetch(`${serverUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: '',
        code_verifier: 'whatever',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });
    expect(tokenResponse.status).toBe(400);
  });

  it('a double submit — after approve or after deny — gets the 400 error page and never a second code', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();

    const approveAssertion = identityStub.mint('tyler');
    const approveClientId = await registerClient(serverUrl);
    const approveApproval = await getAuthorize(new URL(authorizeUrl(serverUrl, approveClientId, 'state-a')), { assertion: approveAssertion });
    const approveTicket = extractTicket(await approveApproval.text());
    const firstApprove = await postApproval(serverUrl, approveTicket, 'approve', { assertion: approveAssertion });
    expect(firstApprove.status).toBe(302);
    expect(typeof extractCode(firstApprove)).toBe('string');
    const secondApprove = await postApproval(serverUrl, approveTicket, 'approve', { assertion: approveAssertion });
    expect(secondApprove.status).toBe(400);

    const denyAssertion = identityStub.mint('tyler');
    const denyClientId = await registerClient(serverUrl);
    const denyApproval = await getAuthorize(new URL(authorizeUrl(serverUrl, denyClientId, 'state-b')), { assertion: denyAssertion });
    const denyTicket = extractTicket(await denyApproval.text());
    const firstDeny = await postApproval(serverUrl, denyTicket, 'deny', { assertion: denyAssertion });
    expect(firstDeny.status).toBe(302);
    const secondDeny = await postApproval(serverUrl, denyTicket, 'deny', { assertion: denyAssertion });
    expect(secondDeny.status).toBe(400);
  });

  it('abandoning after the GET (no POST ever sent) issues nothing observable', async () => {
    const { serverUrl, stub: identityStub } = await startAppWithStub();
    const assertion = identityStub.mint('tyler');
    const clientId = await registerClient(serverUrl);

    const approvalResponse = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId, 'abandoned-state')), { assertion });
    expect(approvalResponse.status).toBe(200);
    await approvalResponse.text();

    const tokenResponse = await fetch(`${serverUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'nothing-was-ever-issued',
        code_verifier: 'whatever',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });
    expect(tokenResponse.status).toBe(400);
  });
});
