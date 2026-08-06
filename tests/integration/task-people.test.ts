import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp() {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES });
}

async function createTask(app: ReturnType<typeof buildTestApp>, title: string) {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

async function createPerson(app: ReturnType<typeof buildTestApp>, firstName: string, lastName: string) {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload: { firstName, lastName } });
  return response.json();
}

describe('GET /api/tasks/:id', () => {
  it('returns the task with title and an empty people list initially', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const response = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ title: 'Follow up with Sam', people: [] });
  });

  it('returns 404 for an unknown task', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/tasks/999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });
});

describe('POST /api/tasks/:id/people', () => {
  it('links a person to the task, listed in the returned task detail', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/people`,
      payload: { personId: person.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().people).toHaveLength(1);
    expect(response.json().people[0]).toMatchObject({ firstName: 'Sam', lastName: 'Rivera' });
  });

  it('linking the same person twice yields one entry', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/people`, payload: { personId: person.id } });
    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/people`,
      payload: { personId: person.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().people).toHaveLength(1);
  });

  it('returns 404 for an unknown task', async () => {
    const app = buildTestApp();
    const person = await createPerson(app, 'Sam', 'Rivera');

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/999/people',
      payload: { personId: person.id },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/people`,
      payload: { personId: 999 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});

describe('DELETE /api/tasks/:id/people/:personId', () => {
  it('removes the linked person from the task detail without altering the person', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/people`, payload: { personId: person.id } });

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}/people/${person.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().people).toEqual([]);

    const personResponse = await app.inject({ method: 'GET', url: `/api/people/${person.id}` });
    expect(personResponse.statusCode).toBe(200);
    expect(personResponse.json()).toMatchObject({ firstName: 'Sam', lastName: 'Rivera' });
  });

  it('is a no-op success when unlinking a person that is not linked', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}/people/${person.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().people).toEqual([]);
  });
});
