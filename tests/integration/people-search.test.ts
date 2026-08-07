import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { personEmails } from '../../src/server/db/schema.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp() {
  const { db } = createDb(':memory:');
  const app = buildApp({ db, lanes: LANES });
  return Object.assign(app, { db });
}

async function seedPeople(app: ReturnType<typeof buildTestApp>) {
  await app.inject({
    method: 'POST',
    url: '/api/people',
    payload: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
  });
  await app.inject({
    method: 'POST',
    url: '/api/people',
    payload: { firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com' },
  });
  await app.inject({
    method: 'POST',
    url: '/api/people',
    payload: { firstName: 'Bo', lastName: 'Baker', email: null },
  });
}

describe('GET /api/people?q=', () => {
  it('matches a case-insensitive substring of the first name', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people?q=sam' });

    const names = response.json().map((p: { firstName: string }) => p.firstName);
    expect(names).toEqual(['Sam']);
  });

  it('matches a case-insensitive substring of the last name', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people?q=ALVA' });

    const names = response.json().map((p: { firstName: string }) => p.firstName);
    expect(names).toEqual(['Ana']);
  });

  it('matches a case-insensitive substring of the email', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people?q=ana.alvarez@' });

    const names = response.json().map((p: { firstName: string }) => p.firstName);
    expect(names).toEqual(['Ana']);
  });

  it('treats % and _ as literal characters, not wildcards', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people?q=' + encodeURIComponent('%_') });

    expect(response.json()).toEqual([]);
  });

  it('returns the full directory when q is blank', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people?q=' });

    expect(response.json()).toHaveLength(3);
  });

  it('returns the full directory when q is absent', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people' });

    expect(response.json()).toHaveLength(3);
  });

  it('keeps directory order in results', async () => {
    const app = buildTestApp();
    await seedPeople(app);

    const response = await app.inject({ method: 'GET', url: '/api/people?q=a' });

    const names = response.json().map((p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`);
    expect(names).toEqual(['Ana Alvarez', 'Bo Baker', 'Sam Rivera']);
  });

  it('does not match a non-primary email — search only reaches the primary entry', async () => {
    const app = buildTestApp();
    await seedPeople(app);
    const sam = (await app.inject({ method: 'GET', url: '/api/people?q=sam' })).json()[0];

    app.db.insert(personEmails).values({
      personId: sam.id,
      value: 'sam.personal@example.com',
      isPrimary: false,
      createdAt: Date.now(),
    }).run();

    const response = await app.inject({ method: 'GET', url: '/api/people?q=sam.personal' });

    expect(response.json()).toEqual([]);
  });
});
