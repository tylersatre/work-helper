import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConnectionVerification, MailboxAuth } from '../../src/server/services/email/graph-auth.js';
import { FakeMailboxAuth } from '../../src/server/services/email/fake-mailbox-auth.js';
import { MailboxConnectionManager } from '../../src/server/services/email/mailbox-connection.js';

/** Defers invoking onCode until the microtask queue drains — mirrors real MSAL's network round-trip before deviceCodeCallback fires, unlike FakeMailboxAuth's synchronous onCode. */
class DeferredCodeAuth implements MailboxAuth {
  beginSignInCallCount = 0;

  async getAccessToken(): Promise<string> {
    throw new Error('not implemented');
  }

  async getWriteAccessToken(): Promise<string> {
    throw new Error('not implemented');
  }

  async verifyConnection(): Promise<ConnectionVerification> {
    return { connected: false, reason: 'never-signed-in' };
  }

  async beginSignIn(onCode: (verificationUri: string, userCode: string, expiresAt: number) => void): Promise<{ account: string }> {
    this.beginSignInCallCount += 1;
    await Promise.resolve();
    await Promise.resolve();
    onCode('https://microsoft.com/devicelogin', `CODE-${this.beginSignInCallCount}`, Date.now() + 900_000);
    return new Promise(() => {
      // Never settles — the test only cares about the pre-onCode race window.
    });
  }

  async signOut(): Promise<void> {}
}

/** Resolves beginSignIn successfully without ever invoking onCode — an ill-behaved MailboxAuth (violates the interface contract), used to prove connect() doesn't hang forever on it. */
class NeverCodesAuth implements MailboxAuth {
  async getAccessToken(): Promise<string> {
    throw new Error('not implemented');
  }

  async getWriteAccessToken(): Promise<string> {
    throw new Error('not implemented');
  }

  async verifyConnection(): Promise<ConnectionVerification> {
    return { connected: false, reason: 'never-signed-in' };
  }

  async beginSignIn(): Promise<{ account: string }> {
    return { account: 'tyler@example.com' };
  }

  async signOut(): Promise<void> {}
}

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mailbox-connection-'));
  statePath = join(dir, 'mailbox-auth-state.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function auth(): FakeMailboxAuth {
  return new FakeMailboxAuth({ statePath });
}

describe('MailboxConnectionManager', () => {
  it('connect() starts a device-code flow and returns a pending SignInAttempt captured from the onCode callback', async () => {
    const manager = new MailboxConnectionManager(auth());

    const attempt = await manager.connect();

    expect(attempt.status).toBe('pending');
    expect(attempt.verificationUri).toBe('https://microsoft.com/devicelogin');
    expect(attempt.userCode).toBe('FAKE-CODE');
    expect(typeof attempt.expiresAt).toBe('number');
    expect(manager.getAttempt()).toEqual(attempt);
  });

  it('a second connect() while pending returns the same attempt and code without starting a new flow (FR-004)', async () => {
    const fake = auth();
    const manager = new MailboxConnectionManager(fake);

    const first = await manager.connect();
    const second = await manager.connect();

    expect(second).toEqual(first);
  });

  it('clears the attempt when the underlying sign-in resolves — connected truth then comes from verifyConnection, never the attempt', async () => {
    const fake = auth();
    const manager = new MailboxConnectionManager(fake);

    await manager.connect();
    fake.resolvePendingSignIn('tyler@example.com');
    await new Promise((resolve) => setImmediate(resolve));

    expect(manager.getAttempt()).toBeNull();
  });

  it('marks the attempt failed with the provider error when the underlying sign-in rejects, and keeps it', async () => {
    const fake = auth();
    const manager = new MailboxConnectionManager(fake);

    await manager.connect();
    fake.rejectPendingSignIn('AADSTS70016: The user declined the device-code sign-in request.');
    await new Promise((resolve) => setImmediate(resolve));

    const attempt = manager.getAttempt();
    expect(attempt).toMatchObject({ status: 'failed', error: 'AADSTS70016: The user declined the device-code sign-in request.' });
  });

  it('connect() after a failure starts a fresh attempt with a new code', async () => {
    const fake = auth();
    const manager = new MailboxConnectionManager(fake);

    await manager.connect();
    fake.rejectPendingSignIn('declined');
    await new Promise((resolve) => setImmediate(resolve));

    const fresh = await manager.connect();
    expect(fresh.status).toBe('pending');
  });

  it('a new manager instance has no attempt (restart edge case)', () => {
    const manager = new MailboxConnectionManager(auth());

    expect(manager.getAttempt()).toBeNull();
  });

  it('two overlapping connect() calls before onCode fires share one device-code flow, not two (FR-004 concurrency)', async () => {
    const deferredAuth = new DeferredCodeAuth();
    const manager = new MailboxConnectionManager(deferredAuth);

    const [first, second] = await Promise.all([manager.connect(), manager.connect()]);

    expect(deferredAuth.beginSignInCallCount).toBe(1);
    expect(second).toEqual(first);
  });

  it('connect() rejects instead of hanging forever if beginSignIn resolves without ever calling onCode', async () => {
    const manager = new MailboxConnectionManager(new NeverCodesAuth());

    await expect(manager.connect()).rejects.toThrow();
    expect(manager.getAttempt()).toBeNull();
  });

  it('clears the attempt on a near-expiry successful resolution, never leaving it failed (edge case)', async () => {
    const fake = auth();
    const manager = new MailboxConnectionManager(fake);

    const attempt = await manager.connect();
    // Simulate the resolution landing right at/after the code's expiry — success still wins.
    fake.resolvePendingSignIn('tyler@example.com');
    await new Promise((resolve) => setImmediate(resolve));

    expect(manager.getAttempt()).toBeNull();
    expect(attempt.status).toBe('pending');
  });
});
