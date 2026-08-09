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

  it('returns tasks in each lane ordered by position ASC, id ASC, not insertion order', async () => {
    const { db } = createDb(':memory:');
    db.insert(tasks).values({ title: 'First', lane: 'To Do', position: 1, createdAt: 1 }).run();
    db.insert(tasks).values({ title: 'Second', lane: 'To Do', position: 0, createdAt: 2 }).run();
    db.insert(tasks).values({ title: 'Third', lane: 'In Progress', position: 0, createdAt: 3 }).run();
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/board' });

    const body = response.json();
    const toDo = body.lanes.find((lane: { name: string }) => lane.name === 'To Do');
    const inProgress = body.lanes.find((lane: { name: string }) => lane.name === 'In Progress');

    expect(toDo.tasks.map((t: { title: string }) => t.title)).toEqual(['Second', 'First']);
    expect(inProgress.tasks.map((t: { title: string }) => t.title)).toEqual(['Third']);
  });

  it('falls back to id ASC to break ties on duplicate positions', async () => {
    const { db } = createDb(':memory:');
    db.insert(tasks).values({ title: 'First', lane: 'To Do', position: 0, createdAt: 1 }).run();
    db.insert(tasks).values({ title: 'Second', lane: 'To Do', position: 0, createdAt: 2 }).run();
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/board' });

    const toDo = response.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');
    expect(toDo.tasks.map((t: { title: string }) => t.title)).toEqual(['First', 'Second']);
  });

  it('includes position on every task in the board payload', async () => {
    const { db } = createDb(':memory:');
    db.insert(tasks).values({ title: 'First', lane: 'To Do', position: 0, createdAt: 1 }).run();
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/board' });

    const toDo = response.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');
    expect(toDo.tasks[0]).toMatchObject({ title: 'First', position: 0 });
  });
});
