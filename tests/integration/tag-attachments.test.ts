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

type RecordKind = 'tasks' | 'people';

const CASES: { kind: RecordKind; label: string; notFoundMessage: string; create: (app: ReturnType<typeof buildTestApp>) => Promise<{ id: number }> }[] = [
  { kind: 'tasks', label: 'task', notFoundMessage: 'Task not found', create: (app) => createTask(app, 'Follow up with Sam') },
  { kind: 'people', label: 'person', notFoundMessage: 'Person not found', create: (app) => createPerson(app, 'Sam', 'Rivera') },
];

for (const { kind, label, notFoundMessage, create } of CASES) {
  describe(`POST /api/${kind}/:id/tags`, () => {
    it('create-and-attach by {name} returns 200 {tags} with the new tag auto-colored', async () => {
      const app = buildTestApp();
      const record = await create(app);

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'VIP' } });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { tags: { id: number; name: string; color: string }[] };
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0]).toMatchObject({ name: 'VIP' });
      expect(typeof body.tags[0]!.color).toBe('string');
    });

    it('consecutively created tags get different palette colors', async () => {
      const app = buildTestApp();
      const record = await create(app);

      const first = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'VIP' } });
      const second = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'Q3' } });

      const firstColor = first.json().tags.find((t: { name: string }) => t.name === 'VIP').color;
      const secondColor = second.json().tags.find((t: { name: string }) => t.name === 'Q3').color;
      expect(firstColor).not.toBe(secondColor);
    });

    it('a {name} case-insensitively matching an existing tag attaches it without creating a duplicate (SC-004)', async () => {
      const app = buildTestApp();
      const record = await create(app);
      const other = await create(app);

      await app.inject({ method: 'POST', url: `/api/${kind}/${other.id}/tags`, payload: { name: 'VIP' } });
      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'vip' } });

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toHaveLength(1);
      expect(response.json().tags[0].name).toBe('VIP');

      const allTags = await app.inject({ method: 'GET', url: '/api/tags' });
      expect(allTags.json()).toHaveLength(1);
    });

    it('rejects a trimmed whitespace-only name with 400 "A name is required"', async () => {
      const app = buildTestApp();
      const record = await create(app);

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: '   ' } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { message: 'A name is required' } });
    });

    it('rejects a body with neither tagId nor name with 400 "Provide a tagId or a name"', async () => {
      const app = buildTestApp();
      const record = await create(app);

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: {} });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { message: 'Provide a tagId or a name' } });
    });

    it('rejects a body with both tagId and name with 400 "Provide a tagId or a name"', async () => {
      const app = buildTestApp();
      const record = await create(app);
      const created = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'VIP' } });
      const tagId = created.json().tags[0].id;

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { tagId, name: 'Q3' } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { message: 'Provide a tagId or a name' } });
    });

    it('attach by {tagId} works', async () => {
      const app = buildTestApp();
      const record = await create(app);
      const other = await create(app);
      const created = await app.inject({ method: 'POST', url: `/api/${kind}/${other.id}/tags`, payload: { name: 'VIP' } });
      const tagId = created.json().tags[0].id;

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { tagId } });

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toEqual([{ id: tagId, name: 'VIP', color: expect.any(String) }]);
    });

    it('returns 404 "Tag not found" for an unknown tagId', async () => {
      const app = buildTestApp();
      const record = await create(app);

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { tagId: 999 } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { message: 'Tag not found' } });
    });

    it('attaching an already-attached tag is a no-op', async () => {
      const app = buildTestApp();
      const record = await create(app);
      const created = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'VIP' } });
      const tagId = created.json().tags[0].id;

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { tagId } });

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toHaveLength(1);
    });

    it(`returns 404 "${notFoundMessage}" for an unknown ${label}`, async () => {
      const app = buildTestApp();

      const response = await app.inject({ method: 'POST', url: `/api/${kind}/999/tags`, payload: { name: 'VIP' } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { message: notFoundMessage } });
    });
  });

  describe(`DELETE /api/${kind}/:id/tags/:tagId`, () => {
    it("removes only that record's attachment (tag and its other attachments survive)", async () => {
      const app = buildTestApp();
      const record = await create(app);
      const other = await create(app);
      const created = await app.inject({ method: 'POST', url: `/api/${kind}/${record.id}/tags`, payload: { name: 'VIP' } });
      const tagId = created.json().tags[0].id;
      await app.inject({ method: 'POST', url: `/api/${kind}/${other.id}/tags`, payload: { tagId } });

      const response = await app.inject({ method: 'DELETE', url: `/api/${kind}/${record.id}/tags/${tagId}` });

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toEqual([]);

      const otherResponse = await app.inject({ method: 'GET', url: `/api/${kind}/${other.id}` });
      expect(otherResponse.json().tags).toHaveLength(1);

      const allTags = await app.inject({ method: 'GET', url: '/api/tags' });
      expect(allTags.json()).toHaveLength(1);
    });

    it('detaching a tag that is not attached is a no-op returning the current list', async () => {
      const app = buildTestApp();
      const record = await create(app);
      const other = await create(app);
      const created = await app.inject({ method: 'POST', url: `/api/${kind}/${other.id}/tags`, payload: { name: 'VIP' } });
      const tagId = created.json().tags[0].id;

      const response = await app.inject({ method: 'DELETE', url: `/api/${kind}/${record.id}/tags/${tagId}` });

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toEqual([]);
    });

    it(`returns 404 "${notFoundMessage}" for an unknown ${label}`, async () => {
      const app = buildTestApp();

      const response = await app.inject({ method: 'DELETE', url: `/api/${kind}/999/tags/1` });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { message: notFoundMessage } });
    });
  });
}

describe('tags included on people and task reads, name-ordered case-insensitively', () => {
  it('GET /api/people, GET /api/people/:id, and GET /api/tasks/:id each include tags: Tag[] ordered by name case-insensitively', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const person = await createPerson(app, 'Sam', 'Rivera');

    await app.inject({ method: 'POST', url: `/api/people/${person.id}/tags`, payload: { name: 'vip' } });
    await app.inject({ method: 'POST', url: `/api/people/${person.id}/tags`, payload: { name: 'Alpha' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { name: 'vip' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { name: 'Alpha' } });

    const peopleList = await app.inject({ method: 'GET', url: '/api/people' });
    const personRow = (peopleList.json() as { id: number; tags: { name: string }[] }[]).find((p) => p.id === person.id)!;
    expect(personRow.tags.map((t) => t.name)).toEqual(['Alpha', 'vip']);

    const personDetail = await app.inject({ method: 'GET', url: `/api/people/${person.id}` });
    expect(personDetail.json().tags.map((t: { name: string }) => t.name)).toEqual(['Alpha', 'vip']);

    const taskDetail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(taskDetail.json().tags.map((t: { name: string }) => t.name)).toEqual(['Alpha', 'vip']);
  });
});
