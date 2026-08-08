import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';

interface BoardResponse {
  lanes: Array<{ name: string; tasks: Array<{ title: string }> }>;
}

type PeopleResponse = Array<{ firstName: string; lastName: string }>;

function taskTitles(board: BoardResponse): string[] {
  return board.lanes.flatMap((lane) => lane.tasks.map((task) => task.title));
}

describe('US2: data survives restarts, rebuilds, and updates', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it('keeps tasks and people across down/up and a rebuild that simulates an update', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const createTask = await harness.fetchApp('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Deployed task' }),
    });
    expect(createTask.status).toBe(201);

    const createPerson = await harness.fetchApp('/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Sam', lastName: 'Rivera' }),
    });
    expect(createPerson.status).toBe(201);

    const down = await harness.down();
    expect(down.code, `docker compose down failed:\n${down.stderr}`).toBe(0);

    const upAgain = await harness.compose(['up', '-d']);
    expect(upAgain.code, `docker compose up -d failed:\n${upAgain.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const boardAfterCycle = (await (await harness.fetchApp('/api/board')).json()) as BoardResponse;
    expect(taskTitles(boardAfterCycle)).toContain('Deployed task');

    const peopleAfterCycle = (await (await harness.fetchApp('/api/people')).json()) as PeopleResponse;
    expect(peopleAfterCycle).toEqual(
      expect.arrayContaining([expect.objectContaining({ firstName: 'Sam', lastName: 'Rivera' })]),
    );

    const createSecondTask = await harness.fetchApp('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Survives updates' }),
    });
    expect(createSecondTask.status).toBe(201);

    // Simulate a `git pull` bringing in new code, then the documented update procedure.
    const indexTs = harness.readFile('src/server/index.ts');
    harness.writeFile('src/server/index.ts', `${indexTs}\n// simulated update\n`);

    const rebuild = await harness.up();
    expect(rebuild.code, `docker compose up -d --build (rebuild) failed:\n${rebuild.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const boardAfterRebuild = (await (await harness.fetchApp('/api/board')).json()) as BoardResponse;
    expect(taskTitles(boardAfterRebuild)).toContain('Deployed task');
    expect(taskTitles(boardAfterRebuild)).toContain('Survives updates');
  }, 300_000);
});
