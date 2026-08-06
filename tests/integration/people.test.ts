import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp(personFields: string[] = []) {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES, personFields });
}

describe('POST /api/people', () => {
  it('creates a person and returns 201 with all fields', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      firstName: 'Sam',
      lastName: 'Rivera',
      email: 'sam.rivera@example.com',
      phone: '555-0100',
      extraFields: {},
    });
    expect(typeof body.id).toBe('number');
    expect(typeof body.createdAt).toBe('number');
  });

  it('the created person appears in GET /api/people with all fields', async () => {
    const app = buildTestApp();

    await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
    });

    const response = await app.inject({ method: 'GET', url: '/api/people' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      firstName: 'Sam',
      lastName: 'Rivera',
      email: 'sam.rivera@example.com',
      phone: '555-0100',
    });
  });

  it('rejects blank names with 400 and persists nothing', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: '  ', lastName: 'Rivera' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'First and last name are required' } });

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toEqual([]);
  });

  it('rejects a missing last name with 400 and persists nothing', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'First and last name are required' } });

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toEqual([]);
  });

  it('rejects a duplicate email differing only by case with 409 and persists nothing', async () => {
    const app = buildTestApp();

    await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam2', lastName: 'Rivera', email: 'Sam.Rivera@example.com' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toHaveLength(1);
  });

  it('allows two people with blank emails to coexist', async () => {
    const app = buildTestApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Bo', lastName: 'Baker' },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toHaveLength(2);
  });
});

describe('GET /api/people ordering', () => {
  it('orders by last name then first name, case-insensitive', async () => {
    const app = buildTestApp();

    await app.inject({ method: 'POST', url: '/api/people', payload: { firstName: 'Sam', lastName: 'Rivera' } });
    await app.inject({ method: 'POST', url: '/api/people', payload: { firstName: 'ana', lastName: 'alvarez' } });
    await app.inject({ method: 'POST', url: '/api/people', payload: { firstName: 'Bo', lastName: 'Rivera' } });

    const response = await app.inject({ method: 'GET', url: '/api/people' });
    const names = response.json().map((p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`);

    expect(names).toEqual(['ana alvarez', 'Bo Rivera', 'Sam Rivera']);
  });
});

describe('GET /api/people/:id', () => {
  it('returns the person record', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
    });
    const { id } = created.json();

    const response = await app.inject({ method: 'GET', url: `/api/people/${id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
  });

  it('returns 404 for an unknown id', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/people/999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});

describe('PUT /api/people/:id', () => {
  it('persists an edited field, visible on a subsequent GET', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', phone: '555-0100' },
    });
    const { id } = created.json();

    const update = await app.inject({
      method: 'PUT',
      url: `/api/people/${id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', phone: '555-0199' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ phone: '555-0199' });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${id}` });
    expect(fetched.json()).toMatchObject({ phone: '555-0199' });
  });

  it('rejects blank names with 400 and leaves the stored record unchanged', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera' },
    });
    const { id } = created.json();

    const update = await app.inject({
      method: 'PUT',
      url: `/api/people/${id}`,
      payload: { firstName: '  ', lastName: 'Rivera' },
    });

    expect(update.statusCode).toBe(400);
    expect(update.json()).toEqual({ error: { message: 'First and last name are required' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${id}` });
    expect(fetched.json()).toMatchObject({ firstName: 'Sam', lastName: 'Rivera' });
  });

  it('rejects an email matching another person, case-insensitively, with 409, and leaves the stored record unchanged', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
    });
    const { id } = created.json();

    const update = await app.inject({
      method: 'PUT',
      url: `/api/people/${id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'Ana.Alvarez@example.com' },
    });

    expect(update.statusCode).toBe(409);
    expect(update.json()).toEqual({ error: { message: 'That email is already in use' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${id}` });
    expect(fetched.json()).toMatchObject({ email: 'sam.rivera@example.com' });
  });

  it('succeeds when keeping the person own email unchanged', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
    });
    const { id } = created.json();

    const update = await app.inject({
      method: 'PUT',
      url: `/api/people/${id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0199' },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ email: 'sam.rivera@example.com', phone: '555-0199' });
  });

  it('returns 404 for an unknown id', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/people/999',
      payload: { firstName: 'Sam', lastName: 'Rivera' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});

describe('GET /api/person-fields', () => {
  it('returns the configured labels in config order', async () => {
    const app = buildTestApp(['Nickname', 'Company']);

    const response = await app.inject({ method: 'GET', url: '/api/person-fields' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ fields: ['Nickname', 'Company'] });
  });

  it('returns an empty list when no extra fields are configured', async () => {
    const app = buildTestApp([]);

    const response = await app.inject({ method: 'GET', url: '/api/person-fields' });

    expect(response.json()).toEqual({ fields: [] });
  });
});

describe('extra fields (US5)', () => {
  it('a configured extra field value round-trips through create, read, and update', async () => {
    const app = buildTestApp(['Nickname']);

    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', extraFields: { Nickname: 'Sammy' } },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().extraFields).toEqual({ Nickname: 'Sammy' });
    const { id } = created.json();

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${id}` });
    expect(fetched.json().extraFields).toEqual({ Nickname: 'Sammy' });

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/people/${id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', extraFields: { Nickname: 'Sam the Man' } },
    });
    expect(updated.json().extraFields).toEqual({ Nickname: 'Sam the Man' });
  });

  it('strips keys not in the current configuration and drops blank values', async () => {
    const app = buildTestApp(['Nickname']);

    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', extraFields: { Nickname: '  ', Unknown: 'value' } },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().extraFields).toEqual({});
  });
});
