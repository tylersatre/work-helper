import { afterEach, describe, expect, it } from 'vitest';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { startStubIdentityProvider, type StubIdentityProvider } from '../integration/helpers/stub-identity-provider.js';

let stub: StubIdentityProvider | undefined;

afterEach(async () => {
  if (stub) {
    await stub.close();
    stub = undefined;
  }
});

describe('createIdentityVerifier', () => {
  it('resolves the username from preferred_username for a token the stub honors', async () => {
    stub = await startStubIdentityProvider();
    const token = stub.mint('tyler');
    const verifier = createIdentityVerifier(stub.url);

    expect(await verifier.verify(token)).toEqual({ username: 'tyler' });
  });

  it('resolves null with no network call when the assertion is absent or empty', async () => {
    stub = await startStubIdentityProvider();
    const verifier = createIdentityVerifier(stub.url);

    expect(await verifier.verify(undefined)).toBeNull();
    expect(await verifier.verify('')).toBeNull();
    expect(stub.callCount).toBe(0);
  });

  it('resolves null for a token the userinfo endpoint answers 401 for (forged/expired/revoked/foreign)', async () => {
    stub = await startStubIdentityProvider();
    const token = stub.mint('tyler');
    stub.invalidate(token);
    const verifier = createIdentityVerifier(stub.url);

    expect(await verifier.verify(token)).toBeNull();
  });

  it('resolves null on a network error (unreachable userinfo URL)', async () => {
    const verifier = createIdentityVerifier('http://127.0.0.1:1/application/o/userinfo/', { timeoutMs: 1000 });

    expect(await verifier.verify('anything')).toBeNull();
  });

  it('resolves null when the response is slower than the configured timeout', async () => {
    stub = await startStubIdentityProvider();
    const token = stub.mintCustom({ delayMs: 300 });
    const verifier = createIdentityVerifier(stub.url, { timeoutMs: 50 });

    expect(await verifier.verify(token)).toBeNull();
  });

  it('resolves null on a non-JSON response body', async () => {
    stub = await startStubIdentityProvider();
    const token = stub.mintCustom({ body: 'not json at all' });
    const verifier = createIdentityVerifier(stub.url);

    expect(await verifier.verify(token)).toBeNull();
  });

  it('resolves null when preferred_username is missing', async () => {
    stub = await startStubIdentityProvider();
    const token = stub.mintCustom({ body: JSON.stringify({ sub: 'abc' }) });
    const verifier = createIdentityVerifier(stub.url);

    expect(await verifier.verify(token)).toBeNull();
  });

  it('resolves null when preferred_username is empty', async () => {
    stub = await startStubIdentityProvider();
    const token = stub.mintCustom({ body: JSON.stringify({ preferred_username: '' }) });
    const verifier = createIdentityVerifier(stub.url);

    expect(await verifier.verify(token)).toBeNull();
  });

  it('never throws, across every rejection path', async () => {
    stub = await startStubIdentityProvider();
    const verifier = createIdentityVerifier(stub.url, { timeoutMs: 50 });

    await expect(verifier.verify(undefined)).resolves.not.toThrow;
    await expect(verifier.verify('unknown-token')).resolves.not.toThrow;
    const slowToken = stub.mintCustom({ delayMs: 300 });
    await expect(verifier.verify(slowToken)).resolves.not.toThrow;
    const malformedToken = stub.mintCustom({ body: '{{{' });
    await expect(verifier.verify(malformedToken)).resolves.not.toThrow;
  });
});
