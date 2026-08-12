import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { addEntry } from '../../src/server/services/contact-entries.js';
import { emailAddresses, personPhones } from '../../src/server/db/schema.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp() {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES });
}

async function createPerson(app: ReturnType<typeof buildTestApp>, payload: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/people',
    payload: { firstName: 'Sam', lastName: 'Rivera', ...payload },
  });
  return response.json().id as number;
}

describe('POST /api/people/:personId/emails', () => {
  it('stores the first entry as primary and returns 201 with the refreshed entries list', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/people/${personId}/emails`,
      payload: { value: 'sam.rivera@example.com' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ value: 'sam.rivera@example.com', isPrimary: true });
    expect(typeof body.entries[0].id).toBe('number');
    expect(typeof body.entries[0].createdAt).toBe('number');
  });

  it('stores a later entry as non-primary', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });

    const response = await app.inject({
      method: 'POST',
      url: `/api/people/${personId}/emails`,
      payload: { value: 'sam.personal@example.com' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]).toMatchObject({ value: 'sam.rivera@example.com', isPrimary: true });
    expect(body.entries[1]).toMatchObject({ value: 'sam.personal@example.com', isPrimary: false });
  });

  it('rejects a blank/whitespace value with 400', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A value is required' } });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/people/999/emails', payload: { value: 'sam@example.com' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });

  it('persists across a fresh re-read', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().emails).toHaveLength(1);
    expect(fetched.json().emails[0]).toMatchObject({ value: 'sam.rivera@example.com', isPrimary: true });
  });
});

describe('PATCH /api/people/:personId/emails/:entryId', () => {
  it('replaces the value and never touches the primary flag', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/people/${personId}/emails/${entryId}`,
      payload: { value: 'sam.p@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries[0]).toMatchObject({ value: 'sam.p@example.com', isPrimary: true });
  });

  it('rejects a blank value with 400', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;

    const response = await app.inject({ method: 'PATCH', url: `/api/people/${personId}/emails/${entryId}`, payload: { value: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A value is required' } });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'PATCH', url: '/api/people/999/emails/1', payload: { value: 'x@example.com' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });

  it('returns 404 for an unknown entry on that person', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'PATCH', url: `/api/people/${personId}/emails/999`, payload: { value: 'x@example.com' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Entry not found' } });
  });

  it('persists the edit across a fresh re-read', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;
    await app.inject({ method: 'PATCH', url: `/api/people/${personId}/emails/${entryId}`, payload: { value: 'sam.p@example.com' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().emails[0]).toMatchObject({ value: 'sam.p@example.com' });
  });
});

describe('PUT /api/people/:personId/emails/:entryId/primary', () => {
  it('moves the primary marker off the previous primary', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const second = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.personal@example.com' } });
    const secondId = second.json().entries[1].id;

    const response = await app.inject({ method: 'PUT', url: `/api/people/${personId}/emails/${secondId}/primary` });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries.find((e: { id: number }) => e.id === secondId)).toMatchObject({ isPrimary: true });
    expect(entries.filter((e: { isPrimary: boolean }) => e.isPrimary)).toHaveLength(1);
  });

  it('re-marking the current primary is a no-op 200', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;

    const response = await app.inject({ method: 'PUT', url: `/api/people/${personId}/emails/${entryId}/primary` });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries[0]).toMatchObject({ isPrimary: true });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'PUT', url: '/api/people/999/emails/1/primary' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });

  it('returns 404 for an unknown entry on that person', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'PUT', url: `/api/people/${personId}/emails/999/primary` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Entry not found' } });
  });

  it('persists the primary change across a fresh re-read', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const second = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.personal@example.com' } });
    const secondId = second.json().entries[1].id;
    await app.inject({ method: 'PUT', url: `/api/people/${personId}/emails/${secondId}/primary` });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().emails.find((e: { id: number }) => e.id === secondId)).toMatchObject({ isPrimary: true });
  });
});

describe('DELETE /api/people/:personId/emails/:entryId', () => {
  it('returns 200 with the refreshed list', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/${entryId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries).toEqual([]);
  });

  it('promotes the lowest-id survivor when the primary is removed', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const first = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const firstId = first.json().entries[0].id;
    const second = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.personal@example.com' } });
    const secondId = second.json().entries[1].id;

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/${firstId}` });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: secondId, isPrimary: true });
  });

  it('promotes the lowest-id survivor (not merely the only one) when two survivors remain after the primary is removed', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const first = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const firstId = first.json().entries[0].id;
    const second = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.personal@example.com' } });
    const secondId = second.json().entries[1].id;
    const third = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.work@example.com' } });
    const thirdId = third.json().entries[2].id;

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/${firstId}` });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries).toHaveLength(2);
    expect(entries.find((e: { id: number }) => e.id === secondId)).toMatchObject({ isPrimary: true });
    expect(entries.find((e: { id: number }) => e.id === thirdId)).toMatchObject({ isPrimary: false });
  });

  it('removing the last entry leaves a valid empty list', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;

    await app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/${entryId}` });
    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().emails).toEqual([]);
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'DELETE', url: '/api/people/999/emails/1' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });

  it('returns 404 for an unknown entry on that person', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/999` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Entry not found' } });
  });

  it('persists the removal across a fresh re-read', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = created.json().entries[0].id;

    await app.inject({ method: 'DELETE', url: `/api/people/${personId}/emails/${entryId}` });
    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().emails).toEqual([]);
  });
});

describe('POST /api/people/:personId/phones', () => {
  it('stores the first phone entry as primary and returns 201 with the refreshed entries list', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0100' } });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ value: '555-0100', isPrimary: true });
  });

  it('adding a second phone then marking it primary moves the marker', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0100' } });
    const second = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0199' } });
    const secondId = second.json().entries[1].id;

    const response = await app.inject({ method: 'PUT', url: `/api/people/${personId}/phones/${secondId}/primary` });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries.find((e: { id: number }) => e.id === secondId)).toMatchObject({ isPrimary: true });
    expect(entries.filter((e: { isPrimary: boolean }) => e.isPrimary)).toHaveLength(1);
  });

  it('rejects a blank/whitespace value with 400', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A value is required' } });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/people/999/phones', payload: { value: '555-0100' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });
});

describe('PATCH /api/people/:personId/phones/:entryId', () => {
  it('edits a phone value in place without touching the primary flag', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0100' } });
    const entryId = created.json().entries[0].id;

    const response = await app.inject({ method: 'PATCH', url: `/api/people/${personId}/phones/${entryId}`, payload: { value: '555-0199' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries[0]).toMatchObject({ value: '555-0199', isPrimary: true });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'PATCH', url: '/api/people/999/phones/1', payload: { value: '555-0100' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });

  it('returns 404 for an unknown entry on that person', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'PATCH', url: `/api/people/${personId}/phones/999`, payload: { value: '555-0100' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Entry not found' } });
  });
});

describe('DELETE /api/people/:personId/phones/:entryId', () => {
  it('promotes the lowest-id survivor when the primary phone is removed', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const first = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0100' } });
    const firstId = first.json().entries[0].id;
    const second = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0199' } });
    const secondId = second.json().entries[1].id;

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${personId}/phones/${firstId}` });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: secondId, isPrimary: true });
  });

  it('removing the last phone leaves a valid empty list', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);
    const created = await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0100' } });
    const entryId = created.json().entries[0].id;

    await app.inject({ method: 'DELETE', url: `/api/people/${personId}/phones/${entryId}` });
    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().phones).toEqual([]);
  });

  it('stores phone values as exact text — "555-0100" is kept verbatim', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    await app.inject({ method: 'POST', url: `/api/people/${personId}/phones`, payload: { value: '555-0100' } });
    const fetched = await app.inject({ method: 'GET', url: `/api/people/${personId}` });

    expect(fetched.json().phones[0]).toMatchObject({ value: '555-0100' });
  });

  it('returns 404 for an unknown person', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'DELETE', url: '/api/people/999/phones/1' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Person not found' } });
  });

  it('returns 404 for an unknown entry on that person', async () => {
    const app = buildTestApp();
    const personId = await createPerson(app);

    const response = await app.inject({ method: 'DELETE', url: `/api/people/${personId}/phones/999` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Entry not found' } });
  });
});

describe('uniqueness and blank rejection (US3)', () => {
  it("rejects adding another person's email with 409 and leaves the list unchanged", async () => {
    const app = buildTestApp();
    const samId = await createPerson(app, { lastName: 'Rivera' });
    const anaId = await createPerson(app, { firstName: 'Ana', lastName: 'Alvarez' });
    await app.inject({ method: 'POST', url: `/api/people/${anaId}/emails`, payload: { value: 'ana.alvarez@example.com' } });

    const response = await app.inject({
      method: 'POST',
      url: `/api/people/${samId}/emails`,
      payload: { value: 'ana.alvarez@example.com' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${samId}` });
    expect(fetched.json().emails).toEqual([]);
  });

  it("rejects adding the person's own email in a different letter-case with 409", async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);
    await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: 'sam.rivera@example.com' } });

    const response = await app.inject({
      method: 'POST',
      url: `/api/people/${samId}/emails`,
      payload: { value: 'Sam.Rivera@example.com' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${samId}` });
    expect(fetched.json().emails).toHaveLength(1);
  });

  it("rejects adding another person's exact phone with 409 and leaves the list unchanged", async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);
    const anaId = await createPerson(app, { firstName: 'Ana', lastName: 'Alvarez' });
    await app.inject({ method: 'POST', url: `/api/people/${anaId}/phones`, payload: { value: '555-0200' } });

    const response = await app.inject({ method: 'POST', url: `/api/people/${samId}/phones`, payload: { value: '555-0200' } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That phone number is already in use' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${samId}` });
    expect(fetched.json().phones).toEqual([]);
  });

  it('"555-0100" and "5550100" coexist on different people — no normalization', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);
    const anaId = await createPerson(app, { firstName: 'Ana', lastName: 'Alvarez' });
    await app.inject({ method: 'POST', url: `/api/people/${samId}/phones`, payload: { value: '555-0100' } });

    const response = await app.inject({ method: 'POST', url: `/api/people/${anaId}/phones`, payload: { value: '5550100' } });

    expect(response.statusCode).toBe(201);
  });

  it('rejects editing an entry to a colliding value with 409, leaving it unchanged', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);
    const anaId = await createPerson(app, { firstName: 'Ana', lastName: 'Alvarez' });
    await app.inject({ method: 'POST', url: `/api/people/${anaId}/emails`, payload: { value: 'ana.alvarez@example.com' } });
    const samEmail = await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = samEmail.json().entries[0].id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/people/${samId}/emails/${entryId}`,
      payload: { value: 'ana.alvarez@example.com' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That email is already in use' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${samId}` });
    expect(fetched.json().emails[0]).toMatchObject({ value: 'sam.rivera@example.com' });
  });

  it("allows re-casing an entry's own value in place (self-exclusion)", async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);
    const samEmail = await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = samEmail.json().entries[0].id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/people/${samId}/emails/${entryId}`,
      payload: { value: 'Sam.Rivera@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries[0]).toMatchObject({ value: 'Sam.Rivera@example.com' });
  });

  it('rejects a blank value on add with 400 "A value is required"', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);

    const response = await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: '' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A value is required' } });
  });

  it('rejects a blank value on edit with 400 "A value is required", leaving the entry unchanged', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app);
    const samEmail = await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const entryId = samEmail.json().entries[0].id;

    const response = await app.inject({ method: 'PATCH', url: `/api/people/${samId}/emails/${entryId}`, payload: { value: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A value is required' } });

    const fetched = await app.inject({ method: 'GET', url: `/api/people/${samId}` });
    expect(fetched.json().emails[0]).toMatchObject({ value: 'sam.rivera@example.com' });
  });
});

describe('addEntry service: conflict results carry the holding person (015-mcp-people-tools FR-006)', () => {
  it('an email held by another person, matched case-insensitively, identifies that person as the holder', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app, { firstName: 'Sam', lastName: 'Rivera' });
    await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: 'sam.rivera@example.com' } });
    const anaId = await createPerson(app, { firstName: 'Ana', lastName: 'Alvarez' });

    const result = addEntry(app.db, emailAddresses, anaId, 'Sam.Rivera@example.com');

    expect(result).toEqual({ ok: false, error: 'conflict', holder: { id: samId, name: 'Sam Rivera' } });
  });

  it('a phone held by another person, matched on exact text, identifies that person as the holder', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app, { firstName: 'Sam', lastName: 'Rivera' });
    await app.inject({ method: 'POST', url: `/api/people/${samId}/phones`, payload: { value: '555-0100' } });
    const anaId = await createPerson(app, { firstName: 'Ana', lastName: 'Alvarez' });

    const result = addEntry(app.db, personPhones, anaId, '555-0100');

    expect(result).toEqual({ ok: false, error: 'conflict', holder: { id: samId, name: 'Sam Rivera' } });
  });

  it('a value the target person already holds identifies that same person as the holder (edge case)', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app, { firstName: 'Sam', lastName: 'Rivera' });
    await app.inject({ method: 'POST', url: `/api/people/${samId}/emails`, payload: { value: 'sam.rivera@example.com' } });

    const result = addEntry(app.db, emailAddresses, samId, 'sam.rivera@example.com');

    expect(result).toEqual({ ok: false, error: 'conflict', holder: { id: samId, name: 'Sam Rivera' } });
  });

  it('a phone the target person already holds identifies that same person as the holder (edge case)', async () => {
    const app = buildTestApp();
    const samId = await createPerson(app, { firstName: 'Sam', lastName: 'Rivera' });
    await app.inject({ method: 'POST', url: `/api/people/${samId}/phones`, payload: { value: '555-0100' } });

    const result = addEntry(app.db, personPhones, samId, '555-0100');

    expect(result).toEqual({ ok: false, error: 'conflict', holder: { id: samId, name: 'Sam Rivera' } });
  });
});
