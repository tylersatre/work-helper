export interface VerifiedIdentity {
  username: string;
}

export interface IdentityVerifier {
  /** Resolves to the identity iff the assertion is genuinely Authentik-originated and currently valid; null in every other case. Never throws. */
  verify(assertion: string | undefined): Promise<VerifiedIdentity | null>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export interface IdentityVerifierOptions {
  /** Hard timeout for the userinfo round trip. Defaults to 5s (production); tests may override for speed. */
  timeoutMs?: number;
}

/** Presents `assertion` as a Bearer token to `userinfoUrl`; a 200 + non-empty preferred_username proves Authentik origin. */
export function createIdentityVerifier(userinfoUrl: string, options: IdentityVerifierOptions = {}): IdentityVerifier {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async verify(assertion) {
      if (!assertion) {
        return null;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(userinfoUrl, {
          headers: { authorization: `Bearer ${assertion}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          return null;
        }

        const body: unknown = await response.json();
        const username = (body as Record<string, unknown> | null)?.preferred_username;
        if (typeof username !== 'string' || username.length === 0) {
          return null;
        }

        return { username };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
