import { randomBytes } from 'node:crypto';
import http, { type Server } from 'node:http';

export interface StubResponse {
  /** HTTP status to answer with. Default 200. */
  status?: number;
  /** Raw response body. Default `{"preferred_username":"<the minted username>"}`. */
  body?: string;
  /** Delay before responding, to simulate a slow/unresponsive Authentik. */
  delayMs?: number;
}

export interface StubIdentityProvider {
  /** The stub's userinfo URL — point AUTHENTIK_USERINFO_URL (or the verifier under test) at this. */
  url: string;
  /** Number of requests the stub has received so far — lets tests prove a verify() call never hit the network. */
  readonly callCount: number;
  /** Mints a token the stub currently honors: 200 + JSON `{ preferred_username: username }`. */
  mint(username: string): string;
  /** Mints a token honored with an arbitrary raw response — for malformed/slow/missing-claim edge cases. */
  mintCustom(response: StubResponse): string;
  /** Revokes a previously minted token: the stub now answers 401 for it, as it does for any unknown token. */
  invalidate(token: string): void;
  close(): Promise<void>;
}

/** A faithful local fake of an Authentik userinfo endpoint, per contracts/identity-verification.md's simulation contract. */
export async function startStubIdentityProvider(): Promise<StubIdentityProvider> {
  const tokens = new Map<string, StubResponse & { username?: string }>();
  let callCount = 0;

  const server: Server = http.createServer((req, res) => {
    callCount += 1;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    const entry = token ? tokens.get(token) : undefined;

    const respond = () => {
      if (!entry) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_token' }));
        return;
      }
      const status = entry.status ?? 200;
      const body = entry.body ?? JSON.stringify({ preferred_username: entry.username });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body);
    };

    if (entry?.delayMs) {
      setTimeout(respond, entry.delayMs);
    } else {
      respond();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  const url = `http://127.0.0.1:${address.port}/application/o/userinfo/`;

  return {
    url,

    get callCount(): number {
      return callCount;
    },

    mint(username: string): string {
      const token = randomBytes(24).toString('base64url');
      tokens.set(token, { username });
      return token;
    },

    mintCustom(response: StubResponse): string {
      const token = randomBytes(24).toString('base64url');
      tokens.set(token, response);
      return token;
    },

    invalidate(token: string): void {
      tokens.delete(token);
    },

    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
