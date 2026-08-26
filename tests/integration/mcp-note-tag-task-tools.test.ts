import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';

let app: FastifyInstance;
let db: BetterSQLite3Database<typeof schema>;
let client: Client;
let serverUrl: string;
let stub: StubIdentityProvider;

async function callTool(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

async function createTaskViaApi(title: string): Promise<{ id: number; title: string }> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

async function createPersonViaApi(firstName: string, lastName: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload: { firstName, lastName } });
  return response.json();
}

async function addNoteViaApi(taskId: number, text: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/notes`, payload: { text } });
  return response.json();
}

async function createTagViaApi(name: string): Promise<{ id: number; name: string; color: string }> {
  const response = await app.inject({ method: 'POST', url: '/api/tags', payload: { name } });
  return response.json();
}

async function getTaskViaApi(taskId: number) {
  const response = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}` });
  return response.json();
}

async function getPersonViaApi(personId: number) {
  const response = await app.inject({ method: 'GET', url: `/api/people/${personId}` });
  return response.json();
}

async function listTagsViaApi(): Promise<{ id: number; name: string; color: string }[]> {
  const response = await app.inject({ method: 'GET', url: '/api/tags' });
  return response.json();
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({ db, lanes: LANES, mcpTokenSecret: MCP_TOKEN_SECRET, identityVerifier: createIdentityVerifier(stub.url) });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;

  const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub.mint('tyler') });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('US1: delete-note', () => {
  it('deletes the note by id, leaving the task\'s other notes untouched (US1-AS1)', async () => {
    const task = await createTaskViaApi('Draft Q3 goals');
    const first = await addNoteViaApi(task.id, 'First note');
    const second = await addNoteViaApi(task.id, 'Second note');

    const result = await callTool('delete-note', { noteId: second.id });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ deleted: true, taskId: task.id });

    const detail = await getTaskViaApi(task.id);
    expect(detail.notes.map((n: { id: number }) => n.id)).toEqual([first.id]);
  });

  it('fails with a note-not-found error for an unknown note id, changing nothing (US1-AS2)', async () => {
    const task = await createTaskViaApi('Draft Q3 goals');
    const first = await addNoteViaApi(task.id, 'First note');

    const result = await callTool('delete-note', { noteId: 999999 });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Note 999999 not found' }]);

    const detail = await getTaskViaApi(task.id);
    expect(detail.notes.map((n: { id: number }) => n.id)).toEqual([first.id]);
  });
});

describe('US4: update-task', () => {
  it('renames a task, reflected in get-task and the board-listing tool (US4-AS1)', async () => {
    const task = await createTaskViaApi('Book venue (due Aug 20)');

    const result = await callTool('update-task', { taskId: task.id, title: 'Book venue (due Sept 5)' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: task.id, title: 'Book venue (due Sept 5)' });

    const getTaskResult = await callTool('get-task', { taskId: task.id });
    expect((getTaskResult.structuredContent as { title: string }).title).toBe('Book venue (due Sept 5)');

    const boardResult = await callTool('list-board');
    const { lanes } = boardResult.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    const toDo = lanes.find((l) => l.name === 'To Do')!;
    expect(toDo.tasks.map((t) => t.title)).toEqual(['Book venue (due Sept 5)']);
  });

  it('rejects an empty title, a whitespace-only title, and an unknown task id, leaving the task unchanged (US4-AS2)', async () => {
    const task = await createTaskViaApi('Book venue');

    const empty = await callTool('update-task', { taskId: task.id, title: '' });
    expect(empty.isError).toBe(true);
    expect(empty.content).toEqual([{ type: 'text', text: 'Title is required' }]);

    const whitespace = await callTool('update-task', { taskId: task.id, title: '   ' });
    expect(whitespace.isError).toBe(true);
    expect(whitespace.content).toEqual([{ type: 'text', text: 'Title is required' }]);

    const unknown = await callTool('update-task', { taskId: 999999, title: 'New title' });
    expect(unknown.isError).toBe(true);
    expect(unknown.content).toEqual([{ type: 'text', text: 'Task 999999 not found' }]);

    const detail = await getTaskViaApi(task.id);
    expect(detail.title).toBe('Book venue');
  });
});

describe('US3 (030-task-fields): create-task and update-task field parity', () => {
  it('create-task with all four fields set creates a task carrying exactly those values', async () => {
    const result = await callTool('create-task', {
      title: 'Ship report',
      dueDate: '2026-09-10',
      priority: 'Medium',
      effort: 'M',
      description: 'Quarterly export',
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ dueDate: '2026-09-10', priority: 'Medium', effort: 'M', description: 'Quarterly export' });

    const taskId = (result.structuredContent as { id: number }).id;
    const detail = await getTaskViaApi(taskId);
    expect(detail).toMatchObject({ dueDate: '2026-09-10', priority: 'Medium', effort: 'M', description: 'Quarterly export' });
  });

  it('create-task with the four fields omitted creates a task with all four null', async () => {
    const result = await callTool('create-task', { title: 'Draft budget' });

    expect(result.structuredContent).toMatchObject({ dueDate: null, priority: null, effort: null, description: null });
  });

  it('create-task with an invalid priority is rejected by schema validation before the handler runs, creating no task', async () => {
    const result = await callTool('create-task', { title: 'Bad priority', priority: 'Critical' });
    expect(result.isError).toBe(true);

    const board = await callTool('list-board');
    const { lanes } = board.structuredContent as { lanes: { tasks: unknown[] }[] };
    expect(lanes.reduce((sum, lane) => sum + lane.tasks.length, 0)).toBe(0);
  });

  it('create-task with an invalid effort is rejected by schema validation before the handler runs, creating no task', async () => {
    const result = await callTool('create-task', { title: 'Bad effort', effort: 'XXL' });
    expect(result.isError).toBe(true);

    const board = await callTool('list-board');
    const { lanes } = board.structuredContent as { lanes: { tasks: unknown[] }[] };
    expect(lanes.reduce((sum, lane) => sum + lane.tasks.length, 0)).toBe(0);
  });

  it('update-task changes all four fields in one call while leaving title untouched', async () => {
    const task = await createTaskViaApi('Book venue');

    const result = await callTool('update-task', {
      taskId: task.id,
      priority: 'Urgent',
      effort: 'XL',
      dueDate: '2026-09-10',
      description: 'Updated scope',
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      title: 'Book venue',
      priority: 'Urgent',
      effort: 'XL',
      dueDate: '2026-09-10',
      description: 'Updated scope',
    });
  });

  it('a second update-task call clearing only dueDate leaves the other three fields (and title) untouched', async () => {
    const task = await createTaskViaApi('Book venue');
    await callTool('update-task', { taskId: task.id, priority: 'Urgent', effort: 'XL', dueDate: '2026-09-10', description: 'Updated scope' });

    const result = await callTool('update-task', { taskId: task.id, dueDate: null });

    expect(result.structuredContent).toMatchObject({
      title: 'Book venue',
      priority: 'Urgent',
      effort: 'XL',
      dueDate: null,
      description: 'Updated scope',
    });
  });

  it('update-task with an invalid priority is rejected, leaving the task (and everything else) unchanged', async () => {
    const task = await createTaskViaApi('Book venue');

    const result = await callTool('update-task', { taskId: task.id, priority: 'Critical' });
    expect(result.isError).toBe(true);

    const detail = await getTaskViaApi(task.id);
    expect(detail).toMatchObject({ title: 'Book venue', priority: null });
  });

  it('update-task with an invalid effort is rejected, leaving the task (and everything else) unchanged', async () => {
    const task = await createTaskViaApi('Book venue');

    const result = await callTool('update-task', { taskId: task.id, effort: 'XXL' });
    expect(result.isError).toBe(true);

    const detail = await getTaskViaApi(task.id);
    expect(detail).toMatchObject({ title: 'Book venue', effort: null });
  });

  it('the existing rename-only behavior still works with title now optional', async () => {
    const task = await createTaskViaApi('Book venue');

    const result = await callTool('update-task', { taskId: task.id, title: 'New name' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ title: 'New name' });
  });
});

describe('US2: create-tag / rename-tag / recolor-tag / delete-tag', () => {
  it('creates with an explicit color and rejects a case-insensitive duplicate name (US2-AS1)', async () => {
    const created = await callTool('create-tag', { name: 'Renewal', color: '#F59E0B' });
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent).toEqual({ id: expect.any(Number), name: 'Renewal', color: '#F59E0B' });

    const tags = await listTagsViaApi();
    expect(tags).toEqual([{ id: (created.structuredContent as { id: number }).id, name: 'Renewal', color: '#F59E0B', peopleCount: 0, tasksCount: 0 }]);

    const duplicate = await callTool('create-tag', { name: 'renewal' });
    expect(duplicate.isError).toBe(true);
    expect(duplicate.content).toEqual([{ type: 'text', text: 'That tag name is already in use' }]);
    expect(await listTagsViaApi()).toHaveLength(1);
  });

  it('creates with an auto-assigned color when omitted and rejects an empty name (US2-AS2)', async () => {
    const created = await callTool('create-tag', { name: 'Overdue' });
    expect(created.isError).toBeFalsy();
    const content = created.structuredContent as { id: number; name: string; color: string };
    expect(content.name).toBe('Overdue');
    expect(content.color).toMatch(/^#[0-9a-fA-F]{6}$/);

    const empty = await callTool('create-tag', { name: '   ' });
    expect(empty.isError).toBe(true);
    expect(empty.content).toEqual([{ type: 'text', text: 'A name is required' }]);
    expect(await listTagsViaApi()).toHaveLength(1);
  });

  it('rejects a non-hex color on create-tag', async () => {
    const result = await callTool('create-tag', { name: 'Renewal', color: 'blue' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'A valid color is required' }]);
    expect(await listTagsViaApi()).toEqual([]);
  });

  it('renames by id, reflected in list-tags and every attached record, and rejects an empty new name (US2-AS3)', async () => {
    const task = await createTaskViaApi('Book venue');
    const person = await createPersonViaApi('Jordan', 'Smith');
    const tag = await createTagViaApi('Renewal');
    await callTool('attach-tag', { tagId: tag.id, taskId: task.id });
    await callTool('attach-tag', { tagId: tag.id, personId: person.id });

    const renamed = await callTool('rename-tag', { tagId: tag.id, name: 'Contract renewal' });
    expect(renamed.isError).toBeFalsy();
    expect(renamed.structuredContent).toMatchObject({ id: tag.id, name: 'Contract renewal' });

    expect((await listTagsViaApi()).map((t) => t.name)).toEqual(['Contract renewal']);
    const taskDetail = await getTaskViaApi(task.id);
    expect(taskDetail.tags.map((t: { name: string }) => t.name)).toEqual(['Contract renewal']);
    const personDetail = await getPersonViaApi(person.id);
    expect(personDetail.tags.map((t: { name: string }) => t.name)).toEqual(['Contract renewal']);

    const failed = await callTool('rename-tag', { tagId: tag.id, name: '' });
    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual([{ type: 'text', text: 'A name is required' }]);
    expect((await listTagsViaApi()).map((t) => t.name)).toEqual(['Contract renewal']);
  });

  it('renames by name and rejects both/neither of tagId/tagName', async () => {
    const tag = await createTagViaApi('Renewal');

    const byName = await callTool('rename-tag', { tagName: 'renewal', name: 'Contract renewal' });
    expect(byName.isError).toBeFalsy();
    expect(byName.structuredContent).toMatchObject({ id: tag.id, name: 'Contract renewal' });

    const both = await callTool('rename-tag', { tagId: tag.id, tagName: 'Contract renewal', name: 'X' });
    expect(both.isError).toBe(true);
    expect(both.content).toEqual([{ type: 'text', text: 'Provide either tagId or tagName, not both' }]);

    const neither = await callTool('rename-tag', { name: 'X' });
    expect(neither.isError).toBe(true);
    expect(neither.content).toEqual([{ type: 'text', text: 'Provide either tagId or tagName, not both' }]);
  });

  it('rejects an unknown tag identifier on rename-tag with Tag not found', async () => {
    const result = await callTool('rename-tag', { tagId: 999999, name: 'X' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Tag not found' }]);
  });

  it('recolors by name, reflected everywhere the tag is attached (US2-AS4)', async () => {
    const task = await createTaskViaApi('Book venue');
    const person = await createPersonViaApi('Jordan', 'Smith');
    const tag = await createTagViaApi('Contract renewal');
    await callTool('attach-tag', { tagId: tag.id, taskId: task.id });
    await callTool('attach-tag', { tagId: tag.id, personId: person.id });

    const result = await callTool('recolor-tag', { tagName: 'Contract renewal', color: '#10B981' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: tag.id, color: '#10B981' });

    const taskDetail = await getTaskViaApi(task.id);
    expect(taskDetail.tags[0].color).toBe('#10B981');
    const personDetail = await getPersonViaApi(person.id);
    expect(personDetail.tags[0].color).toBe('#10B981');
    const tags = await listTagsViaApi();
    expect(tags[0]!.color).toBe('#10B981');
  });

  it('rejects an invalid color on recolor-tag', async () => {
    const tag = await createTagViaApi('Renewal');

    const result = await callTool('recolor-tag', { tagId: tag.id, color: 'blue' });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'A valid color is required' }]);
  });

  it('deletes by name reporting peopleDetached/tasksDetached/companiesDetached, and a second delete fails not-found (US2-AS5)', async () => {
    const task = await createTaskViaApi('Book venue');
    const person = await createPersonViaApi('Jordan', 'Smith');
    const tag = await createTagViaApi('Contract renewal');
    await callTool('attach-tag', { tagId: tag.id, taskId: task.id });
    await callTool('attach-tag', { tagId: tag.id, personId: person.id });

    const result = await callTool('delete-tag', { tagName: 'Contract renewal' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ deleted: true, peopleDetached: 1, tasksDetached: 1, companiesDetached: 0 });
    expect(await listTagsViaApi()).toEqual([]);
    expect((await getTaskViaApi(task.id)).tags).toEqual([]);
    expect((await getPersonViaApi(person.id)).tags).toEqual([]);

    const second = await callTool('delete-tag', { tagName: 'Contract renewal' });
    expect(second.isError).toBe(true);
    expect(second.content).toEqual([{ type: 'text', text: 'Tag not found' }]);
  });

  it('rejects both/neither of tagId/tagName on delete-tag', async () => {
    const tag = await createTagViaApi('Renewal');

    const both = await callTool('delete-tag', { tagId: tag.id, tagName: 'Renewal' });
    expect(both.isError).toBe(true);
    expect(both.content).toEqual([{ type: 'text', text: 'Provide either tagId or tagName, not both' }]);

    const neither = await callTool('delete-tag', {});
    expect(neither.isError).toBe(true);
    expect(neither.content).toEqual([{ type: 'text', text: 'Provide either tagId or tagName, not both' }]);

    expect(await listTagsViaApi()).toHaveLength(1);
  });
});

describe('list-tags', () => {
  it('reflects every create/rename/recolor/delete immediately', async () => {
    expect((await callTool('list-tags')).structuredContent).toEqual({ tags: [] });

    const created = await callTool('create-tag', { name: 'Renewal', color: '#111111' });
    const tagId = (created.structuredContent as { id: number }).id;
    let listed = await callTool('list-tags');
    expect(listed.structuredContent).toEqual({ tags: [{ id: tagId, name: 'Renewal', color: '#111111', peopleCount: 0, tasksCount: 0 }] });

    await callTool('rename-tag', { tagId, name: 'Contract renewal' });
    listed = await callTool('list-tags');
    expect((listed.structuredContent as { tags: { name: string }[] }).tags[0]!.name).toBe('Contract renewal');

    await callTool('delete-tag', { tagId });
    listed = await callTool('list-tags');
    expect(listed.structuredContent).toEqual({ tags: [] });
  });
});

describe('US3: attach-tag / detach-tag', () => {
  it('attaches to a task by name and a person by id, both showing the chip, tag list unaffected (US3-AS1)', async () => {
    const task = await createTaskViaApi('Book venue');
    const person = await createPersonViaApi('Jordan', 'Smith');
    const tag = await createTagViaApi('Renewal');

    const byName = await callTool('attach-tag', { tagName: 'Renewal', taskId: task.id });
    expect(byName.isError).toBeFalsy();
    expect(byName.structuredContent).toEqual({ tags: ['Renewal'] });

    const byId = await callTool('attach-tag', { tagId: tag.id, personId: person.id });
    expect(byId.isError).toBeFalsy();
    expect(byId.structuredContent).toEqual({ tags: ['Renewal'] });

    expect((await getTaskViaApi(task.id)).tags.map((t: { name: string }) => t.name)).toEqual(['Renewal']);
    expect((await getPersonViaApi(person.id)).tags.map((t: { name: string }) => t.name)).toEqual(['Renewal']);
    expect(await listTagsViaApi()).toHaveLength(1);
  });

  it('rejects an unknown tag name (no auto-create) and an unknown task id (US3-AS2)', async () => {
    const task = await createTaskViaApi('Book venue');
    const tag = await createTagViaApi('Renewal');

    const ghost = await callTool('attach-tag', { tagName: 'Ghost', taskId: task.id });
    expect(ghost.isError).toBe(true);
    expect(ghost.content).toEqual([{ type: 'text', text: 'No such tag exists — call create-tag first' }]);
    expect(await listTagsViaApi()).toHaveLength(1);

    const missingTask = await callTool('attach-tag', { tagId: tag.id, taskId: 999999 });
    expect(missingTask.isError).toBe(true);
    expect(missingTask.content).toEqual([{ type: 'text', text: 'Task 999999 not found' }]);

    expect((await getTaskViaApi(task.id)).tags).toEqual([]);
  });

  it('rejects an unknown person id', async () => {
    const tag = await createTagViaApi('Renewal');

    const result = await callTool('attach-tag', { tagId: tag.id, personId: 999999 });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Person 999999 not found' }]);
  });

  it('rejects both/neither of tagId/tagName, and both/neither of taskId/personId', async () => {
    const task = await createTaskViaApi('Book venue');
    const tag = await createTagViaApi('Renewal');

    const bothTag = await callTool('attach-tag', { tagId: tag.id, tagName: 'Renewal', taskId: task.id });
    expect(bothTag.isError).toBe(true);
    expect(bothTag.content).toEqual([{ type: 'text', text: 'Provide either tagId or tagName, not both' }]);

    const neitherTag = await callTool('attach-tag', { taskId: task.id });
    expect(neitherTag.isError).toBe(true);
    expect(neitherTag.content).toEqual([{ type: 'text', text: 'Provide either tagId or tagName, not both' }]);

    const bothTarget = await callTool('attach-tag', { tagId: tag.id, taskId: task.id, personId: 1 });
    expect(bothTarget.isError).toBe(true);
    expect(bothTarget.content).toEqual([{ type: 'text', text: 'Provide either taskId or personId, not both' }]);

    const neitherTarget = await callTool('attach-tag', { tagId: tag.id });
    expect(neitherTarget.isError).toBe(true);
    expect(neitherTarget.content).toEqual([{ type: 'text', text: 'Provide either taskId or personId, not both' }]);
  });

  it('detaching from a task leaves the person\'s attachment and the tag itself intact (US3-AS3)', async () => {
    const task = await createTaskViaApi('Book venue');
    const person = await createPersonViaApi('Jordan', 'Smith');
    const tag = await createTagViaApi('Renewal');
    await callTool('attach-tag', { tagId: tag.id, taskId: task.id });
    await callTool('attach-tag', { tagId: tag.id, personId: person.id });

    const result = await callTool('detach-tag', { tagName: 'Renewal', taskId: task.id });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ tags: [] });
    expect((await getTaskViaApi(task.id)).tags).toEqual([]);
    expect((await getPersonViaApi(person.id)).tags.map((t: { name: string }) => t.name)).toEqual(['Renewal']);
    expect(await listTagsViaApi()).toHaveLength(1);
  });

  it('re-attaching an already-attached tag is a no-op with no duplicate/error (US3-AS4)', async () => {
    const task = await createTaskViaApi('Book venue');
    const tag = await createTagViaApi('Renewal');
    await callTool('attach-tag', { tagId: tag.id, taskId: task.id });

    const result = await callTool('attach-tag', { tagId: tag.id, taskId: task.id });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ tags: ['Renewal'] });
    expect((await getTaskViaApi(task.id)).tags.map((t: { name: string }) => t.name)).toEqual(['Renewal']);
  });

  it('re-attaching an already-attached tag to a person is a no-op with no duplicate/error (US3-AS4)', async () => {
    const person = await createPersonViaApi('Jordan', 'Smith');
    const tag = await createTagViaApi('Renewal');
    await callTool('attach-tag', { tagId: tag.id, personId: person.id });

    const result = await callTool('attach-tag', { tagId: tag.id, personId: person.id });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ tags: ['Renewal'] });
    expect((await getPersonViaApi(person.id)).tags.map((t: { name: string }) => t.name)).toEqual(['Renewal']);
  });

  it('rejects an unknown tag identifier and an unknown target on detach-tag', async () => {
    const task = await createTaskViaApi('Book venue');

    const ghost = await callTool('detach-tag', { tagName: 'Ghost', taskId: task.id });
    expect(ghost.isError).toBe(true);
    expect(ghost.content).toEqual([{ type: 'text', text: 'Tag not found' }]);

    const tag = await createTagViaApi('Renewal');
    const missingTask = await callTool('detach-tag', { tagId: tag.id, taskId: 999999 });
    expect(missingTask.isError).toBe(true);
    expect(missingTask.content).toEqual([{ type: 'text', text: 'Task 999999 not found' }]);
  });
});
