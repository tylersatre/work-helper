import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { taskNotes, tasks } from '../../src/server/db/schema.js';
import { createTask, deleteNoteById, InvalidLaneError, updateTask } from '../../src/server/services/tasks.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function seed(db: ReturnType<typeof createDb>['db'], rows: { title: string; lane: string; position: number }[]) {
  return rows.map((row) => db.insert(tasks).values({ ...row, createdAt: Date.now() }).returning().all()[0]!);
}

async function laneTitles(app: ReturnType<typeof buildApp>, laneName: string): Promise<string[]> {
  const board = await app.inject({ method: 'GET', url: '/api/board' });
  const lane = board.json().lanes.find((l: { name: string }) => l.name === laneName);
  return lane.tasks.map((t: { title: string }) => t.title);
}

describe('POST /api/tasks', () => {
  it('returns 201 with the created task for a valid title', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: '  Follow up with Sam  ' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ title: 'Follow up with Sam', lane: 'To Do', position: 0 });
    expect(typeof body.id).toBe('number');
    expect(typeof body.createdAt).toBe('number');
  });

  it('appends successive tasks at the bottom of the first configured lane (position 0, 1, 2, ...)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const first = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'First' } });
    const second = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Second' } });
    const third = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Third' } });

    expect(first.json().position).toBe(0);
    expect(second.json().position).toBe(1);
    expect(third.json().position).toBe(2);

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const toDo = board.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');
    expect(toDo.tasks.map((t: { title: string }) => t.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('creates distinct tasks for duplicate titles', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const first = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Same title' } });
    const second = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Same title' } });

    expect(first.json().id).not.toBe(second.json().id);
  });

  it('ignores a client-supplied lane or id', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Sneaky', lane: 'Done', id: 999 },
    });

    const body = response.json();
    expect(body.lane).toBe('To Do');
    expect(body.id).not.toBe(999);
  });

  it('rejects a missing title with 400 and persists nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Title is required' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('rejects an empty title with 400 and persists nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: '' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Title is required' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('rejects a whitespace-only title with 400 and persists nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: '   ' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Title is required' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('creates the task and its first note atomically when a non-blank note is supplied', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Prep board deck', note: 'Kickoff call went well' },
    });

    expect(response.statusCode).toBe(201);
    const task = response.json();

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0]).toMatchObject({ text: 'Kickoff call went well', source: 'ui', createdAt: task.createdAt });
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['blank-after-trim', '   '],
  ])('creates a task with zero notes when the note is %s', async (_label, note) => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Book flights', note } });

    expect(response.statusCode).toBe(201);
    const task = response.json();

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toEqual([]);
  });

  it('persists no task and no note when the title is blank and a note is supplied', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: '   ', note: 'Kickoff call went well' },
    });

    expect(response.statusCode).toBe(400);

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('creates a task with all four new fields set when provided in the body', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Book venue', dueDate: '2026-09-05', priority: 'High', effort: 'L', description: '**Urgent**' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ dueDate: '2026-09-05', priority: 'High', effort: 'L', description: '**Urgent**' });
  });

  it('creates a task with all four new fields null when omitted from the body', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Book venue' } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ dueDate: null, priority: null, effort: null, description: null });
  });

  it('rejects an invalid priority value with 400 and creates no task', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Book venue', priority: 'Critical' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Invalid priority' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });

  it('rejects an invalid effort value with 400 and creates no task', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Book venue', effort: 'XXL' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Invalid effort' } });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const totalTasks = board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
    expect(totalTasks).toBe(0);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('changes only the fields present in the body, leaving omitted ones untouched, returning the full updated row', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);
    db.update(tasks).set({ priority: 'High' }).where(eq(tasks.id, task!.id)).run();

    const response = await app.inject({ method: 'PATCH', url: `/api/tasks/${task!.id}`, payload: { dueDate: '2026-09-05' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dueDate: '2026-09-05', priority: 'High' });
  });

  it('clears a field to null when the body sends that key as null', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);
    db.update(tasks).set({ dueDate: '2026-09-05' }).where(eq(tasks.id, task!.id)).run();

    const response = await app.inject({ method: 'PATCH', url: `/api/tasks/${task!.id}`, payload: { dueDate: null } });

    expect(response.statusCode).toBe(200);
    expect(response.json().dueDate).toBeNull();
  });

  it('is a no-op 200 returning the current row unchanged when the body has none of the four keys', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const response = await app.inject({ method: 'PATCH', url: `/api/tasks/${task!.id}`, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ title: 'Book venue', dueDate: null, priority: null, effort: null, description: null });
  });

  it('returns 404 for an unknown task id', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'PATCH', url: '/api/tasks/999', payload: { dueDate: '2026-09-05' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });

  it('rejects an invalid priority value with 400, leaving the task unchanged', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const response = await app.inject({ method: 'PATCH', url: `/api/tasks/${task!.id}`, payload: { priority: 'Critical' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Invalid priority' } });

    const check = await app.inject({ method: 'GET', url: `/api/tasks/${task!.id}` });
    expect(check.json().priority).toBeNull();
  });

  it('rejects an invalid effort value with 400, leaving the task unchanged', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const response = await app.inject({ method: 'PATCH', url: `/api/tasks/${task!.id}`, payload: { effort: 'XXL' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Invalid effort' } });

    const check = await app.inject({ method: 'GET', url: `/api/tasks/${task!.id}` });
    expect(check.json().effort).toBeNull();
  });
});

describe('PUT /api/tasks/:id/placement', () => {
  it('moves a task to another (empty) lane, removing it from the source (FR-001/FR-006)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [a] = seed(db, [{ title: 'A', lane: 'To Do', position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${a!.id}/placement`,
      payload: { lane: 'In Progress', index: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: a!.id, title: 'A', lane: 'In Progress', position: 0 });
    expect(await laneTitles(app, 'To Do')).toEqual([]);
    expect(await laneTitles(app, 'In Progress')).toEqual(['A']);
  });

  it.each([
    ['To Do', 'Done'],
    ['Done', 'To Do'],
  ])('moves a task from %s to %s (FR-002: any lane pair, either direction)', async (from, to) => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [a] = seed(db, [{ title: 'A', lane: from, position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${a!.id}/placement`,
      payload: { lane: to, index: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, from)).toEqual([]);
    expect(await laneTitles(app, to)).toEqual(['A']);
  });

  it('splices a moved card at the top of a populated destination lane (FR-003)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [x0, x1] = seed(db, [
      { title: 'X0', lane: 'In Progress', position: 0 },
      { title: 'X1', lane: 'In Progress', position: 1 },
    ]);
    const [d] = seed(db, [{ title: 'D', lane: 'To Do', position: 0 }]);
    void x0;
    void x1;

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${d!.id}/placement`,
      payload: { lane: 'In Progress', index: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'In Progress')).toEqual(['D', 'X0', 'X1']);
  });

  it('splices a moved card between two cards of a populated destination lane (FR-003)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    seed(db, [
      { title: 'X0', lane: 'In Progress', position: 0 },
      { title: 'X1', lane: 'In Progress', position: 1 },
    ]);
    const [d] = seed(db, [{ title: 'D', lane: 'To Do', position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${d!.id}/placement`,
      payload: { lane: 'In Progress', index: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'In Progress')).toEqual(['X0', 'D', 'X1']);
  });

  it('splices a moved card at the bottom of a populated destination lane (FR-003)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    seed(db, [
      { title: 'X0', lane: 'In Progress', position: 0 },
      { title: 'X1', lane: 'In Progress', position: 1 },
    ]);
    const [d] = seed(db, [{ title: 'D', lane: 'To Do', position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${d!.id}/placement`,
      payload: { lane: 'In Progress', index: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'In Progress')).toEqual(['X0', 'X1', 'D']);
  });

  it('reorders a lane upward: moving the bottom card to index 0 lands it on top (FR-004)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [, , c] = seed(db, [
      { title: 'A', lane: 'To Do', position: 0 },
      { title: 'B', lane: 'To Do', position: 1 },
      { title: 'C', lane: 'To Do', position: 2 },
    ]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${c!.id}/placement`,
      payload: { lane: 'To Do', index: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'To Do')).toEqual(['C', 'A', 'B']);
  });

  it('reorders a lane downward: moving the top card of a 3-card lane to index 1 lands it between the other two ([A,B,C] -> [B,A,C]) (FR-004)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [a] = seed(db, [
      { title: 'A', lane: 'To Do', position: 0 },
      { title: 'B', lane: 'To Do', position: 1 },
      { title: 'C', lane: 'To Do', position: 2 },
    ]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${a!.id}/placement`,
      payload: { lane: 'To Do', index: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'To Do')).toEqual(['B', 'A', 'C']);
  });

  it('clamps an index past the end of the destination lane to append', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    seed(db, [
      { title: 'X0', lane: 'In Progress', position: 0 },
      { title: 'X1', lane: 'In Progress', position: 1 },
    ]);
    const [d] = seed(db, [{ title: 'D', lane: 'To Do', position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${d!.id}/placement`,
      payload: { lane: 'In Progress', index: 999 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'In Progress')).toEqual(['X0', 'X1', 'D']);
  });

  it('dropping a card onto its own current slot is a 200 no-op leaving order identical', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [, b] = seed(db, [
      { title: 'A', lane: 'To Do', position: 0 },
      { title: 'B', lane: 'To Do', position: 1 },
    ]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${b!.id}/placement`,
      payload: { lane: 'To Do', index: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(await laneTitles(app, 'To Do')).toEqual(['A', 'B']);
  });

  it('returns 404 for an unknown task id', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/tasks/999999/placement',
      payload: { lane: 'To Do', index: 0 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });

  it('returns 400 for a lane not in the configured list', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [a] = seed(db, [{ title: 'A', lane: 'To Do', position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${a!.id}/placement`,
      payload: { lane: 'Nonexistent', index: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Unknown lane' } });
  });

  it.each([
    ['missing', {}],
    ['negative', { index: -1 }],
    ['non-integer', { index: 1.5 }],
  ])('returns 400 for an invalid index (%s)', async (_label, extra) => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [a] = seed(db, [{ title: 'A', lane: 'To Do', position: 0 }]);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${a!.id}/placement`,
      payload: { lane: 'To Do', ...extra },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Invalid index' } });
  });
});

describe('createTask lane targeting (US3)', () => {
  it('creates the task at the bottom of an explicit valid lane (max position + 1)', () => {
    const { db } = createDb(':memory:');
    seed(db, [
      { title: 'Chase invoice', lane: 'Waiting', position: 0 },
      { title: 'Await contract', lane: 'Waiting', position: 1 },
    ]);

    const created = createTask(db, LANES, 'Confirm venue hold', undefined, 'mcp', 'Waiting');

    expect(created).toMatchObject({ title: 'Confirm venue hold', lane: 'Waiting', position: 2 });
  });

  it('creates the task at position 0 of an explicit valid empty lane', () => {
    const { db } = createDb(':memory:');

    const created = createTask(db, LANES, 'Ping vendor', undefined, 'mcp', 'Done');

    expect(created).toMatchObject({ title: 'Ping vendor', lane: 'Done', position: 0 });
  });

  it('lands at the bottom of lanes[0] when no lane is given (unchanged from today, regression pin)', () => {
    const { db } = createDb(':memory:');

    const created = createTask(db, LANES, 'Send invites');

    expect(created).toMatchObject({ title: 'Send invites', lane: LANES[0], position: 0 });
  });

  it('throws InvalidLaneError for an unconfigured lane and writes zero rows', () => {
    const { db } = createDb(':memory:');
    seed(db, [{ title: 'Existing', lane: 'To Do', position: 0 }]);
    const before = db.select().from(tasks).all().length;

    expect(() => createTask(db, LANES, 'Book venue', undefined, 'mcp', 'Doing')).toThrow(InvalidLaneError);

    const after = db.select().from(tasks).all().length;
    expect(after).toBe(before);
  });
});

describe('createTask fields (030-task-fields)', () => {
  it('stores all four fields when set', () => {
    const { db } = createDb(':memory:');

    const created = createTask(db, LANES, 'Book venue', undefined, 'ui', undefined, {
      dueDate: '2026-09-05',
      priority: 'High',
      effort: 'L',
      description: '**Urgent**',
    });

    expect(created).toMatchObject({ dueDate: '2026-09-05', priority: 'High', effort: 'L', description: '**Urgent**' });
  });

  it('leaves all four fields null when rawFields is omitted', () => {
    const { db } = createDb(':memory:');

    const created = createTask(db, LANES, 'Book venue');

    expect(created).toMatchObject({ dueDate: null, priority: null, effort: null, description: null });
  });

  it.each([
    ['dueDate', ''],
    ['dueDate', '   '],
    ['priority', ''],
    ['priority', '   '],
    ['effort', ''],
    ['effort', '   '],
    ['description', ''],
    ['description', '   '],
  ])('leaves %s null when blank/whitespace', (key, value) => {
    const { db } = createDb(':memory:');

    const created = createTask(db, LANES, 'Book venue', undefined, 'ui', undefined, { [key]: value });

    expect((created as Record<string, unknown>)[key]).toBeNull();
  });

  it('throws on an invalid priority value', () => {
    const { db } = createDb(':memory:');

    expect(() => createTask(db, LANES, 'Book venue', undefined, 'ui', undefined, { priority: 'Critical' })).toThrow();
  });

  it('throws on an invalid effort value', () => {
    const { db } = createDb(':memory:');

    expect(() => createTask(db, LANES, 'Book venue', undefined, 'ui', undefined, { effort: 'XXL' })).toThrow();
  });
});

describe('deleteNoteById (service)', () => {
  function seedNotes(db: ReturnType<typeof createDb>['db'], taskId: number, texts: string[]) {
    return texts.map((text, i) => db.insert(taskNotes).values({ taskId, text, source: 'ui', createdAt: i }).returning().all()[0]!);
  }

  it('deletes the note and returns { ok: true, taskId }, leaving the task\'s other notes untouched', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Draft Q3 goals', lane: 'To Do', position: 0 }]);
    const [first, second] = seedNotes(db, task!.id, ['First note', 'Second note']);

    const result = deleteNoteById(db, second!.id);

    expect(result).toEqual({ ok: true, taskId: task!.id });
    const remaining = db.select().from(taskNotes).where(eq(taskNotes.taskId, task!.id)).all();
    expect(remaining.map((n) => n.id)).toEqual([first!.id]);
  });

  it('returns note-not-found for an unknown note id', () => {
    const { db } = createDb(':memory:');

    const result = deleteNoteById(db, 999);

    expect(result).toEqual({ ok: false, error: 'note-not-found' });
  });
});

describe('updateTask (service)', () => {
  it('updates the title and returns { ok: true, task } with the new title', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue (due Aug 20)', lane: 'To Do', position: 0 }]);

    const result = updateTask(db, task!.id, { title: 'Book venue (due Sept 5)' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.title).toBe('Book venue (due Sept 5)');
  });

  it('rejects an empty title with invalid-title', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const result = updateTask(db, task!.id, { title: '' });

    expect(result).toEqual({ ok: false, error: 'invalid-title' });
  });

  it('rejects a whitespace-only title with invalid-title', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const result = updateTask(db, task!.id, { title: '   ' });

    expect(result).toEqual({ ok: false, error: 'invalid-title' });
  });

  it('returns task-not-found for an unknown task id', () => {
    const { db } = createDb(':memory:');

    const result = updateTask(db, 999, { title: 'New title' });

    expect(result).toEqual({ ok: false, error: 'task-not-found' });
  });

  it('sets each of the four new fields fresh on a task with none set', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const result = updateTask(db, task!.id, { dueDate: '2026-09-05', priority: 'High', effort: 'L', description: 'Details' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task).toMatchObject({ dueDate: '2026-09-05', priority: 'High', effort: 'L', description: 'Details' });
  });

  it('changes an already-set field to a new value', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);
    updateTask(db, task!.id, { priority: 'Low' });

    const result = updateTask(db, task!.id, { priority: 'Urgent' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.priority).toBe('Urgent');
  });

  it('clears an already-set field via null', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);
    updateTask(db, task!.id, { dueDate: '2026-09-05' });

    const result = updateTask(db, task!.id, { dueDate: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.dueDate).toBeNull();
  });

  it('leaves a field completely unchanged when its key is omitted from the input', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);
    updateTask(db, task!.id, { dueDate: '2026-09-05', priority: 'High' });

    const result = updateTask(db, task!.id, { effort: 'L' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task).toMatchObject({ dueDate: '2026-09-05', priority: 'High', effort: 'L' });
  });

  it('changes all four fields together in one call', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const result = updateTask(db, task!.id, { dueDate: '2026-09-10', priority: 'Urgent', effort: 'XL', description: 'Updated scope' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task).toMatchObject({ dueDate: '2026-09-10', priority: 'Urgent', effort: 'XL', description: 'Updated scope' });
  });

  it('rejects the entire call with no field changed when title is invalid alongside otherwise-valid field values', () => {
    const { db } = createDb(':memory:');
    const [task] = seed(db, [{ title: 'Book venue', lane: 'To Do', position: 0 }]);

    const result = updateTask(db, task!.id, { title: '   ', dueDate: '2026-09-05', priority: 'High' });

    expect(result).toEqual({ ok: false, error: 'invalid-title' });
    const [unchanged] = db.select().from(tasks).where(eq(tasks.id, task!.id)).all();
    expect(unchanged).toMatchObject({ title: 'Book venue', dueDate: null, priority: null });
  });
});
