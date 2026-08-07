import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';

interface BoardResponse {
  lanes: Array<{ name: string }>;
}

const ORIGINAL_LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

async function waitForLogsContaining(harness: Harness, substring: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastLogs = '';
  while (Date.now() < deadline) {
    const logs = await harness.logs();
    lastLogs = `${logs.stdout}\n${logs.stderr}`;
    if (lastLogs.includes(substring)) {
      return lastLogs;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`logs never contained "${substring}"; last seen:\n${lastLogs}`);
}

describe('US6: operational config lives in a mounted directory', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it('applies a host config edit on restart, and a malformed file fails startup naming it (SC-004)', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    harness.writeFile('config/lanes.json', JSON.stringify(['To Do', 'In Progress', 'Waiting', 'Blocked', 'Done']));

    const restart = await harness.restart();
    expect(restart.code, `docker compose restart failed:\n${restart.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const board = (await (await harness.fetchApp('/api/board')).json()) as BoardResponse;
    expect(board.lanes.map((lane) => lane.name)).toEqual(['To Do', 'In Progress', 'Waiting', 'Blocked', 'Done']);

    harness.writeFile('config/lanes.json', '{ not valid json');
    const restartWithBadConfig = await harness.restart();
    expect(restartWithBadConfig.code, `docker compose restart failed:\n${restartWithBadConfig.stderr}`).toBe(0);

    const logs = await waitForLogsContaining(harness, 'lanes.json');
    expect(logs).toContain('lanes.json');

    harness.writeFile('config/lanes.json', JSON.stringify(ORIGINAL_LANES));
    await harness.restart();
  }, 300_000);
});
