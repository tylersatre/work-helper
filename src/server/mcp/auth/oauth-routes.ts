import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { originOf, sendUnconfigured } from '../http.js';
import { findClient, registerClient } from './clients.js';
import { createAuthorizationCodeStore } from './codes.js';
import { createLockoutTracker } from './lockout.js';
import { renderErrorPage, renderLockedPage, renderPasswordPage } from './password-page.js';
import { mintToken } from './tokens.js';

interface AuthorizeParams {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
}

type ValidationResult =
  | { kind: 'unknown-client' }
  | { kind: 'invalid-params'; redirectUri: string; state?: string }
  | { kind: 'valid'; params: Required<Pick<AuthorizeParams, 'clientId' | 'redirectUri' | 'codeChallenge'>> & AuthorizeParams };

function readAuthorizeParams(source: Record<string, unknown>): AuthorizeParams {
  const get = (key: string): string | undefined => (typeof source[key] === 'string' ? (source[key] as string) : undefined);
  return {
    responseType: get('response_type'),
    clientId: get('client_id'),
    redirectUri: get('redirect_uri'),
    codeChallenge: get('code_challenge'),
    codeChallengeMethod: get('code_challenge_method'),
    state: get('state'),
  };
}

function buildFlowParams(params: AuthorizeParams): Record<string, string> {
  const flowParams: Record<string, string> = {};
  if (params.responseType) flowParams.response_type = params.responseType;
  if (params.clientId) flowParams.client_id = params.clientId;
  if (params.redirectUri) flowParams.redirect_uri = params.redirectUri;
  if (params.codeChallenge) flowParams.code_challenge = params.codeChallenge;
  if (params.codeChallengeMethod) flowParams.code_challenge_method = params.codeChallengeMethod;
  if (params.state) flowParams.state = params.state;
  return flowParams;
}

function validateAuthorizeRequest(app: FastifyInstance, params: AuthorizeParams): ValidationResult {
  if (!params.clientId || !params.redirectUri) {
    return { kind: 'unknown-client' };
  }

  const client = findClient(app.db, params.clientId);
  if (!client || !client.redirectUris.includes(params.redirectUri)) {
    return { kind: 'unknown-client' };
  }

  if (params.responseType !== 'code' || !params.codeChallenge || params.codeChallengeMethod !== 'S256') {
    return { kind: 'invalid-params', redirectUri: params.redirectUri, state: params.state };
  }

  return {
    kind: 'valid',
    params: { ...params, clientId: params.clientId, redirectUri: params.redirectUri, codeChallenge: params.codeChallenge },
  };
}

function sendInvalidRequestRedirect(reply: FastifyReply, redirectUri: string, state: string | undefined): void {
  const url = new URL(redirectUri);
  url.searchParams.set('error', 'invalid_request');
  if (state) url.searchParams.set('state', state);
  reply.status(302).header('Location', url.toString()).send();
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  const codeStore = createAuthorizationCodeStore();
  const lockout = createLockoutTracker();

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string).entries()));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.get('/.well-known/oauth-protected-resource', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);
    const origin = originOf(request);
    return { resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'] };
  });

  app.get('/.well-known/oauth-authorization-server', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);
    const origin = originOf(request);
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    };
  });

  app.post('/oauth/register', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);

    const result = registerClient(app.db, request.body);
    if (!result.ok) {
      reply.status(400);
      return { error: 'invalid_client_metadata', error_description: result.error };
    }

    reply.status(201);
    return {
      client_id: result.clientId,
      client_name: result.clientName,
      redirect_uris: result.redirectUris,
      token_endpoint_auth_method: 'none',
    };
  });

  app.get('/oauth/authorize', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);

    const params = readAuthorizeParams(request.query as Record<string, unknown>);
    const validation = validateAuthorizeRequest(app, params);

    if (validation.kind === 'unknown-client') {
      reply.status(400).type('text/html').send(renderErrorPage('Unknown client or redirect URI.'));
      return;
    }
    if (validation.kind === 'invalid-params') {
      sendInvalidRequestRedirect(reply, validation.redirectUri, validation.state);
      return;
    }

    if (lockout.isLocked(request.ip)) {
      reply.status(423).header('Cache-Control', 'no-store').type('text/html').send(renderLockedPage());
      return;
    }

    reply
      .status(200)
      .header('Cache-Control', 'no-store')
      .type('text/html')
      .send(renderPasswordPage({ flowParams: buildFlowParams(validation.params) }));
  });

  app.post('/oauth/authorize', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);

    const params = readAuthorizeParams((request.body as Record<string, unknown>) ?? {});
    const validation = validateAuthorizeRequest(app, params);

    if (validation.kind === 'unknown-client') {
      reply.status(400).type('text/html').send(renderErrorPage('Unknown client or redirect URI.'));
      return;
    }
    if (validation.kind === 'invalid-params') {
      sendInvalidRequestRedirect(reply, validation.redirectUri, validation.state);
      return;
    }

    if (lockout.isLocked(request.ip)) {
      reply.status(423).header('Cache-Control', 'no-store').type('text/html').send(renderLockedPage());
      return;
    }

    const flowParams = buildFlowParams(validation.params);
    const submittedPassword = typeof (request.body as Record<string, unknown> | undefined)?.password === 'string'
      ? ((request.body as Record<string, string>).password)
      : '';

    // Fixed-length digests let timingSafeEqual compare arbitrary-length passwords without leaking length.
    const configuredHash = createHash('sha256').update(app.connectorPassword ?? '').digest();
    const submittedHash = createHash('sha256').update(submittedPassword).digest();
    const isCorrectPassword = timingSafeEqual(configuredHash, submittedHash);

    if (!isCorrectPassword) {
      lockout.recordFailure(request.ip);
      if (lockout.isLocked(request.ip)) {
        reply.status(423).header('Cache-Control', 'no-store').type('text/html').send(renderLockedPage());
        return;
      }
      reply
        .status(401)
        .header('Cache-Control', 'no-store')
        .type('text/html')
        .send(renderPasswordPage({ flowParams, error: 'Incorrect password. Please try again.' }));
      return;
    }

    lockout.recordSuccess(request.ip);

    const code = codeStore.issueCode({
      clientId: validation.params.clientId,
      redirectUri: validation.params.redirectUri,
      codeChallenge: validation.params.codeChallenge,
    });

    const redirectUrl = new URL(validation.params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (validation.params.state) redirectUrl.searchParams.set('state', validation.params.state);
    reply.status(302).header('Location', redirectUrl.toString()).send();
  });

  app.post('/oauth/token', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);

    const body = (request.body as Record<string, unknown>) ?? {};
    const grantType = typeof body.grant_type === 'string' ? body.grant_type : undefined;
    if (grantType !== 'authorization_code') {
      reply.status(400);
      return { error: 'unsupported_grant_type' };
    }

    const code = typeof body.code === 'string' ? body.code : undefined;
    const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier : undefined;
    const clientId = typeof body.client_id === 'string' ? body.client_id : undefined;
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : undefined;

    if (!code || !codeVerifier || !clientId || !redirectUri) {
      reply.status(400);
      return { error: 'invalid_grant', error_description: 'Missing required parameters' };
    }

    const pending = codeStore.redeemCode(code);
    if (!pending || pending.clientId !== clientId || pending.redirectUri !== redirectUri) {
      reply.status(400);
      return { error: 'invalid_grant' };
    }

    const expectedChallenge = createHash('sha256').update(codeVerifier).digest().toString('base64url');
    if (expectedChallenge !== pending.codeChallenge) {
      reply.status(400);
      return { error: 'invalid_grant' };
    }

    const token = mintToken(app.mcpKey);
    return { access_token: token, token_type: 'bearer' };
  });
}
