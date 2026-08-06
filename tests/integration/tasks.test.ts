import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

describe('POST /api/tasks', () => {
  it('returns 201 with the created task for a valid title', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: '  Follow up with Sam  ' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ title: 'Follow up with Sam', lane: 'To Do' });
    expect(typeof body.id).toBe('number');
    expect(typeof body.createdAt).toBe('number');
  });

  it('creates distinct tasks for duplicate titles', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const first = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Same title' } });
    const second = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Same title' } });

    expect(first.json().id).not.toBe(second.json().id);
  });

  it('ignores a client-supplied lane or id', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Sneaky', lane: 'Done', id: 999 },
    });

    const body = response.json();
    expect(body.lane).toBe('To Do');
    expect(body.id).not.toBe(999);
  });

  it('rejects a missing title with 400 and persists nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Title is required' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('rejects an empty title with 400 and persists nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: '' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Title is required' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('rejects a whitespace-only title with 400 and persists nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Title is required' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('creates the task and its first note atomically when a non-blank note is supplied', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Prep board deck', note: 'Kickoff call went well' },
    });

    expect(response.statusCode).toBe(201);
    const task = response.json();

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0]).toMatchObject({ text: 'Kickoff call went well', source: 'ui', createdAt: task.createdAt });
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['blank-after-trim', '   '],
  ])('creates a task with zero notes when the note is %s', async (_label, note) => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Book flights', note } });

    expect(response.statusCode).toBe(201);
    const task = response.json();

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toEqual([]);
  });

  it('persists no task and no note when the title is blank and a note is supplied', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: '   ', note: 'Kickoff call went well' },
    });

    expect(response.statusCode).toBe(400);

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });
});
