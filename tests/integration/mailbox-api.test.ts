import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { FakeMailboxAuth } from '../../src/server/services/email/fake-mailbox-auth.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

let app: FastifyInstance;
let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mailbox-api-'));
  statePath = join(dir, 'mailbox-auth-state.json');
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

function buildTestApp(mailboxAuth: FakeMailboxAuth | undefined, mailboxMissingSettings: string[] = []) {
  const { db } = createDb(':memory:');
  app = buildApp({ db, lanes: LANES, mailboxAuth, mailboxMissingSettings });
}

async function getStatus() {
  const response = await app.inject({ method: 'GET', url: '/api/mailbox' });
  return { statusCode: response.statusCode, body: response.json() };
}

async function postConnect() {
  const response = await app.inject({ method: 'POST', url: '/api/mailbox/connect' });
  return { statusCode: response.statusCode, body: response.json() };
}

async function postDisconnect() {
  const response = await app.inject({ method: 'POST', url: '/api/mailbox/disconnect' });
  return { statusCode: response.statusCode, body: response.json() };
}

describe('GET /api/mailbox', () => {
  it('returns not-connected/never-signed-in on a configured, never-signed-in app', async () => {
    buildTestApp(new FakeMailboxAuth({ statePath }));

    const { statusCode, body } = await getStatus();

    expect(statusCode).toBe(200);
    expect(body).toEqual({ state: 'not-connected', reason: 'never-signed-in' });
  });
});

describe('POST /api/mailbox/connect', () => {
  it('returns 200 with a pending attempt (verificationUri, userCode) — FR-003', async () => {
    buildTestApp(new FakeMailboxAuth({ statePath }));

    const { statusCode, body } = await postConnect();

    expect(statusCode).toBe(200);
    expect(body.state).toBe('not-connected');
    expect(body.attempt).toMatchObject({ status: 'pending', verificationUri: 'https://microsoft.com/devicelogin', userCode: 'FAKE-CODE' });
  });

  it('returns the identical userCode on a second connect while pending — FR-004', async () => {
    buildTestApp(new FakeMailboxAuth({ statePath }));

    const first = await postConnect();
    const second = await postConnect();

    expect(second.body.attempt.userCode).toBe(first.body.attempt.userCode);
  });

  it('flips GET /api/mailbox to connected once the fake completes the sign-in — FR-005/FR-007', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    buildTestApp(fake);

    await postConnect();
    fake.resolvePendingSignIn('tyler@example.com');
    await new Promise((resolve) => setImmediate(resolve));

    const { statusCode, body } = await getStatus();
    expect(statusCode).toBe(200);
    expect(body).toEqual({ state: 'connected', account: 'tyler@example.com' });
  });

  it('persists connection across a restart — a second buildApp over the same fake state file still reports connected (FR-008)', async () => {
    buildTestApp(new FakeMailboxAuth({ statePath }));
    const seedAuth = new FakeMailboxAuth({ statePath });
    seedAuth.seedState({ status: 'connected', account: 'tyler@example.com' });

    await app.close();
    buildTestApp(new FakeMailboxAuth({ statePath }));

    const { body } = await getStatus();
    expect(body).toEqual({ state: 'connected', account: 'tyler@example.com' });
  });

  it('returns the connected status without starting an attempt when already connected', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    fake.seedState({ status: 'connected', account: 'tyler@example.com' });
    buildTestApp(fake);

    const { statusCode, body } = await postConnect();

    expect(statusCode).toBe(200);
    expect(body).toEqual({ state: 'connected', account: 'tyler@example.com' });
  });
});

describe('US2 — truthful status at a glance', () => {
  it('GET /api/mailbox on an unconfigured app names exactly the unset settings — FR-002', async () => {
    buildTestApp(undefined, ['MS_CLIENT_ID', 'MS_TENANT_ID']);

    const { statusCode, body } = await getStatus();

    expect(statusCode).toBe(200);
    expect(body).toEqual({ state: 'not-configured', missing: ['MS_CLIENT_ID', 'MS_TENANT_ID'] });
  });

  it('POST /api/mailbox/connect on an unconfigured app returns 409 with the app-wide error envelope', async () => {
    buildTestApp(undefined, ['MS_CLIENT_ID', 'MS_TENANT_ID']);

    const { statusCode, body } = await postConnect();

    expect(statusCode).toBe(409);
    expect(body).toEqual({ error: { message: expect.stringMatching(/MS_CLIENT_ID.*MS_TENANT_ID/) } });
  });

  it('a fake seeded with a dead/expired sign-in reports not-connected/expired — never connected (FR-007, FR-011, SC-003)', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    fake.seedState({ status: 'expired', account: 'tyler@example.com', expiredDetail: 'AADSTS70008: expired refresh token' });
    buildTestApp(fake);

    const { statusCode, body } = await getStatus();

    expect(statusCode).toBe(200);
    expect(body).toEqual({ state: 'not-connected', reason: 'expired', detail: 'AADSTS70008: expired refresh token' });
  });

  it('a fake seeded connected reports connected', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    fake.seedState({ status: 'connected', account: 'tyler@example.com' });
    buildTestApp(fake);

    const { body } = await getStatus();

    expect(body).toEqual({ state: 'connected', account: 'tyler@example.com' });
  });

  it('last-completed-sign-in-wins: mutating the fake store to connected after the app is already running is reflected on the next GET (spec edge case)', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    buildTestApp(fake);

    const before = await getStatus();
    expect(before.body).toEqual({ state: 'not-connected', reason: 'never-signed-in' });

    // Simulates the legacy CLI (npm run mail:signin) completing a sign-in out-of-band while the server runs.
    const outOfBand = new FakeMailboxAuth({ statePath });
    outOfBand.seedState({ status: 'connected', account: 'tyler@example.com' });

    const { body } = await getStatus();
    expect(body).toEqual({ state: 'connected', account: 'tyler@example.com' });
  });
});

describe('US3 — failure recovery and disconnect', () => {
  it('a declined attempt is recorded as failed with the provider error, and a subsequent connect starts a fresh attempt with a new code (FR-006)', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    buildTestApp(fake);

    await postConnect();
    fake.rejectPendingSignIn('AADSTS70016: The user declined the device-code sign-in request.');
    await new Promise((resolve) => setImmediate(resolve));

    const failedStatus = await getStatus();
    expect(failedStatus.body.attempt).toEqual({ status: 'failed', error: 'AADSTS70016: The user declined the device-code sign-in request.' });

    const fresh = await postConnect();
    expect(fresh.body.attempt.status).toBe('pending');
    expect(fresh.body.attempt.userCode).toBe('FAKE-CODE');
  });

  it('POST /api/mailbox/disconnect returns not-connected/never-signed-in, is idempotent, and survives a restart (FR-009)', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    fake.seedState({ status: 'connected', account: 'tyler@example.com' });
    buildTestApp(fake);

    const first = await postDisconnect();
    expect(first.statusCode).toBe(200);
    expect(first.body).toEqual({ state: 'not-connected', reason: 'never-signed-in' });

    const second = await postDisconnect();
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ state: 'not-connected', reason: 'never-signed-in' });

    await app.close();
    buildTestApp(new FakeMailboxAuth({ statePath }));
    const { body } = await getStatus();
    expect(body).toEqual({ state: 'not-connected', reason: 'never-signed-in' });
  });

  it('disconnect clears a failed attempt', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    buildTestApp(fake);

    await postConnect();
    fake.rejectPendingSignIn('declined');
    await new Promise((resolve) => setImmediate(resolve));

    await postDisconnect();

    const { body } = await getStatus();
    expect(body.attempt).toBeUndefined();
  });

  it('disconnect on an unconfigured app returns 409 with the app-wide error envelope (contract parity with connect)', async () => {
    buildTestApp(undefined, ['MS_CLIENT_ID', 'MS_TENANT_ID']);

    const { statusCode, body } = await postDisconnect();

    expect(statusCode).toBe(409);
    expect(body).toEqual({ error: { message: expect.stringMatching(/MS_CLIENT_ID.*MS_TENANT_ID/) } });
  });

  it('connect returns 502 with the provider message when the device-code request itself is rejected, retaining no attempt (wrong-tenant edge case)', async () => {
    const fake = new FakeMailboxAuth({
      statePath,
      rejectDeviceCodeRequest:
        'Microsoft rejected the device-code request before issuing a sign-in code. Check that MS_TENANT_ID matches the app registration\'s Directory (tenant) ID.',
    });
    buildTestApp(fake);

    const { statusCode, body } = await postConnect();

    expect(statusCode).toBe(502);
    expect(body.error.message).toMatch(/MS_TENANT_ID/);

    const { body: status } = await getStatus();
    expect(status.attempt).toBeUndefined();
  });

  it('sync triggered while a connect attempt is pending fails with the connect-the-mailbox message and leaves the attempt pending (edge case)', async () => {
    const fake = new FakeMailboxAuth({ statePath });
    buildTestApp(fake);

    await postConnect();

    const outcome = await app.syncCoordinator.trigger({
      startDate: '2026-08-01',
      endDate: '2026-08-08',
      window: { startUtc: '2026-08-01T00:00:00.000Z', endUtc: '2026-08-09T00:00:00.000Z' },
      source: 'web',
      provider: app.mailProvider,
    });

    expect(outcome.kind).toBe('ran');
    if (outcome.kind === 'ran') {
      expect(outcome.run.status).toBe('failure');
      expect(outcome.run.error).toMatch(/connect the mailbox/i);
    }

    const { body } = await getStatus();
    expect(body.attempt.status).toBe('pending');
  });
});
