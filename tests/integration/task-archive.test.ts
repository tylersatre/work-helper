import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailConversations } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { linkConversationToTask } from '../../src/server/services/task-conversations.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp(): { app: FastifyInstance; db: BetterSQLite3Database<typeof schema> } {
  const { db } = createDb(':memory:');
  const app = buildApp({ db, lanes: LANES });
  return { app, db };
}

async function createTask(app: FastifyInstance, title: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

async function addNote(app: FastifyInstance, taskId: number, text: string): Promise<void> {
  await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/notes`, payload: { text } });
}

async function boardTitlesInLane(app: FastifyInstance, laneName: string): Promise<{ title: string; archived: boolean }[]> {
  const board = await app.inject({ method: 'GET', url: '/api/board' });
  const lane = (board.json().lanes as { name: string; tasks: { title: string; archived: boolean }[] }[]).find((l) => l.name === laneName)!;
  return lane.tasks.map((t) => ({ title: t.title, archived: t.archived }));
}

describe('POST /api/tasks/:id/archive', () => {
  it('archives an active task, returning archived: true with lane/position/notes/links untouched (FR-003, FR-008)', async () => {
    const { app } = buildTestApp();
    const task = await createTask(app, 'Write proposal');
    await app.inject({ method: 'PUT', url: `/api/tasks/${task.id}/placement`, payload: { lane: 'In Progress', index: 0 } });
    await addNote(app, task.id, 'Kickoff call went well');

    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/archive` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ id: task.id, title: 'Write proposal', lane: 'In Progress', position: 0, archived: true });

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0].text).toBe('Kickoff call went well');
  });

  it('archiving an already-archived task is an idempotent no-op with no field changes (edge case, research.md R4)', async () => {
    const { app } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/archive` });

    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/archive` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ id: task.id, archived: true, position: 0 });
  });

  it('returns 404 "Task not found" for a non-existent id', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/tasks/999999/archive' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });
});

describe('POST /api/tasks/:id/unarchive', () => {
  it('unarchiving an archived task returns archived: false with position recomputed to the bottom of the whole lane (data-model.md, research.md R3)', async () => {
    const { app } = buildTestApp();
    const first = await createTask(app, 'A');
    await createTask(app, 'B');
    await app.inject({ method: 'POST', url: `/api/tasks/${first.id}/archive` });

    const response = await app.inject({ method: 'POST', url: `/api/tasks/${first.id}/unarchive` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.archived).toBe(false);
    // Lane-wide max ('B' at position 1, 'A' still occupying its stale position 0 pre-update) + 1 = 2.
    expect(body.position).toBe(2);
  });

  it('unarchiving an already-active task is an idempotent no-op that does not move position (research.md R4)', async () => {
    const { app } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const before = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    const beforePosition = before.json().position;

    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/unarchive` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.archived).toBe(false);
    expect(body.position).toBe(beforePosition);
  });

  it('returns 404 "Task not found" for a non-existent id', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/tasks/999999/unarchive' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });
});

describe('GET /api/board includes archived cards, flagged', () => {
  it('a lane with both an archived and an active task returns both, each correctly flagged', async () => {
    const { app } = buildTestApp();
    await createTask(app, 'Follow up with Sam');
    const archived = await createTask(app, 'Draft goals');
    await app.inject({ method: 'POST', url: `/api/tasks/${archived.id}/archive` });

    const titles = await boardTitlesInLane(app, 'To Do');

    expect(titles).toEqual(
      expect.arrayContaining([
        { title: 'Follow up with Sam', archived: false },
        { title: 'Draft goals', archived: true },
      ]),
    );
  });
});

describe('Archiving and unarchiving preserve links (FR-008, SC-003)', () => {
  it('a linked person, company, and email conversation all survive an archive/unarchive round trip', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const person = await app.inject({ method: 'POST', url: '/api/people', payload: { firstName: 'Sam', lastName: 'Rivera' } });
    const personId = person.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/people`, payload: { personId } });

    const company = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: 'Acme Corp' } });
    const companyId = company.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId } });

    const [conversation] = db.insert(emailConversations).values({ graphConversationId: 'conv-1', createdAt: Date.now() }).returning().all();
    linkConversationToTask(db, task.id, conversation!.id);

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/archive` });
    const afterArchive = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(afterArchive.json().people.map((p: { id: number }) => p.id)).toEqual([personId]);
    expect(afterArchive.json().companies.map((c: { id: number }) => c.id)).toEqual([companyId]);
    expect(afterArchive.json().conversations.map((c: { id: number }) => c.id)).toEqual([conversation!.id]);

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/unarchive` });
    const afterUnarchive = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(afterUnarchive.json().people.map((p: { id: number }) => p.id)).toEqual([personId]);
    expect(afterUnarchive.json().companies.map((c: { id: number }) => c.id)).toEqual([companyId]);
    expect(afterUnarchive.json().conversations.map((c: { id: number }) => c.id)).toEqual([conversation!.id]);
  });
});
