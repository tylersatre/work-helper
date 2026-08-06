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

describe('POST /api/tasks/:id/notes', () => {
  it('adds a note that then appears in the task detail (add -> read round-trip)', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/notes`,
      payload: { text: 'Waiting on budget numbers' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ taskId: task.id, text: 'Waiting on budget numbers', source: 'ui' });
    expect(typeof body.id).toBe('number');
    expect(typeof body.createdAt).toBe('number');

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0]).toMatchObject({ text: 'Waiting on budget numbers', source: 'ui' });
  });

  it('returns notes newest first by createdAt, with an id tiebreak for identical timestamps', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: 'First note' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: 'Second note' } });

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    const texts = detail.json().notes.map((n: { text: string }) => n.text);
    expect(texts).toEqual(['Second note', 'First note']);
  });

  it('preserves raw text byte-for-byte, including leading indentation and internal newlines', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const raw = '    indented code\nline two\n\nline four';

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/notes`,
      payload: { text: raw },
    });

    expect(response.json().text).toBe(raw);
    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes[0].text).toBe(raw);
  });

  it('rejects empty text with 400 and persists nothing', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: '' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: 'Note text is required' } });
    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toEqual([]);
  });

  it('rejects whitespace-only text (spaces, tabs, newlines) with 400 and persists nothing', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    for (const whitespace of ['   ', '\t\t', '\n\n']) {
      const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: whitespace } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { message: 'Note text is required' } });
    }

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toEqual([]);
  });

  it('returns 404 for an unknown task', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/api/tasks/999/notes', payload: { text: 'Hello' } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });
});

describe('DELETE /api/tasks/:id/notes/:noteId', () => {
  it('removes only the targeted note, leaving the sibling note intact', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const first = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: 'First note' } });
    const second = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: 'Second note' } });

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}/notes/${first.json().id}` });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0].id).toBe(second.json().id);
  });

  it('returns 404 "Task not found" for an unknown task', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'DELETE', url: '/api/tasks/999/notes/1' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });

  it('returns 404 "Note not found" for an unknown note id', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}/notes/999` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Note not found' } });
  });

  it('returns 404 "Note not found" for a note id belonging to a different task', async () => {
    const app = buildTestApp();
    const taskA = await createTask(app, 'Task A');
    const taskB = await createTask(app, 'Task B');
    const noteOnA = await app.inject({ method: 'POST', url: `/api/tasks/${taskA.id}/notes`, payload: { text: 'On A' } });

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${taskB.id}/notes/${noteOnA.json().id}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Note not found' } });
  });

  it('exposes no PUT or PATCH route for notes', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');
    const note = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: 'First note' } });

    const putResponse = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${task.id}/notes/${note.json().id}`,
      payload: { text: 'Edited' },
    });
    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}/notes/${note.json().id}`,
      payload: { text: 'Edited' },
    });

    expect(putResponse.statusCode).toBe(404);
    expect(patchResponse.statusCode).toBe(404);
  });
});

describe('source uniformity (US5)', () => {
  it('a note seeded with source "mcp" is returned by GET and deletable via DELETE exactly like a "ui" note', async () => {
    const { db, sqlite } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const task = await createTask(app, 'Follow up with Sam');
    sqlite
      .prepare('INSERT INTO task_notes (task_id, text, source, created_at) VALUES (?, ?, ?, ?)')
      .run(task.id, 'Synced from assistant', 'mcp', Date.now());

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0]).toMatchObject({ text: 'Synced from assistant', source: 'mcp' });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.id}/notes/${detail.json().notes[0].id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  it('no API write path accepts a client-supplied source', async () => {
    const app = buildTestApp();
    const task = await createTask(app, 'Follow up with Sam');

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/notes`,
      payload: { text: 'Smuggled', source: 'mcp' },
    });

    expect(response.json().source).toBe('ui');
  });
});
