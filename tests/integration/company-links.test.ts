import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp() {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES });
}

async function createCompany(app: ReturnType<typeof buildTestApp>, name: string) {
  const response = await app.inject({ method: 'POST', url: '/api/companies', payload: { name } });
  return response.json();
}

async function createPerson(app: ReturnType<typeof buildTestApp>, firstName: string, lastName: string) {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload: { firstName, lastName } });
  return response.json();
}

async function createTask(app: ReturnType<typeof buildTestApp>, title: string) {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

describe('person-company assignment', () => {
  it('sets, switches, and clears via PUT /api/people/:id companyId', async () => {
    const app = buildTestApp();
    const acme = await createCompany(app, 'Acme Corp');
    const globex = await createCompany(app, 'Globex');
    const sam = await createPerson(app, 'Sam', 'Rivera');

    const setResponse = await app.inject({
      method: 'PUT',
      url: `/api/people/${sam.id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', companyId: acme.id },
    });
    expect(setResponse.statusCode).toBe(200);
    expect(setResponse.json().company).toEqual({ id: acme.id, name: 'Acme Corp' });

    const switchResponse = await app.inject({
      method: 'PUT',
      url: `/api/people/${sam.id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', companyId: globex.id },
    });
    expect(switchResponse.statusCode).toBe(200);
    expect(switchResponse.json().company).toEqual({ id: globex.id, name: 'Globex' });

    const clearResponse = await app.inject({
      method: 'PUT',
      url: `/api/people/${sam.id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', companyId: null },
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json().company).toBeNull();
  });

  it('leaves the assignment unchanged when companyId is omitted', async () => {
    const app = buildTestApp();
    const acme = await createCompany(app, 'Acme Corp');
    const sam = await createPerson(app, 'Sam', 'Rivera');
    await app.inject({ method: 'PUT', url: `/api/people/${sam.id}`, payload: { firstName: 'Sam', lastName: 'Rivera', companyId: acme.id } });

    const response = await app.inject({ method: 'PUT', url: `/api/people/${sam.id}`, payload: { firstName: 'Samuel', lastName: 'Rivera' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ firstName: 'Samuel', company: { id: acme.id, name: 'Acme Corp' } });
  });

  it('rejects a missing company id with 400 "Company not found" and leaves the person unchanged', async () => {
    const app = buildTestApp();
    const sam = await createPerson(app, 'Sam', 'Rivera');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/people/${sam.id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', companyId: 999 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Company not found' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${sam.id}` });
    expect(fetched.json().company).toBeNull();
  });

  it('GET /api/people/:id includes company: Company | null', async () => {
    const app = buildTestApp();
    const acme = await createCompany(app, 'Acme Corp');
    const sam = await createPerson(app, 'Sam', 'Rivera');

    const before = await app.inject({ method: 'GET', url: `/api/people/${sam.id}` });
    expect(before.json().company).toBeNull();

    await app.inject({ method: 'PUT', url: `/api/people/${sam.id}`, payload: { firstName: 'Sam', lastName: 'Rivera', companyId: acme.id } });

    const after = await app.inject({ method: 'GET', url: `/api/people/${sam.id}` });
    expect(after.json().company).toEqual({ id: acme.id, name: 'Acme Corp' });
  });

  it("GET /api/companies/:id people section lists exactly the currently assigned people, ordered lastName/firstName NOCASE", async () => {
    const app = buildTestApp();
    const acme = await createCompany(app, 'Acme Corp');
    const globex = await createCompany(app, 'Globex');
    const rivera = await createPerson(app, 'Sam', 'Rivera');
    const alvarez = await createPerson(app, 'ana', 'alvarez');
    const other = await createPerson(app, 'Bo', 'Baker');

    await app.inject({ method: 'PUT', url: `/api/people/${rivera.id}`, payload: { firstName: 'Sam', lastName: 'Rivera', companyId: acme.id } });
    await app.inject({ method: 'PUT', url: `/api/people/${alvarez.id}`, payload: { firstName: 'ana', lastName: 'alvarez', companyId: acme.id } });
    await app.inject({ method: 'PUT', url: `/api/people/${other.id}`, payload: { firstName: 'Bo', lastName: 'Baker', companyId: globex.id } });

    const detail = await app.inject({ method: 'GET', url: `/api/companies/${acme.id}` });
    expect(detail.json().people).toEqual([
      { id: alvarez.id, firstName: 'ana', lastName: 'alvarez' },
      { id: rivera.id, firstName: 'Sam', lastName: 'Rivera' },
    ]);
  });
});

describe('card-company links', () => {
  it('POST /api/tasks/:id/companies links a company, returned in the updated TaskDetail (ordered name NOCASE)', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const globex = await createCompany(app, 'Globex');
    const acme = await createCompany(app, 'Acme Corp');

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: globex.id } });
    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: acme.id } });

    expect(response.statusCode).toBe(200);
    expect(response.json().companies).toEqual([
      { id: acme.id, name: 'Acme Corp' },
      { id: globex.id, name: 'Globex' },
    ]);
  });

  it('linking an already-linked company is a no-op returning the unchanged detail', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const acme = await createCompany(app, 'Acme Corp');
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: acme.id } });

    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: acme.id } });

    expect(response.statusCode).toBe(200);
    expect(response.json().companies).toEqual([{ id: acme.id, name: 'Acme Corp' }]);
  });

  it('404s for a missing task or company', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const acme = await createCompany(app, 'Acme Corp');

    const missingTask = await app.inject({ method: 'POST', url: '/api/tasks/999/companies', payload: { companyId: acme.id } });
    expect(missingTask.statusCode).toBe(404);
    expect(missingTask.json()).toEqual({ error: { message: 'Task not found' } });

    const missingCompany = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: 999 } });
    expect(missingCompany.statusCode).toBe(404);
    expect(missingCompany.json()).toEqual({ error: { message: 'Company not found' } });
  });

  it('DELETE /api/tasks/:id/companies/:companyId unlinks and returns the updated detail', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const acme = await createCompany(app, 'Acme Corp');
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: acme.id } });

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}/companies/${acme.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().companies).toEqual([]);

    const missingTask = await app.inject({ method: 'DELETE', url: `/api/tasks/999/companies/${acme.id}` });
    expect(missingTask.statusCode).toBe(404);
    expect(missingTask.json()).toEqual({ error: { message: 'Task not found' } });
  });

  it('GET /api/tasks/:id includes companies', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const acme = await createCompany(app, 'Acme Corp');
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: acme.id } });

    const response = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });

    expect(response.json().companies).toEqual([{ id: acme.id, name: 'Acme Corp' }]);
  });

  it("GET /api/companies/:id cards section lists exactly the linked cards, ordered title NOCASE", async () => {
    const app = buildTestApp();
    const acme = await createCompany(app, 'Acme Corp');
    const zephyr = await createTask(app, 'Zephyr onboarding');
    const alpha = await createTask(app, 'alpha rollout');
    await createTask(app, 'Unrelated card');

    await app.inject({ method: 'POST', url: `/api/tasks/${zephyr.id}/companies`, payload: { companyId: acme.id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${alpha.id}/companies`, payload: { companyId: acme.id } });

    const detail = await app.inject({ method: 'GET', url: `/api/companies/${acme.id}` });
    expect(detail.json().cards).toEqual([
      { id: alpha.id, title: 'alpha rollout', lane: 'To Do' },
      { id: zephyr.id, title: 'Zephyr onboarding', lane: 'To Do' },
    ]);
  });
});
