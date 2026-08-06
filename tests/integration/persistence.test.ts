import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

describe('task persistence across restarts', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'work-helper-persistence-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a created task visible after the app is rebuilt against the same database file', async () => {
    const dbPath = join(dir, 'work-helper.db');

    const { db: db1, sqlite: sqlite1 } = createDb(dbPath);
    const app1 = buildApp({ db: db1, lanes: LANES });
    const createResponse = await app1.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Follow up with Sam' },
    });
    expect(createResponse.statusCode).toBe(201);
    await app1.close();
    sqlite1.close();

    const { db: db2 } = createDb(dbPath);
    const app2 = buildApp({ db: db2, lanes: LANES });
    const boardResponse = await app2.inject({ method: 'GET', url: '/api/board' });

    const body = boardResponse.json();
    const toDo = body.lanes.find((lane: { name: string }) => lane.name === 'To Do');
    expect(toDo.tasks.map((t: { title: string }) => t.title)).toEqual(['Follow up with Sam']);
  });
});
