import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const APP_SALT = 'work-helper-mcp-v1';
const TOKEN_PREFIX = 'whmcp_';

export function deriveKey(password: string): Buffer {
  return scryptSync(password, APP_SALT, 32);
}

export function mintToken(key: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ jti: randomBytes(16).toString('hex'), iat: Date.now() }));
  const sig = createHmac('sha256', key).update(payload).digest();
  return `${TOKEN_PREFIX}${payload.toString('base64url')}.${sig.toString('base64url')}`;
}

export function verifyToken(token: string, key: Buffer): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return false;
  }

  const parts = token.slice(TOKEN_PREFIX.length).split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [payloadPart, sigPart] = parts as [string, string];

  let payload: Buffer;
  let sig: Buffer;
  try {
    payload = Buffer.from(payloadPart, 'base64url');
    sig = Buffer.from(sigPart, 'base64url');
  } catch {
    return false;
  }

  const expectedSig = createHmac('sha256', key).update(payload).digest();
  if (expectedSig.length !== sig.length) {
    return false;
  }

  return timingSafeEqual(expectedSig, sig);
}
