import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('US5: the stack recovers on its own after a crash', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.teardown();
      harness = undefined;
    }
  });

  it('restarts the crashed container and responds again within 30s, with no compose command run (SC-003)', async () => {
    harness = await createHarness();

    const up = await harness.up();
    expect(up.code, `docker compose up -d --build failed:\n${up.stderr}`).toBe(0);
    await harness.waitForHttp('/api/board');

    const containerId = await harness.containerId();

    const kill = await harness.docker(['exec', containerId, 'pkill', '-9', 'node']);
    expect(kill.code, `pkill -9 node failed:\n${kill.stderr}`).toBe(0);

    await harness.waitForHttp('/api/board', { timeoutMs: 30_000 });

    const inspect = await harness.docker(['inspect', '-f', '{{.RestartCount}}', containerId]);
    const restartCount = Number(inspect.stdout.trim());
    expect(restartCount).toBeGreaterThanOrEqual(1);
  }, 300_000);
});
