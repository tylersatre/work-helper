import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { originOf, sendUnconfigured } from '../http.js';
import { renderApprovalPage, renderErrorPage, renderRejectionPage } from './approval-page.js';
import { createApprovalTicketStore } from './approval-tickets.js';
import { findClient, registerClient } from './clients.js';
import { createAuthorizationCodeStore } from './codes.js';
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

function readAssertion(headerValue: string | string[] | undefined): string | undefined {
  return typeof headerValue === 'string' ? headerValue : undefined;
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  const codeStore = createAuthorizationCodeStore();
  const ticketStore = createApprovalTicketStore();

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

    const assertion = readAssertion(request.headers['x-authentik-jwt']);
    const identity = app.identityVerifier ? await app.identityVerifier.verify(assertion) : null;
    if (!identity) {
      reply.status(403).header('Cache-Control', 'no-store').type('text/html').send(renderRejectionPage());
      return;
    }

    const client = findClient(app.db, validation.params.clientId);
    const ticket = ticketStore.issueTicket({
      clientId: validation.params.clientId,
      redirectUri: validation.params.redirectUri,
      codeChallenge: validation.params.codeChallenge,
      state: validation.params.state,
    });

    reply
      .status(200)
      .header('Cache-Control', 'no-store')
      .type('text/html')
      .send(renderApprovalPage({ username: identity.username, clientName: client?.clientName ?? validation.params.clientId, ticket }));
  });

  app.post('/oauth/authorize', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);

    const assertion = readAssertion(request.headers['x-authentik-jwt']);
    const identity = app.identityVerifier ? await app.identityVerifier.verify(assertion) : null;
    if (!identity) {
      reply.status(403).header('Cache-Control', 'no-store').type('text/html').send(renderRejectionPage());
      return;
    }

    const body = (request.body as Record<string, unknown>) ?? {};
    const ticket = typeof body.ticket === 'string' ? body.ticket : undefined;
    const action = typeof body.action === 'string' ? body.action : undefined;

    const bound = ticket ? ticketStore.redeemTicket(ticket) : undefined;
    if (!bound) {
      reply.status(400).type('text/html').send(renderErrorPage('This approval link has expired or already been used.'));
      return;
    }

    if (action === 'deny') {
      const redirectUrl = new URL(bound.redirectUri);
      redirectUrl.searchParams.set('error', 'access_denied');
      if (bound.state) redirectUrl.searchParams.set('state', bound.state);
      reply.status(302).header('Location', redirectUrl.toString()).send();
      return;
    }

    if (action !== 'approve') {
      reply.status(400).type('text/html').send(renderErrorPage('Unrecognized action.'));
      return;
    }

    const code = codeStore.issueCode({
      clientId: bound.clientId,
      redirectUri: bound.redirectUri,
      codeChallenge: bound.codeChallenge,
    });

    const redirectUrl = new URL(bound.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (bound.state) redirectUrl.searchParams.set('state', bound.state);
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
