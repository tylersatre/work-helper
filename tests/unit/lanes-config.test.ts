import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLanesConfig } from '../../src/server/lanes-config.js';

describe('loadLanesConfig', () => {
  let dir: string;
  const originalEnv = process.env.LANES_CONFIG_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lanes-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.LANES_CONFIG_PATH;
    } else {
      process.env.LANES_CONFIG_PATH = originalEnv;
    }
  });

  function writeConfig(content: string): string {
    const path = join(dir, 'lanes.json');
    writeFileSync(path, content);
    return path;
  }

  it('loads a valid JSON array preserving order', () => {
    const path = writeConfig(JSON.stringify(['To Do', 'In Progress', 'Waiting', 'Done']));

    expect(loadLanesConfig(path)).toEqual(['To Do', 'In Progress', 'Waiting', 'Done']);
  });

  it('honors the LANES_CONFIG_PATH override when no path argument is given', () => {
    const path = writeConfig(JSON.stringify(['Only Lane']));
    process.env.LANES_CONFIG_PATH = path;

    expect(loadLanesConfig()).toEqual(['Only Lane']);
  });

  it('rejects a non-array', () => {
    const path = writeConfig(JSON.stringify({ lanes: ['To Do'] }));

    expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
  });

  it('rejects an empty array', () => {
    const path = writeConfig(JSON.stringify([]));

    expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
  });

  it('rejects an entry that is empty after trimming', () => {
    const path = writeConfig(JSON.stringify(['To Do', '   ']));

    expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
  });

  it('rejects duplicate names', () => {
    const path = writeConfig(JSON.stringify(['To Do', 'To Do']));

    expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
  });
});
