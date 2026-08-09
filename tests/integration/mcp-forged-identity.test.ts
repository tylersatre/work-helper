import { randomBytes, createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { createIdentityVerifier, type IdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval, extractTicket, getAuthorize, postApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';
const REDIRECT_URI = 'http://localhost:8976/callback';

let app: FastifyInstance | undefined;
let stub: StubIdentityProvider | undefined;
let foreignStub: StubIdentityProvider | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
  if (stub) {
    await stub.close();
    stub = undefined;
  }
  if (foreignStub) {
    await foreignStub.close();
    foreignStub = undefined;
  }
});

async function startTestApp(identityVerifier: IdentityVerifier | undefined): Promise<string> {
  const { db } = createDb(':memory:');
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function registerClient(serverUrl: string): Promise<string> {
  const response = await fetch(`${serverUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'forged-identity-test-client' }),
  });
  const { client_id: clientId } = (await response.json()) as { client_id: string };
  return clientId;
}

function authorizeUrl(serverUrl: string, clientId: string): string {
  const codeChallenge = createHash('sha256').update(randomBytes(32)).digest('base64url');
  return `${serverUrl}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
}

function expectRejection(response: Response): void {
  expect(response.status).toBe(403);
  expect(response.headers.get('location')).toBeNull();
}

async function expectNoPasswordOr423(response: Response): Promise<void> {
  expect(response.status).not.toBe(423);
  const body = await response.text();
  expect(body).not.toMatch(/type="password"/);
}

describe('US2: forged identity assertions are rejected', () => {
  it('rejects a fabricated X-authentik-jwt with 403, no Location, no code', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const clientId = await registerClient(serverUrl);

    const response = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)), { assertion: 'totally-forged-jwt-value' });
    expectRejection(response);
    await expectNoPasswordOr423(response);
  });

  it('rejects requests with no identity headers at all, naming Authentik sign-in', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const clientId = await registerClient(serverUrl);

    const response = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)));
    expectRejection(response);
    const body = await response.text();
    expect(body.toLowerCase()).toContain('authentik');
  });

  it('rejects X-authentik-username alone, with no X-authentik-jwt header', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const clientId = await registerClient(serverUrl);

    const response = await fetch(authorizeUrl(serverUrl, clientId), {
      headers: { 'x-authentik-username': 'tyler' },
      redirect: 'manual',
    });
    expectRejection(response);
  });

  it('rejects a stub-minted token that was invalidated before use (expired/revoked)', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const clientId = await registerClient(serverUrl);
    const token = stub.mint('tyler');
    stub.invalidate(token);

    const response = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)), { assertion: token });
    expectRejection(response);
  });

  it('rejects a token honored only by a second, foreign Authentik instance', async () => {
    stub = await startStubIdentityProvider();
    foreignStub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const clientId = await registerClient(serverUrl);
    const foreignToken = foreignStub.mint('tyler');

    const response = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)), { assertion: foreignToken });
    expectRejection(response);
  });

  it('rejects every assertion when no identity verifier is configured, even a token a stub would honor', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(undefined);
    const clientId = await registerClient(serverUrl);
    const token = stub.mint('tyler');

    const response = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)), { assertion: token });
    expectRejection(response);
  });

  it('rejects POST /oauth/authorize with a valid ticket but an absent or failing assertion — a ticket alone is never sufficient', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const clientId = await registerClient(serverUrl);
    const token = stub.mint('tyler');

    const approvalResponse = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)), { assertion: token });
    expect(approvalResponse.status).toBe(200);
    const ticket = extractTicket(await approvalResponse.text());

    const withoutAssertion = await postApproval(serverUrl, ticket, 'approve');
    expectRejection(withoutAssertion);

    const withForgedAssertion = await postApproval(serverUrl, ticket, 'approve', { assertion: 'forged' });
    expectRejection(withForgedAssertion);
  });

  it('Authentik going down never revokes an already-connected client, but a new authorize attempt is rejected fail-closed', async () => {
    stub = await startStubIdentityProvider();
    const serverUrl = await startTestApp(createIdentityVerifier(stub.url));
    const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub.mint('tyler') });

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
    await client.connect(transport);

    await stub.close();
    stub = undefined;

    const { tools } = await client.listTools();
    expect(Array.isArray(tools)).toBe(true);
    await client.close();

    const clientId = await registerClient(serverUrl);
    const response = await getAuthorize(new URL(authorizeUrl(serverUrl, clientId)), { assertion: 'anything' });
    expectRejection(response);
  });
});
