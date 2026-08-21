import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { tags } from '../../src/server/db/schema.js';
import { createTag, deleteTagByIdentifier, resolveExistingTag } from '../../src/server/services/tags.js';

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

describe('GET /api/tags', () => {
  it('returns an empty array when no tags exist', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/tags' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('lists every tag with id, name, and color after tags are created through the create-and-attach endpoints', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { name: 'VIP' } });
    await app.inject({ method: 'POST', url: `/api/people/${person.id}/tags`, payload: { name: 'Q3' } });

    const response = await app.inject({ method: 'GET', url: '/api/tags' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: number; name: string; color: string }[];
    const names = body.map((tag) => tag.name).sort();
    expect(names).toEqual(['Q3', 'VIP']);
    for (const tag of body) {
      expect(typeof tag.id).toBe('number');
      expect(typeof tag.color).toBe('string');
    }
  });

  it('returns TagWithCounts[] ordered by total attachments descending, ties broken by lower(name) ascending', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');

    const vip = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } })).json();
    const q3 = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Q3' } })).json();
    await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Alpha' } });
    await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Beta' } });

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { tagId: vip.id } });
    await app.inject({ method: 'POST', url: `/api/people/${person.id}/tags`, payload: { tagId: vip.id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { tagId: q3.id } });

    const response = await app.inject({ method: 'GET', url: '/api/tags' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { name: string; peopleCount: number; tasksCount: number }[];
    expect(body.map((tag) => tag.name)).toEqual(['VIP', 'Q3', 'Alpha', 'Beta']);
    expect(body.find((t) => t.name === 'VIP')).toMatchObject({ peopleCount: 1, tasksCount: 1 });
    expect(body.find((t) => t.name === 'Q3')).toMatchObject({ peopleCount: 0, tasksCount: 1 });
    expect(body.find((t) => t.name === 'Alpha')).toMatchObject({ peopleCount: 0, tasksCount: 0 });
  });
});

describe('POST /api/tags', () => {
  it('creates a tag with an auto-assigned color and zero attachments', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Roadmap' } });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(typeof body.id).toBe('number');
    expect(typeof body.color).toBe('string');
    expect(body).toEqual({ id: body.id, name: 'Roadmap', color: body.color });

    const list = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(list.json().find((t: { name: string }) => t.name === 'Roadmap')).toMatchObject({ peopleCount: 0, tasksCount: 0 });
  });

  it('rejects a whitespace-only name with 400 "A name is required"', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'A name is required' } });
  });

  it('rejects a case-insensitive duplicate with 409 "That tag name is already in use"', async () => {
    const app = buildTestApp();
    await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } });

    const response = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'vip' } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { message: 'That tag name is already in use' } });
  });
});

describe('PATCH /api/tags/:id', () => {
  it('renames a tag, reflected in subsequent person/task/tag reads', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const tag = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } })).json();
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { tagId: tag.id } });

    const response = await app.inject({ method: 'PATCH', url: `/api/tags/${tag.id}`, payload: { name: 'Key client' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Key client' });

    const list = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(list.json().map((t: { name: string }) => t.name)).toEqual(['Key client']);

    const taskDetail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(taskDetail.json().tags).toEqual([{ id: tag.id, name: 'Key client', color: tag.color }]);
  });

  it('rejects a duplicate against any other tag with 409 while allowing recasing its own name', async () => {
    const app = buildTestApp();
    const vip = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } })).json();
    await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Q3' } });

    const conflict = await app.inject({ method: 'PATCH', url: `/api/tags/${vip.id}`, payload: { name: 'q3' } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: { message: 'That tag name is already in use' } });

    const recase = await app.inject({ method: 'PATCH', url: `/api/tags/${vip.id}`, payload: { name: 'Vip' } });
    expect(recase.statusCode).toBe(200);
    expect(recase.json()).toMatchObject({ name: 'Vip' });
  });

  it('recolors with a valid hex and rejects an invalid color with 400 "A valid color is required"', async () => {
    const app = buildTestApp();
    const tag = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } })).json();

    const invalid = await app.inject({ method: 'PATCH', url: `/api/tags/${tag.id}`, payload: { color: 'blue' } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: { message: 'A valid color is required' } });

    const valid = await app.inject({ method: 'PATCH', url: `/api/tags/${tag.id}`, payload: { color: '#123456' } });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({ color: '#123456' });
  });

  it('rejects an empty body (neither name nor color) with 400 "Nothing to update"', async () => {
    const app = buildTestApp();
    const tag = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } })).json();

    const response = await app.inject({ method: 'PATCH', url: `/api/tags/${tag.id}`, payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Nothing to update' } });
  });

  it('returns 404 "Tag not found" for an unknown id', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'PATCH', url: '/api/tags/999', payload: { name: 'VIP' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Tag not found' } });
  });
});

describe('DELETE /api/tags/:id', () => {
  it('returns 204 and cascade-removes all attachments from person and task reads', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');
    const tag = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } })).json();
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { tagId: tag.id } });
    await app.inject({ method: 'POST', url: `/api/people/${person.id}/tags`, payload: { tagId: tag.id } });

    const response = await app.inject({ method: 'DELETE', url: `/api/tags/${tag.id}` });

    expect(response.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(list.json()).toEqual([]);

    const taskDetail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(taskDetail.json().tags).toEqual([]);

    const personDetail = await app.inject({ method: 'GET', url: `/api/people/${person.id}` });
    expect(personDetail.json().tags).toEqual([]);
  });

  it('returns 404 "Tag not found" for an unknown id', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'DELETE', url: '/api/tags/999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Tag not found' } });
  });
});

describe('resolveExistingTag (service)', () => {
  it('resolves by tagId', () => {
    const { db } = createDb(':memory:');
    const created = createTag(db, 'Renewal');
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = resolveExistingTag(db, { tagId: created.tag.id });

    expect(result).toEqual({ ok: true, tag: created.tag });
  });

  it('resolves by tagName case-insensitively', () => {
    const { db } = createDb(':memory:');
    const created = createTag(db, 'Renewal');
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = resolveExistingTag(db, { tagName: 'renewal' });

    expect(result).toEqual({ ok: true, tag: created.tag });
  });

  it('returns tag-not-found for an unmatched id', () => {
    const { db } = createDb(':memory:');

    const result = resolveExistingTag(db, { tagId: 999 });

    expect(result).toEqual({ ok: false, error: 'tag-not-found' });
  });

  it('returns tag-not-found for an unmatched name', () => {
    const { db } = createDb(':memory:');

    const result = resolveExistingTag(db, { tagName: 'Ghost' });

    expect(result).toEqual({ ok: false, error: 'tag-not-found' });
  });

  it('returns invalid-name for an empty/whitespace tagName', () => {
    const { db } = createDb(':memory:');

    const result = resolveExistingTag(db, { tagName: '   ' });

    expect(result).toEqual({ ok: false, error: 'invalid-name' });
  });
});

describe('createTag (service, extended signature)', () => {
  it('creates with an explicit valid color', () => {
    const { db } = createDb(':memory:');

    const result = createTag(db, 'Renewal', '#F59E0B');

    expect(result).toEqual({ ok: true, tag: { id: expect.any(Number), name: 'Renewal', color: '#F59E0B' } });
  });

  it('creates with an auto-assigned color when rawColor is omitted', () => {
    const { db } = createDb(':memory:');

    const result = createTag(db, 'Overdue');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.tag.color).toBe('string');
    expect(result.tag.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('rejects an empty name', () => {
    const { db } = createDb(':memory:');

    expect(() => createTag(db, '   ')).toThrow();
  });

  it('rejects a case-insensitive duplicate name', () => {
    const { db } = createDb(':memory:');
    createTag(db, 'Renewal');

    const result = createTag(db, 'renewal');

    expect(result).toEqual({ ok: false, error: 'name-taken' });
  });

  it('rejects an invalid (non-hex) rawColor with invalid-color', () => {
    const { db } = createDb(':memory:');

    const result = createTag(db, 'Renewal', 'blue');

    expect(result).toEqual({ ok: false, error: 'invalid-color' });
  });
});

describe('deleteTagByIdentifier (service)', () => {
  it('deletes a tag attached to N people and M tasks, cascading the detach and reporting counts', () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    return (async () => {
      const task = await createTask(app, 'Book venue');
      const personA = await createPerson(app, 'Jordan', 'Smith');
      const personB = await createPerson(app, 'Sam', 'Rivera');
      const tag = (await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Renewal' } })).json();
      await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { tagId: tag.id } });
      await app.inject({ method: 'POST', url: `/api/people/${personA.id}/tags`, payload: { tagId: tag.id } });
      await app.inject({ method: 'POST', url: `/api/people/${personB.id}/tags`, payload: { tagId: tag.id } });

      const result = deleteTagByIdentifier(db, { tagId: tag.id });

      expect(result).toEqual({ ok: true, peopleDetached: 2, tasksDetached: 1 });
      expect(db.select().from(tags).all()).toEqual([]);
    })();
  });

  it('returns tag-not-found for an unknown tag id', () => {
    const { db } = createDb(':memory:');

    const result = deleteTagByIdentifier(db, { tagId: 999 });

    expect(result).toEqual({ ok: false, error: 'tag-not-found' });
  });
});
