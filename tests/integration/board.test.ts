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

  it('enriches a task with tags, note text, and linked person/company names in searchText (B3-B5)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const taskResponse = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Follow up with Sam' } });
    const taskId = taskResponse.json().id;

    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/notes`, payload: { text: 'Kickoff call went well' } });

    const personResponse = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera' },
    });
    const personId = personResponse.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/people`, payload: { personId } });

    const companyResponse = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: 'Acme Inc' } });
    const companyId = companyResponse.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/companies`, payload: { companyId } });

    const tagResponse = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } });
    const tagId = tagResponse.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/tags`, payload: { tagId } });

    const response = await app.inject({ method: 'GET', url: '/api/board' });
    const toDo = response.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');
    const task = toDo.tasks.find((t: { id: number }) => t.id === taskId);

    expect(task.tags).toEqual([{ id: tagId, name: 'VIP', color: expect.any(String) }]);
    expect(task.searchText).toBe('follow up with sam\nkickoff call went well\nsam rivera\nacme inc');
  });

  it('gives a bare task with no notes, tags, or links only its lowercased title and empty tags (B5)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Review Budget' } });

    const response = await app.inject({ method: 'GET', url: '/api/board' });
    const toDo = response.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');

    expect(toDo.tasks[0].tags).toEqual([]);
    expect(toDo.tasks[0].searchText).toBe('review budget');
  });

  it('orders a task’s tags by name, case-insensitively (B3)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const taskResponse = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Tagged card' } });
    const taskId = taskResponse.json().id;

    const zTag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'zebra' } });
    const aTag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Alpha' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/tags`, payload: { tagId: zTag.json().id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/tags`, payload: { tagId: aTag.json().id } });

    const response = await app.inject({ method: 'GET', url: '/api/board' });
    const toDo = response.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');

    expect(toDo.tasks[0].tags.map((t: { name: string }) => t.name)).toEqual(['Alpha', 'zebra']);
  });

  it('keeps existing fields unchanged in name, type, and value (B6) and performs no writes (B7)', async () => {
    const { db } = createDb(':memory:');
    db.insert(tasks).values({ title: 'First', lane: 'To Do', position: 0, createdAt: 1000 }).run();
    const app = buildApp({ db, lanes: LANES });

    const before = db.select().from(tasks).all();
    const response = await app.inject({ method: 'GET', url: '/api/board' });
    const after = db.select().from(tasks).all();

    const toDo = response.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');
    expect(toDo.tasks[0]).toMatchObject({ id: before[0]!.id, title: 'First', lane: 'To Do', position: 0, createdAt: 1000 });
    expect(after).toEqual(before);
  });
});
