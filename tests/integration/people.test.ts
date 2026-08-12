import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { createPerson as createPersonService } from '../../src/server/services/people.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp(personFields: string[] = []) {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES, personFields });
}

describe('POST /api/people', () => {
  it('creates a person and returns 201 with the provided email/phone stored as primary entries', async () => {
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
      extraFields: {},
    });
    expect(body.emails).toHaveLength(1);
    expect(body.emails[0]).toMatchObject({ value: 'sam.rivera@example.com', isPrimary: true });
    expect(typeof body.emails[0].id).toBe('number');
    expect(typeof body.emails[0].createdAt).toBe('number');
    expect(body.phones).toHaveLength(1);
    expect(body.phones[0]).toMatchObject({ value: '555-0100', isPrimary: true });
    expect(typeof body.id).toBe('number');
    expect(typeof body.createdAt).toBe('number');
  });

  it('creates a person with no email/phone and returns empty entry arrays', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.emails).toEqual([]);
    expect(body.phones).toEqual([]);
  });

  it('the created person appears in GET /api/people with entry arrays', async () => {
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
    expect(body[0].emails[0]).toMatchObject({ value: 'sam.rivera@example.com', isPrimary: true });
    expect(body[0].phones[0]).toMatchObject({ value: '555-0100', isPrimary: true });
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
  it('returns the person record with entry arrays', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
    });
    const { id } = created.json();

    const response = await app.inject({ method: 'GET', url: `/api/people/${id}` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ firstName: 'Sam', lastName: 'Rivera' });
    expect(body.emails[0]).toMatchObject({ value: 'sam.rivera@example.com', isPrimary: true });
  });

  it('returns 404 for an unknown id', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/people/999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});

describe('PUT /api/people/:id', () => {
  it('persists an edited name, visible on a subsequent GET', async () => {
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
      payload: { firstName: 'Samuel', lastName: 'Rivera' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ firstName: 'Samuel' });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${id}` });
    expect(fetched.json()).toMatchObject({ firstName: 'Samuel' });
    expect(fetched.json().phones[0]).toMatchObject({ value: '555-0100', isPrimary: true });
  });

  it('ignores email/phone keys in the body, leaving existing entries unchanged', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
    });
    const { id } = created.json();

    const update = await app.inject({
      method: 'PUT',
      url: `/api/people/${id}`,
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'ignored@example.com', phone: '555-9999' },
    });

    expect(update.statusCode).toBe(200);
    const body = update.json();
    expect(body.emails[0]).toMatchObject({ value: 'sam.rivera@example.com' });
    expect(body.phones[0]).toMatchObject({ value: '555-0100' });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${id}` });
    expect(fetched.json().emails[0]).toMatchObject({ value: 'sam.rivera@example.com' });
    expect(fetched.json().phones[0]).toMatchObject({ value: '555-0100' });
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

describe('DELETE /api/people/:id cascades entries', () => {
  it('deleting a person removes their email and phone entries', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
    });
    const { id } = created.json();

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${id}` });
    expect(response.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toEqual([]);
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

describe('POST /api/people phone-conflict rejection (US3)', () => {
  it('rejects a phone matching another person with 409 and creates no person row', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez', phone: '555-0200' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', phone: '555-0200' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That phone number is already in use' } });

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toHaveLength(1);
  });

  it('reports the email conflict first when both email and phone conflict', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com', phone: '555-0200' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'ana.alvarez@example.com', phone: '555-0200' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });

    const list = await app.inject({ method: 'GET', url: '/api/people' });
    expect(list.json()).toHaveLength(1);
  });

  it('still rejects a duplicate email at create with the existing email-conflict message', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'ana.alvarez@example.com' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });
  });
});

describe('createPerson service: conflict results carry the holding person (015-mcp-people-tools FR-006)', () => {
  it('an email-conflict result carries the holder id and name, matched case-insensitively', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
    });
    const samId = created.json().id;

    const result = createPersonService(app.db, [], { firstName: 'Other', lastName: 'Person', email: 'Sam.Rivera@example.com' });

    expect(result).toEqual({ ok: false, error: 'email-conflict', holder: { id: samId, name: 'Sam Rivera' } });
  });

  it('a phone-conflict result carries the holder id and name, matched on exact text', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/people',
      payload: { firstName: 'Ana', lastName: 'Alvarez', phone: '555-0200' },
    });
    const anaId = created.json().id;

    const result = createPersonService(app.db, [], { firstName: 'Other', lastName: 'Person', phone: '555-0200' });

    expect(result).toEqual({ ok: false, error: 'phone-conflict', holder: { id: anaId, name: 'Ana Alvarez' } });
  });
});
