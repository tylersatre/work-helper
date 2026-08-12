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

describe('POST /api/companies', () => {
  it('creates a company, trimming the name before saving and checking uniqueness', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: '  Acme Inc  ' } });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(typeof body.id).toBe('number');
    expect(body).toEqual({ id: body.id, name: 'Acme Inc' });
  });

  it('rejects a whitespace-only name with 400 "A name is required"', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A name is required' } });
  });

  it('rejects a case-insensitive duplicate with 409 "That company name is already in use"', async () => {
    const app = buildTestApp();
    await createCompany(app, 'Acme Inc');

    const response = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: 'acme inc' } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That company name is already in use' } });

    const list = await app.inject({ method: 'GET', url: '/api/companies' });
    expect(list.json()).toHaveLength(1);
  });
});

describe('GET /api/companies', () => {
  it('returns an empty array when no companies exist', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/companies' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('lists companies alphabetically by name, case-insensitively', async () => {
    const app = buildTestApp();
    await createCompany(app, 'Zephyr Co');
    await createCompany(app, 'acme inc');
    await createCompany(app, 'Beta LLC');

    const response = await app.inject({ method: 'GET', url: '/api/companies' });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((c: { name: string }) => c.name)).toEqual(['acme inc', 'Beta LLC', 'Zephyr Co']);
  });

  it('?q= filters by case-insensitive substring on name', async () => {
    const app = buildTestApp();
    await createCompany(app, 'Acme Inc');
    await createCompany(app, 'Zephyr Co');
    await createCompany(app, 'Globex');

    const response = await app.inject({ method: 'GET', url: '/api/companies?q=CM' });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((c: { name: string }) => c.name)).toEqual(['Acme Inc']);
  });
});

describe('GET /api/companies/:id', () => {
  it('returns a CompanyDetail with empty people/cards/tags arrays for a new company', async () => {
    const app = buildTestApp();
    const created = await createCompany(app, 'Acme Inc');

    const response = await app.inject({ method: 'GET', url: `/api/companies/${created.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: created.id, name: 'Acme Inc', people: [], cards: [], tags: [] });
  });

  it('returns 404 "Company not found" for a missing id', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/companies/999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Company not found' } });
  });
});

describe('PATCH /api/companies/:id', () => {
  it('renames a company, reflected in subsequent list/detail reads', async () => {
    const app = buildTestApp();
    const created = await createCompany(app, 'Acme Inc');

    const response = await app.inject({ method: 'PATCH', url: `/api/companies/${created.id}`, payload: { name: 'Acme Corp' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: created.id, name: 'Acme Corp' });

    const detail = await app.inject({ method: 'GET', url: `/api/companies/${created.id}` });
    expect(detail.json()).toMatchObject({ name: 'Acme Corp' });

    const list = await app.inject({ method: 'GET', url: '/api/companies' });
    expect(list.json().map((c: { name: string }) => c.name)).toEqual(['Acme Corp']);
  });

  it('rejects a whitespace-only name with 400 "A name is required"', async () => {
    const app = buildTestApp();
    const created = await createCompany(app, 'Acme Inc');

    const response = await app.inject({ method: 'PATCH', url: `/api/companies/${created.id}`, payload: { name: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A name is required' } });
  });

  it('rejects a duplicate against any other company with 409 while allowing recasing its own name', async () => {
    const app = buildTestApp();
    const acme = await createCompany(app, 'Acme Inc');
    await createCompany(app, 'Zephyr Co');

    const conflict = await app.inject({ method: 'PATCH', url: `/api/companies/${acme.id}`, payload: { name: 'zephyr co' } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: { message: 'That company name is already in use' } });

    const recase = await app.inject({ method: 'PATCH', url: `/api/companies/${acme.id}`, payload: { name: 'ACME INC' } });
    expect(recase.statusCode).toBe(200);
    expect(recase.json()).toMatchObject({ name: 'ACME INC' });
  });

  it('returns 404 "Company not found" for a missing id', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'PATCH', url: '/api/companies/999', payload: { name: 'Acme Inc' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Company not found' } });
  });
});
