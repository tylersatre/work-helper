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

  describe('legacy bare-array form', () => {
    it('loads a valid JSON array preserving order, normalizing with first/last-lane fallbacks', () => {
      const path = writeConfig(JSON.stringify(['To Do', 'In Progress', 'Waiting', 'Done']));

      expect(loadLanesConfig(path)).toEqual({
        lanes: ['To Do', 'In Progress', 'Waiting', 'Done'],
        dashboard: { defaultLanes: ['To Do'], quickDoneLane: 'Done' },
      });
    });

    it('honors the LANES_CONFIG_PATH override when no path argument is given', () => {
      const path = writeConfig(JSON.stringify(['Only Lane']));
      process.env.LANES_CONFIG_PATH = path;

      expect(loadLanesConfig()).toEqual({
        lanes: ['Only Lane'],
        dashboard: { defaultLanes: ['Only Lane'], quickDoneLane: 'Only Lane' },
      });
    });

    it('rejects a non-array, non-object value', () => {
      const path = writeConfig(JSON.stringify('nope'));

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

    it('rejects malformed JSON, naming the config path', () => {
      const path = writeConfig('{ not valid json');

      expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
    });

    it('rejects a missing file, naming the config path', () => {
      const path = join(dir, 'missing-lanes.json');

      expect(() => loadLanesConfig(path)).toThrow(/missing-lanes\.json/);
    });
  });

  describe('object form', () => {
    it('loads with both designations honored, each independently', () => {
      const path = writeConfig(
        JSON.stringify({
          lanes: ['Up Next', 'In Progress', 'Waiting', 'Done'],
          dashboardDefaultLanes: ['Up Next', 'In Progress'],
          quickDoneLane: 'Done',
        }),
      );

      expect(loadLanesConfig(path)).toEqual({
        lanes: ['Up Next', 'In Progress', 'Waiting', 'Done'],
        dashboard: { defaultLanes: ['Up Next', 'In Progress'], quickDoneLane: 'Done' },
      });
    });

    it('falls back to the first configured lane when dashboardDefaultLanes is absent', () => {
      const path = writeConfig(
        JSON.stringify({ lanes: ['Up Next', 'In Progress', 'Done'], quickDoneLane: 'Done' }),
      );

      expect(loadLanesConfig(path).dashboard.defaultLanes).toEqual(['Up Next']);
    });

    it('falls back to the last configured lane when quickDoneLane is absent', () => {
      const path = writeConfig(
        JSON.stringify({ lanes: ['Up Next', 'In Progress', 'Done'], dashboardDefaultLanes: ['Up Next'] }),
      );

      expect(loadLanesConfig(path).dashboard.quickDoneLane).toBe('Done');
    });

    it('normalizes with both fallbacks when neither designation is present', () => {
      const path = writeConfig(JSON.stringify({ lanes: ['A', 'B', 'C'] }));

      expect(loadLanesConfig(path)).toEqual({
        lanes: ['A', 'B', 'C'],
        dashboard: { defaultLanes: ['A'], quickDoneLane: 'C' },
      });
    });

    it('rejects dashboardDefaultLanes referencing a lane not in lanes, naming the config path', () => {
      const path = writeConfig(
        JSON.stringify({ lanes: ['A', 'B'], dashboardDefaultLanes: ['Nonexistent'] }),
      );

      expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
    });

    it('rejects an empty dashboardDefaultLanes array', () => {
      const path = writeConfig(JSON.stringify({ lanes: ['A', 'B'], dashboardDefaultLanes: [] }));

      expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
    });

    it('rejects duplicate entries in dashboardDefaultLanes', () => {
      const path = writeConfig(JSON.stringify({ lanes: ['A', 'B'], dashboardDefaultLanes: ['A', 'A'] }));

      expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
    });

    it('rejects a quickDoneLane not in lanes, naming the config path', () => {
      const path = writeConfig(JSON.stringify({ lanes: ['A', 'B'], quickDoneLane: 'Nonexistent' }));

      expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
    });

    it('rejects malformed JSON in object form, naming the config path', () => {
      const path = writeConfig('{ lanes: [oops');

      expect(() => loadLanesConfig(path)).toThrow(/lanes\.json/);
    });
  });
});
