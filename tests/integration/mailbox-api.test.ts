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
