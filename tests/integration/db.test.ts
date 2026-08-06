import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/server/db/index.js';
import { people, taskPeople, tasks } from '../../src/server/db/schema.js';

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

  describe('people and task_people tables', () => {
    it('creates the people and task_people tables with foreign key enforcement enabled', () => {
      const { sqlite } = createDb(':memory:');

      const fkStatus = sqlite.pragma('foreign_keys', { simple: true });
      expect(fkStatus).toBe(1);

      const tableNames = (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('people', 'task_people')").all() as {
          name: string;
        }[]
      )
        .map((row) => row.name)
        .sort();
      expect(tableNames).toEqual(['people', 'task_people']);
    });

    it('rejects a second person whose email differs only by case, while allowing multiple NULL emails', () => {
      const { db } = createDb(':memory:');

      db.insert(people).values({ firstName: 'Sam', lastName: 'Rivera', email: 'sam@example.com', createdAt: 1 }).run();

      expect(() =>
        db
          .insert(people)
          .values({ firstName: 'Sam2', lastName: 'Rivera', email: 'SAM@example.com', createdAt: 2 })
          .run(),
      ).toThrow();

      expect(() => {
        db.insert(people).values({ firstName: 'Ana', lastName: 'Alvarez', createdAt: 3 }).run();
        db.insert(people).values({ firstName: 'Bo', lastName: 'Baker', createdAt: 4 }).run();
      }).not.toThrow();
    });

    it('rejects a duplicate (task_id, person_id) pair on task_people via the composite primary key', () => {
      const { db } = createDb(':memory:');
      const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 }).returning().all();
      const [person] = db.insert(people).values({ firstName: 'Sam', lastName: 'Rivera', createdAt: 1 }).returning().all();

      db.insert(taskPeople).values({ taskId: task!.id, personId: person!.id }).run();

      expect(() => db.insert(taskPeople).values({ taskId: task!.id, personId: person!.id }).run()).toThrow();
    });

    it('cascades deleting a person to remove its task_people rows', () => {
      const { db } = createDb(':memory:');
      const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 }).returning().all();
      const [person] = db.insert(people).values({ firstName: 'Sam', lastName: 'Rivera', createdAt: 1 }).returning().all();
      db.insert(taskPeople).values({ taskId: task!.id, personId: person!.id }).run();

      db.delete(people).where(eq(people.id, person!.id)).run();

      expect(db.select().from(taskPeople).all()).toHaveLength(0);
    });
  });

  describe('task_notes table', () => {
    it('creates the task_notes table with id, task_id, text, source, created_at columns', () => {
      const { sqlite } = createDb(':memory:');

      const tableNames = (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_notes'").all() as { name: string }[]
      ).map((row) => row.name);
      expect(tableNames).toEqual(['task_notes']);

      const columnNames = (sqlite.prepare('PRAGMA table_info(task_notes)').all() as { name: string }[])
        .map((row) => row.name)
        .sort();
      expect(columnNames).toEqual(['created_at', 'id', 'source', 'task_id', 'text']);
    });

    it('rejects a note row referencing a missing task (foreign key enforced)', () => {
      const { sqlite } = createDb(':memory:');

      expect(() =>
        sqlite
          .prepare('INSERT INTO task_notes (task_id, text, source, created_at) VALUES (?, ?, ?, ?)')
          .run(999, 'Orphan note', 'ui', 1),
      ).toThrow();
    });

    it('cascades deleting a task to remove its notes', () => {
      const { db, sqlite } = createDb(':memory:');
      const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 }).returning().all();
      sqlite
        .prepare('INSERT INTO task_notes (task_id, text, source, created_at) VALUES (?, ?, ?, ?)')
        .run(task!.id, 'First note', 'ui', 1);

      sqlite.prepare('DELETE FROM tasks WHERE id = ?').run(task!.id);

      const remaining = sqlite.prepare('SELECT * FROM task_notes').all();
      expect(remaining).toHaveLength(0);
    });
  });
});
