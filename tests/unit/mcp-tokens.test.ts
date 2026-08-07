import { describe, expect, it } from 'vitest';
import { deriveKey, mintToken, verifyToken } from '../../src/server/mcp/auth/tokens.js';

describe('deriveKey', () => {
  it('is deterministic for the same password', () => {
    const a = deriveKey('correct-horse-battery');
    const b = deriveKey('correct-horse-battery');
    expect(a.equals(b)).toBe(true);
  });

  it('differs across different passwords', () => {
    const a = deriveKey('correct-horse-battery');
    const b = deriveKey('a-different-password');
    expect(a.equals(b)).toBe(false);
  });
});

describe('mintToken / verifyToken', () => {
  it('mints a whmcp_<payload>.<sig> token', () => {
    const key = deriveKey('correct-horse-battery');
    const token = mintToken(key);
    expect(token).toMatch(/^whmcp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('verifies a minted token against the same password key', () => {
    const key = deriveKey('correct-horse-battery');
    const token = mintToken(key);
    expect(verifyToken(token, key)).toBe(true);
  });

  it('fails verification against a different password key', () => {
    const key = deriveKey('correct-horse-battery');
    const otherKey = deriveKey('a-different-password');
    const token = mintToken(key);
    expect(verifyToken(token, otherKey)).toBe(false);
  });

  it('fails verification when the payload is tampered with', () => {
    const key = deriveKey('correct-horse-battery');
    const token = mintToken(key);
    const [prefixAndPayload, sig] = token.split('.');
    const tamperedPayload = Buffer.from('{"jti":"tampered","iat":0}').toString('base64url');
    const tampered = `${prefixAndPayload.slice(0, prefixAndPayload.indexOf('_') + 1)}${tamperedPayload}.${sig}`;
    expect(verifyToken(tampered, key)).toBe(false);
  });

  it('fails verification when the signature is tampered with', () => {
    const key = deriveKey('correct-horse-battery');
    const token = mintToken(key);
    const [payloadPart] = token.split('.');
    const tampered = `${payloadPart}.${Buffer.from('not-the-real-signature').toString('base64url')}`;
    expect(verifyToken(tampered, key)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    const key = deriveKey('correct-horse-battery');
    expect(verifyToken('not-a-token', key)).toBe(false);
    expect(verifyToken('whmcp_onlyonepart', key)).toBe(false);
    expect(verifyToken('', key)).toBe(false);
  });
});
