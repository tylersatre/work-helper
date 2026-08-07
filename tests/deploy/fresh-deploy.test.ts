import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('US1: fresh deploy with one documented command', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it('deploys with `docker compose up -d --build` and serves the board + people on the single published port', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);

    await harness.waitForHttp('/api/board');

    const board = await harness.fetchApp('/api/board');
    expect(board.status).toBe(200);
    const boardBody = (await board.json()) as { lanes: Array<{ name: string }> };
    expect(boardBody.lanes.map((lane) => lane.name)).toEqual(['To Do', 'In Progress', 'Waiting', 'Done']);

    const createPerson = await harness.fetchApp('/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Sam', lastName: 'Rivera' }),
    });
    expect(createPerson.status).toBe(201);

    const peoplePage = await harness.fetchApp('/people');
    expect(peoplePage.status).toBe(200);
    expect(await peoplePage.text()).toContain('<div id="app">');
  }, 300_000);

  it('fails before starting any container when .env is missing CONNECTOR_PASSWORD', async () => {
    harness = await createHarness();
    harness.writeEnv({ WORK_HELPER_PORT: String(harness.port) });

    const up = await harness.up();

    expect(up.code).not.toBe(0);
    expect(`${up.stdout}\n${up.stderr}`).toContain('CONNECTOR_PASSWORD');

    const ps = await harness.compose(['ps', '-q']);
    expect(ps.stdout.trim()).toBe('');
  }, 300_000);
});
