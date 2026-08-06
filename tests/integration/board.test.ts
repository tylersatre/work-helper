import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { tasks } from '../../src/server/db/schema.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

describe('GET /api/board', () => {
  it('returns every configured lane, in config order, each with empty tasks, on an empty database', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/board' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lanes: [
        { name: 'To Do', tasks: [] },
        { name: 'In Progress', tasks: [] },
        { name: 'Waiting', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    });
  });

  it('returns tasks in the correct lane in id ASC order on a populated database', async () => {
    const { db } = createDb(':memory:');
    db.insert(tasks).values({ title: 'First', lane: 'To Do', createdAt: 1 }).run();
    db.insert(tasks).values({ title: 'Second', lane: 'To Do', createdAt: 2 }).run();
    db.insert(tasks).values({ title: 'Third', lane: 'In Progress', createdAt: 3 }).run();
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/board' });

    const body = response.json();
    const toDo = body.lanes.find((lane: { name: string }) => lane.name === 'To Do');
    const inProgress = body.lanes.find((lane: { name: string }) => lane.name === 'In Progress');

    expect(toDo.tasks.map((t: { title: string }) => t.title)).toEqual(['First', 'Second']);
    expect(inProgress.tasks.map((t: { title: string }) => t.title)).toEqual(['Third']);
  });
});
