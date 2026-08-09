import type { OAuthClientInformationFull, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';

const DEFAULT_REDIRECT_URI = 'http://localhost:8976/callback';

export class TestOAuthClientProvider implements OAuthClientProvider {
  private _clientInformation?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _lastAuthorizationUrl?: URL;

  constructor(private readonly redirectUri: string = DEFAULT_REDIRECT_URI) {}

  get redirectUrl(): string {
    return this.redirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUri],
      client_name: 'work-helper test client',
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return this._clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    this._clientInformation = info;
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
  }

  redirectToAuthorization(url: URL): void {
    this._lastAuthorizationUrl = url;
  }

  saveCodeVerifier(verifier: string): void {
    this._codeVerifier = verifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('no code verifier saved');
    }
    return this._codeVerifier;
  }

  get lastAuthorizationUrl(): URL | undefined {
    return this._lastAuthorizationUrl;
  }
}

/** Runs discovery + dynamic client registration and returns the authorization URL the browser would open. */
export async function startConnect(serverUrl: string, provider: TestOAuthClientProvider): Promise<URL> {
  const result = await auth(provider, { serverUrl });
  if (result !== 'REDIRECT') {
    throw new Error(`expected REDIRECT, got ${result}`);
  }
  const url = provider.lastAuthorizationUrl;
  if (!url) {
    throw new Error('provider did not capture an authorization URL');
  }
  return url;
}

export interface AuthorizeOptions {
  /** The value the outpost would set on X-authentik-jwt. Omit to simulate no identity header at all. */
  assertion?: string;
}

/** GETs the authorize URL, attaching X-authentik-jwt the way the outpost would, without following redirects. */
export async function getAuthorize(authorizationUrl: URL, opts: AuthorizeOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.assertion !== undefined) {
    headers['x-authentik-jwt'] = opts.assertion;
  }
  return fetch(authorizationUrl.toString(), { headers, redirect: 'manual' });
}

/** Extracts the hidden `ticket` field's value from a rendered approval page. */
export function extractTicket(html: string): string {
  const match = html.match(/name="ticket"\s+value="([^"]+)"/);
  if (!match) {
    throw new Error(`no ticket field found in approval page HTML: ${html}`);
  }
  return match[1] as string;
}

export interface ApprovalSubmitOptions {
  /** The value the outpost would set on X-authentik-jwt. Omit to simulate no identity header at all. */
  assertion?: string;
}

/** POSTs the approval form's { ticket, action } as a browser submitting the rendered page would. */
export async function postApproval(
  origin: string,
  ticket: string,
  action: 'approve' | 'deny',
  opts: ApprovalSubmitOptions = {},
): Promise<Response> {
  const body = new URLSearchParams({ ticket, action });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (opts.assertion !== undefined) {
    headers['x-authentik-jwt'] = opts.assertion;
  }

  return fetch(`${origin}/oauth/authorize`, {
    method: 'POST',
    headers,
    body: body.toString(),
    redirect: 'manual',
  });
}

/** Extracts the `code` query param from a 302 redirect response's Location header. */
export function extractCode(response: Response): string {
  const location = response.headers.get('location');
  if (!location || response.status !== 302) {
    throw new Error(`expected a 302 redirect with a Location header, got ${response.status} ${location}`);
  }
  const url = new URL(location);
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error(`redirect Location had no code: ${location}`);
  }
  return code;
}

/** Finishes the token exchange for a code obtained from extractCode. */
export async function finishConnect(serverUrl: string, provider: TestOAuthClientProvider, code: string): Promise<void> {
  const result = await auth(provider, { serverUrl, authorizationCode: code });
  if (result !== 'AUTHORIZED') {
    throw new Error(`expected AUTHORIZED, got ${result}`);
  }
}

export interface ConnectThroughApprovalOptions {
  /** The value the outpost would set on X-authentik-jwt for an honored assertion. */
  assertion: string;
}

/** Full happy-path connect: register, open the authorize URL with a verified assertion, approve, finish the token exchange. */
export async function connectThroughApproval(
  serverUrl: string,
  opts: ConnectThroughApprovalOptions,
): Promise<TestOAuthClientProvider> {
  const provider = new TestOAuthClientProvider();
  const authorizationUrl = await startConnect(serverUrl, provider);

  const approvalResponse = await getAuthorize(authorizationUrl, { assertion: opts.assertion });
  const html = await approvalResponse.text();
  const ticket = extractTicket(html);

  const origin = `${authorizationUrl.protocol}//${authorizationUrl.host}`;
  const approveResponse = await postApproval(origin, ticket, 'approve', { assertion: opts.assertion });
  const code = extractCode(approveResponse);

  await finishConnect(serverUrl, provider, code);
  return provider;
}
