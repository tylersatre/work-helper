import { randomBytes } from 'node:crypto';

export interface PendingAuth {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
}

export interface AuthorizationCodeStore {
  issueCode(pending: Omit<PendingAuth, 'expiresAt'>): string;
  redeemCode(code: string): PendingAuth | undefined;
}

const CODE_TTL_MS = 60_000;

/** Fresh in-memory store — call once per app instance so a rebuilt app (simulated restart) starts empty. */
export function createAuthorizationCodeStore(): AuthorizationCodeStore {
  const codes = new Map<string, PendingAuth>();

  return {
    issueCode(pending) {
      const code = randomBytes(32).toString('base64url');
      codes.set(code, { ...pending, expiresAt: Date.now() + CODE_TTL_MS });
      return code;
    },

    redeemCode(code) {
      const pending = codes.get(code);
      if (!pending) {
        return undefined;
      }
      codes.delete(code);
      if (pending.expiresAt < Date.now()) {
        return undefined;
      }
      return pending;
    },
  };
}
