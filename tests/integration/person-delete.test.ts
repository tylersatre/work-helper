import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp() {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES });
}

describe('DELETE /api/people/:id', () => {
  it('deletes the person with 204 and no body, and they are gone from the directory', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera' },
    });
    const { id } = created.json();

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${id}` });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toEqual([]);
  });

  it('cascades: a person linked to two tasks is removed from both task details on delete', async () => {
    const app = buildTestApp();
    const person = (
      await app.inject({ method: 'POST', url: '/api/people', payload: { firstName: 'Sam', lastName: 'Rivera' } })
    ).json();
    const taskA = (await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Task A' } })).json();
    const taskB = (await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Task B' } })).json();

    await app.inject({ method: 'POST', url: `/api/tasks/${taskA.id}/people`, payload: { personId: person.id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${taskB.id}/people`, payload: { personId: person.id } });

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/people/${person.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const detailA = await app.inject({ method: 'GET', url: `/api/tasks/${taskA.id}` });
    const detailB = await app.inject({ method: 'GET', url: `/api/tasks/${taskB.id}` });
    expect(detailA.json().people).toEqual([]);
    expect(detailB.json().people).toEqual([]);
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'DELETE', url: '/api/people/999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});
