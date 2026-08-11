import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeMailboxAuth } from '../../src/server/services/email/fake-mailbox-auth.js';
import { MailboxConnectionManager } from '../../src/server/services/email/mailbox-connection.js';

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
