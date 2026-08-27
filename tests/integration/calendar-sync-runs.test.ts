import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import type { CalendarProvider, ProviderCalendarEvent } from '../../src/server/services/calendar/provider.js';
import { FakeCalendarProvider, type SeedEvent } from '../../src/server/services/calendar/fake-provider.js';
import type { MailMessage, MailProvider } from '../../src/server/services/email/provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

interface CalendarSyncRunView {
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

function pricingReview(): SeedEvent {
  return {
    id: 'evt-pricing-1',
    subject: 'Pricing review',
    start: '2026-08-14T16:00:00.000Z',
    end: '2026-08-14T16:30:00.000Z',
    location: 'Conference Room B',
    organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    attendees: [{ address: 'tyler@example.com', name: 'Tyler Satre', type: 'required', responseStatus: 'accepted' }],
  };
}

function teamStandup(): SeedEvent {
  return {
    id: 'evt-standup-1',
    subject: 'Team standup',
    start: '2026-08-17T15:00:00.000Z',
    end: '2026-08-17T15:15:00.000Z',
  };
}

function projectKickoff(): SeedEvent {
  return {
    id: 'evt-kickoff-1',
    subject: 'Project kickoff',
    start: '2026-08-20T14:00:00.000Z',
    end: '2026-08-20T14:30:00.000Z',
  };
}

/** A provider whose fetchEvents awaits an external gate before yielding — lets a test hold a sync in flight. */
class GatedCalendarProvider implements CalendarProvider {
  constructor(
    private readonly gate: Promise<void>,
    private readonly markStarted?: () => void,
  ) {}

  async *fetchEvents(): AsyncIterable<ProviderCalendarEvent[]> {
    this.markStarted?.();
    await this.gate;
    yield [];
  }
}

/** Simulates a disconnected mailbox surfacing the reconnect-on-Sync-page guidance, without touching real Graph auth. */
class DisconnectedCalendarProvider implements CalendarProvider {
  async *fetchEvents(): AsyncIterable<ProviderCalendarEvent[]> {
    throw new Error('Mailbox is not connected (never signed in) — connect the mailbox on the Sync page.');
    yield [];
  }
}

/** A provider whose fetchMessages awaits an external gate before yielding — lets a test hold an email sync in flight (mirrors GatedCalendarProvider, reverse direction, FR-006). */
class GatedMailProvider implements MailProvider {
  constructor(
    private readonly gate: Promise<void>,
    private readonly markStarted?: () => void,
  ) {}

  async listFolders() {
    return [{ id: 'inbox', name: 'Inbox', wellKnown: 'inbox' as const, children: [] }];
  }

  async *fetchMessages(): AsyncIterable<MailMessage[]> {
    this.markStarted?.();
    await this.gate;
    yield [];
  }

  async fetchAttachmentMetadata() {
    return [];
  }

  async verifyWriteAccess(): Promise<void> {}

  async setMessageReadState(): Promise<'updated' | 'not-found'> {
    return 'updated';
  }

  async createDraft(): Promise<MailMessage> {
    throw new Error('not implemented');
  }

  async createReplyDraft(): Promise<MailMessage> {
    throw new Error('not implemented');
  }

  async updateDraft(): Promise<MailMessage> {
    throw new Error('not implemented');
  }

  async deleteDraft(): Promise<void> {
    throw new Error('not implemented');
  }

  async fetchDraftMessages(): Promise<void> {}
}

let app: FastifyInstance;

function buildTestApp(calendarProvider?: CalendarProvider, dbPath = ':memory:', mailProvider?: MailProvider) {
  const { db } = createDb(dbPath);
  app = buildApp({ db, lanes: LANES, calendarProvider, mailProvider } as unknown as Parameters<typeof buildApp>[0]);
}

async function postRun(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/calendar-sync/runs', payload: body });
}

async function postEmailRun(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/email-sync/runs', payload: body });
}

async function getRuns(): Promise<{ runs: CalendarSyncRunView[] }> {
  const response = await app.inject({ method: 'GET', url: '/api/calendar-sync/runs' });
  return response.json();
}

async function getStatus(): Promise<{ running: boolean }> {
  const response = await app.inject({ method: 'GET', url: '/api/sync/status' });
  return response.json();
}

afterEach(async () => {
  await app.close();
});

describe('GET /api/calendar-sync/runs', () => {
  it('returns an empty list when no runs have been recorded', async () => {
    buildTestApp(new FakeCalendarProvider([]));

    const response = await app.inject({ method: 'GET', url: '/api/calendar-sync/runs' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs: [] });
  });
});

describe('POST /api/calendar-sync/runs', () => {
  it('runs a sync and records + lists it newest-first, surviving an app rebuild against the same DB file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'work-helper-calendar-sync-runs-'));
    const dbPath = join(dir, 'work-helper.db');
    try {
      buildTestApp(new FakeCalendarProvider([pricingReview(), teamStandup()]), dbPath);

      const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });

      expect(response.statusCode).toBe(201);
      const run = response.json() as CalendarSyncRunView;
      expect(run).toMatchObject({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
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
      buildTestApp(new FakeCalendarProvider([]), dbPath);
      const { runs: afterRebuild } = await getRuns();
      expect(afterRebuild).toHaveLength(1);
      expect(afterRebuild[0]!.id).toBe(run.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists runs newest first by ranAt then id', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));

    await postRun({ startDate: '2026-08-01', endDate: '2026-08-15' });
    await postRun({ startDate: '2026-08-15', endDate: '2026-08-31' });

    const { runs } = await getRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0]!.id).toBeGreaterThan(runs[1]!.id);
  });

  it('rejects missing dates with 400, exact message, and records nothing', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));

    const missingBoth = await postRun({});
    expect(missingBoth.statusCode).toBe(400);
    expect(missingBoth.json()).toEqual({ error: { message: 'A start date and end date are required' } });

    const missingEnd = await postRun({ startDate: '2026-08-01' });
    expect(missingEnd.statusCode).toBe(400);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(0);
  });

  it('rejects start after end with 400 and records nothing', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));

    const response = await postRun({ startDate: '2026-08-31', endDate: '2026-08-01' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Start date must not be after end date' } });
    expect((await getRuns()).runs).toHaveLength(0);
  });

  it('rejects a malformed or unreal date with 400 and a message distinct from the start-after-end case, recording nothing', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));

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

  it('records a failed run with 201 when the calendar provider is unreachable', async () => {
    buildTestApp(new FakeCalendarProvider([], { failImmediately: true }));

    const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as CalendarSyncRunView;
    expect(run.status).toBe('failure');
    expect(typeof run.error).toBe('string');

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('failure');
  });

  it('records the reconnect-on-Sync-page guidance for a disconnected mailbox (FR-013)', async () => {
    buildTestApp(new DisconnectedCalendarProvider());

    const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as CalendarSyncRunView;
    expect(run.status).toBe('failure');
    expect(run.error).toMatch(/connect the mailbox on the sync page/i);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.error).toMatch(/connect the mailbox on the sync page/i);
  });

  it('rejects a trigger arriving while a run is in flight with 409 and records nothing for it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    buildTestApp(new GatedCalendarProvider(gate));

    const firstPromise = postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });
    await new Promise((resolve) => setImmediate(resolve));

    const second = await postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: { message: 'A sync is already running' } });

    release();
    const first = await firstPromise;
    expect(first.statusCode).toBe(201);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
  });

  it('records a 0 new / 0 updated success run for a range with no matching events', async () => {
    buildTestApp(new FakeCalendarProvider([pricingReview()]));

    const response = await postRun({ startDate: '2026-01-01', endDate: '2026-01-02' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as CalendarSyncRunView;
    expect(run).toMatchObject({ status: 'success', newCount: 0, updatedCount: 0 });
    expect((await getRuns()).runs).toHaveLength(1);
  });

  it('records a failure run with a partial newCount when the connection drops mid-run (spec.md Edge Case: "A sync run fails partway")', async () => {
    const allSeeded = [pricingReview(), teamStandup(), projectKickoff()];
    buildTestApp(new FakeCalendarProvider(allSeeded, { pageSize: 1, throwAfterEventCount: 2 }));

    const response = await postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });

    expect(response.statusCode).toBe(201);
    const run = response.json() as CalendarSyncRunView;
    expect(run.status).toBe('failure');
    expect(run.newCount).toBe(2);
    expect(run.newCount).toBeLessThan(allSeeded.length);
    expect(run.updatedCount).toBe(0);
    expect(typeof run.error).toBe('string');
    expect(run.error).not.toBeNull();

    const { runs } = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'failure', newCount: 2, updatedCount: 0 });
    expect(typeof runs[0]!.error).toBe('string');
  });
});

describe('GET /api/sync/status', () => {
  it('reports { running: true } while a calendar sync is in flight and { running: false } once it finishes', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    buildTestApp(new GatedCalendarProvider(gate, markStarted));

    expect(await getStatus()).toEqual({ running: false });

    const firstPromise = postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });
    await started;

    expect(await getStatus()).toEqual({ running: true });

    release();
    await firstPromise;

    expect(await getStatus()).toEqual({ running: false });
  });
});

describe('US1 cross-kind single-flight: email sync in flight blocks calendar sync (FR-006)', () => {
  it('rejects POST /api/calendar-sync/runs with 409 while a web-triggered email sync is in flight, and records nothing for it', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    buildTestApp(new FakeCalendarProvider([pricingReview()]), ':memory:', new GatedMailProvider(gate, markStarted));

    const emailPromise = postEmailRun({ startDate: '2026-08-01', endDate: '2026-08-31' });
    await started;

    const calendarResponse = await postRun({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(calendarResponse.statusCode).toBe(409);
    expect(calendarResponse.json()).toEqual({ error: { message: 'A sync is already running' } });

    release();
    const emailResponse = await emailPromise;
    expect(emailResponse.statusCode).toBe(201);

    const { runs } = await getRuns();
    expect(runs).toHaveLength(0);
  });
});
