import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/server/db/index.js';
import { tasks } from '../../src/server/db/schema.js';

describe('createDb', () => {
  it('creates a tasks table supporting insert + select round-trip on :memory:', () => {
    const { db } = createDb(':memory:');

    db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', createdAt: 1754500000000 }).run();
    const rows = db.select().from(tasks).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Follow up with Sam', lane: 'To Do', createdAt: 1754500000000 });
    expect(typeof rows[0]?.id).toBe('number');
  });

  describe('with a file-backed database', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'work-helper-db-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('is safe to apply migrations twice against the same file (idempotent)', () => {
      const dbPath = join(dir, 'work-helper.db');

      const { db: db1, sqlite: sqlite1 } = createDb(dbPath);
      db1.insert(tasks).values({ title: 'First', lane: 'To Do', createdAt: 1 }).run();
      sqlite1.close();

      expect(() => createDb(dbPath)).not.toThrow();

      const { db: db2 } = createDb(dbPath);
      const rows = db2.select().from(tasks).all();
      expect(rows).toHaveLength(1);
    });
  });
});
