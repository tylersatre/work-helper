import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailMessages } from '../../src/server/db/schema.js';
import type { MailMessage, MailProvider } from '../../src/server/services/email/provider.js';
import { FakeMailProvider, type SeedMessage } from './helpers/fake-mail-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

interface SyncRunView {
  id: number;
  ranAt: number;
  startDate: string;
  endDate: string;
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}

function pricingQuestion(): SeedMessage {
  return {
    id: 'msg-pricing-1',
    conversationId: 'conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-08-04T18:00:00Z',
    sentDateTime: '2026-08-04T18:00:00Z',
    from: { address: 'sam.rivera@example.com' },
    toRecipients: [{ address: 'tyler@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  };
}

function pricingReply(): SeedMessage {
  return {
    id: 'msg-pricing-2',
    conversationId: 'conv-pricing',
    subject: 'Re: Pricing question',
    body: { content: 'Here it is.', contentType: 'text' },
    receivedDateTime: '2026-08-05T15:00:00Z',
    sentDateTime: '2026-08-05T15:00:00Z',
    from: { address: 'tyler@example.com' },
    toRecipients: [{ address: 'sam.rivera@example.com' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'sent',
  };
}

/** A provider whose fetchMessages awaits an external gate before yielding — lets a test hold a sync in flight. */
class GatedMailProvider implements MailProvider {
  constructor(private readonly gate: Promise<void>) {}

  async listFolders() {
    return [{ id: 'inbox', name: 'Inbox', wellKnown: 'inbox' as const, children: [] }];
  }

  async *fetchMessages(): AsyncIterable<MailMessage[]> {
    await this.gate;
    yield [];
  }

  async fetchAttachmentMetadata() {
    return [];
  }
}

let app: FastifyInstance;

function buildTestApp(mailProvider?: MailProvider, dbPath = ':memory:') {
  const { db } = createDb(dbPath);
  app = buildApp({ db, lanes: LANES, mailProvider });
}

async function postRun(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/email-sync/runs', payload: body });
}

async function getRuns(): Promise<{ runs: SyncRunView[] }> {
  const response = await app.inject({ method: 'GET', url: '/api/email-sync/runs' });
  return response.json();
}

afterEach(async () => {
  await app.close();
});

describe('GET /api/email-sync/runs', () => {
  it('returns an empty list when no runs have been recorded', async () => {
    buildTestApp(new FakeMailProvider([]));

    const response = await app.inject({ method: 'GET', url: '/api/email-sync/runs' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs: [] });
  });
});

describe('POST /api/email-sync/runs', () => {
  it('runs a sync and records + lists it newest-first, surviving an app rebuild against the same DB file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'work-helper-sync-runs-'));
    const dbPath = join(dir, 'work-helper.db');
    try {
      buildTestApp(new FakeMailProvider([pricingQuestion(), pricingReply()]), dbPath);

      const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });

      expect(response.statusCode).toBe(201);
      const run = response.json() as SyncRunView;
      expect(run).toMatchObject({
        startDate: '2026-08-01',
        endDate: '2026-08-08',
        source: 'web',
        status: 'success',
        newCount: 2,
        updatedCount: 0,
        error: null,
      });
      expect(typeof run.id).toBe('number');
      expect(typeof run.ranAt).toBe('number');

      const { runs } = await getRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(run);

      await app.close();
      buildTestApp(new FakeMailProvider([]), dbPath);
      const { runs: afterRebuild } = await getRuns();
      expect(afterRebuild).toHaveLength(1);
      expect(afterRebuild[0]!.id).toBe(run.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists runs newest first by ranAt then id', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));

    await postRun({ startDate: '2026-08-01', endDate: '2026-08-04' });
    await postRun({ startDate: '2026-08-04', endDate: '2026-08-08' });

    const { runs } = await getRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0]!.id).toBeGreaterThan(runs[1]!.id);
  });

  it('rejects missing dates with 400 and records nothing', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));

    const missingBoth = await postRun({});
    expect(missingBoth.statusCode).toBe(400);
    expect(missingBoth.json()).toEqual({ error: { message: 'A start date and end date are required' } });

    const missingEnd = await postRun({ startDate: '2026-08-01' });
    expect(missingEnd.statusCode).toBe(400);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(0);
  });

  it('rejects start after end with 400 and records nothing', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));

    const response = await postRun({ startDate: '2026-08-09', endDate: '2026-08-02' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Start date must not be after end date' } });
    expect((await getRuns()).runs).toHaveLength(0);
  });

  it('rejects a malformed or unreal date with 400 and a message distinct from the start-after-end case, recording nothing', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));

    const malformed = await postRun({ startDate: '2026-8-1', endDate: '2026-08-09' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.message).not.toBe('Start date must not be after end date');
    expect(malformed.json().error.message).toMatch(/invalid date/i);

    const unreal = await postRun({ startDate: '2026-02-30', endDate: '2026-08-09' });
    expect(unreal.statusCode).toBe(400);
    expect(unreal.json().error.message).not.toBe('Start date must not be after end date');
    expect(unreal.json().error.message).toMatch(/invalid date/i);

    expect((await getRuns()).runs).toHaveLength(0);
  });

  it('records a failed run with 201 when the mailbox is unreachable', async () => {
    buildTestApp(new FakeMailProvider([], { failImmediately: true }));

    const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as SyncRunView;
    expect(run.status).toBe('failure');
    expect(typeof run.error).toBe('string');

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('failure');
  });

  it('records a failed run with 201 when the mailbox is not connected at all (contracts/http-api.md, FR-008)', async () => {
    buildTestApp(undefined);

    const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as SyncRunView;
    expect(run.status).toBe('failure');
    expect(run.error).toMatch(/not connected/i);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('failure');
  });

  it('records a partial-failure run when the connection drops mid-run, then a later overlapping run stores the remainder without duplicates', async () => {
    const allSeeded = [pricingQuestion(), pricingReply()];
    buildTestApp(new FakeMailProvider(allSeeded, { pageSize: 1, throwAfterMessageCount: 1 }));

    const first = await postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });
    expect(first.statusCode).toBe(201);
    const firstRun = first.json() as SyncRunView;
    expect(firstRun.status).toBe('failure');
    expect(firstRun.newCount).toBe(1);
    expect(typeof firstRun.error).toBe('string');

    app.mailProvider = new FakeMailProvider(allSeeded);
    const second = await postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });
    expect(second.statusCode).toBe(201);
    const secondRun = second.json() as SyncRunView;
    expect(secondRun.status).toBe('success');
    expect(secondRun.newCount).toBe(1);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(2);

    const stored = app.db.select().from(emailMessages).all();
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((m) => m.graphMessageId)).size).toBe(2);
  });

  it('records a 0 new / 0 updated success run for a range with no matching messages', async () => {
    buildTestApp(new FakeMailProvider([pricingQuestion()]));

    const response = await postRun({ startDate: '2026-01-01', endDate: '2026-01-02' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as SyncRunView;
    expect(run).toMatchObject({ status: 'success', newCount: 0, updatedCount: 0 });
    expect((await getRuns()).runs).toHaveLength(1);
  });

  it('rejects a trigger arriving while a run is in flight with 409 and records nothing for it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    buildTestApp(new GatedMailProvider(gate));

    const firstPromise = postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });
    await new Promise((resolve) => setImmediate(resolve));

    const second = await postRun({ startDate: '2026-08-01', endDate: '2026-08-08' });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: { message: 'A sync is already running' } });

    release();
    const first = await firstPromise;
    expect(first.statusCode).toBe(201);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
  });
});
