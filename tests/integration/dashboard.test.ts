import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { appState, tasks } from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function seed(db: ReturnType<typeof createDb>['db'], rows: { title: string; lane: string; position: number; archived?: boolean; createdAt?: number }[]) {
  return rows.map(
    (row) => db.insert(tasks).values({ createdAt: Date.now(), ...row }).returning().all()[0]!,
  );
}

function validSavedView(overrides: Record<string, unknown> = {}) {
  return {
    lanes: ['To Do'],
    tagIds: [],
    text: '',
    limit: 5,
    show: { tags: true, latestNote: true, links: true, lane: false },
    ...overrides,
  };
}

describe('GET /api/dashboard', () => {
  it('returns the configured lane order and first/last-lane fallback designations when no dashboardLanes option is given', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.lanes).toEqual(LANES);
    expect(body.defaultLanes).toEqual(['To Do']);
    expect(body.quickDoneLane).toBe('Done');
  });

  it('returns the given dashboardLanes designations verbatim when the build option is provided', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES, dashboardLanes: { defaultLanes: ['To Do', 'In Progress'], quickDoneLane: 'Waiting' } });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    const body = response.json();
    expect(body.defaultLanes).toEqual(['To Do', 'In Progress']);
    expect(body.quickDoneLane).toBe('Waiting');
  });

  it('returns savedView: null when nothing has been saved', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    expect(response.json().savedView).toBeNull();
  });

  it('orders cards by lane (config order) then position ASC, id ASC, excluding archived cards (FR-004)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    seed(db, [
      { title: 'Second To Do', lane: 'To Do', position: 1 },
      { title: 'First To Do', lane: 'To Do', position: 0 },
      { title: 'Archived', lane: 'To Do', position: 2, archived: true },
      { title: 'An In Progress card', lane: 'In Progress', position: 0 },
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    const titles = response.json().cards.map((c: { title: string }) => c.title);
    expect(titles).toEqual(['First To Do', 'Second To Do', 'An In Progress card']);
  });

  it('enriches a card with tags (name-ordered, case-insensitive), board-identical searchText, and structured people/companies', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const taskResponse = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Follow up with Sam' } });
    const taskId = taskResponse.json().id;

    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/notes`, payload: { text: 'Kickoff call went well' } });

    const personResponse = await app.inject({ method: 'POST', url: '/api/people', payload: { firstName: 'Sam', lastName: 'Rivera' } });
    const personId = personResponse.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/people`, payload: { personId } });

    const companyResponse = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: 'Acme Inc' } });
    const companyId = companyResponse.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/companies`, payload: { companyId } });

    const zTag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'zebra' } });
    const aTag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Alpha' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/tags`, payload: { tagId: zTag.json().id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/tags`, payload: { tagId: aTag.json().id } });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    const card = response.json().cards.find((c: { id: number }) => c.id === taskId);

    expect(card.tags.map((t: { name: string }) => t.name)).toEqual(['Alpha', 'zebra']);
    expect(card.searchText).toBe('follow up with sam\nkickoff call went well\nsam rivera\nacme inc');
    expect(card.people).toEqual([{ id: personId, name: 'Sam Rivera' }]);
    expect(card.companies).toEqual([{ id: companyId, name: 'Acme Inc' }]);
    expect(card.latestNote).toMatchObject({ text: 'Kickoff call went well' });
  });

  it('picks the newest note by createdAt desc with id desc tiebreak when two notes share the same millisecond', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = seed(db, [{ title: 'Draft Q3 goals', lane: 'To Do', position: 0 }]);

    const { taskNotes } = await import('../../src/server/db/schema.js');
    db.insert(taskNotes).values({ taskId: task!.id, text: 'Older-id same-ms note', source: 'ui', createdAt: 5000 }).run();
    db.insert(taskNotes).values({ taskId: task!.id, text: 'Newer-id same-ms note', source: 'ui', createdAt: 5000 }).run();

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    const card = response.json().cards.find((c: { id: number }) => c.id === task!.id);

    expect(card.latestNote).toEqual({ text: 'Newer-id same-ms note', createdAt: 5000 });
  });

  it('sets latestNote to null for a task with no notes', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    seed(db, [{ title: 'Bare card', lane: 'To Do', position: 0 }]);

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    const card = response.json().cards[0];

    expect(card.latestNote).toBeNull();
    expect(card.tags).toEqual([]);
    expect(card.people).toEqual([]);
    expect(card.companies).toEqual([]);
  });

  it('returns savedView: null (not an error) when the stored app_state blob is corrupt JSON', async () => {
    const { db } = createDb(':memory:');
    db.insert(appState).values({ key: 'dashboard.view', value: '{ not valid json' }).run();
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    expect(response.statusCode).toBe(200);
    expect(response.json().savedView).toBeNull();
  });

  it('returns savedView: null (not an error) when the stored app_state blob fails schema validation', async () => {
    const { db } = createDb(':memory:');
    db.insert(appState).values({ key: 'dashboard.view', value: JSON.stringify({ lanes: [] }) }).run();
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    expect(response.statusCode).toBe(200);
    expect(response.json().savedView).toBeNull();
  });
});

describe('PUT /api/dashboard/view', () => {
  it('200s and echoes the saved view; the next GET returns it verbatim', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const view = validSavedView({ lanes: ['To Do', 'In Progress'], tagIds: [3], text: 'budget', limit: 7 });

    const putResponse = await app.inject({ method: 'PUT', url: '/api/dashboard/view', payload: view });
    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json()).toEqual(view);

    const getResponse = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(getResponse.json().savedView).toEqual(view);
  });

  it.each([
    ['empty lanes', validSavedView({ lanes: [] })],
    ['limit 0', validSavedView({ limit: 0 })],
    ['negative limit', validSavedView({ limit: -1 })],
    ['non-integer limit', validSavedView({ limit: 1.5 })],
    ['limit over 100', validSavedView({ limit: 101 })],
  ])('400s on %s, writing nothing', async (_label, payload) => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    const response = await app.inject({ method: 'PUT', url: '/api/dashboard/view', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { message: expect.any(String) } });

    const getResponse = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(getResponse.json().savedView).toBeNull();
  });

  it('400s when the show object is missing a required toggle, writing nothing', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const payload: Record<string, unknown> = validSavedView();
    delete payload.show;

    const response = await app.inject({ method: 'PUT', url: '/api/dashboard/view', payload });

    expect(response.statusCode).toBe(400);
    const getResponse = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(getResponse.json().savedView).toBeNull();
  });

  it('fully replaces a previously saved view (last write wins, FR-019)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });

    await app.inject({ method: 'PUT', url: '/api/dashboard/view', payload: validSavedView({ limit: 5 }) });
    const second = validSavedView({ lanes: ['Waiting'], limit: 10 });
    await app.inject({ method: 'PUT', url: '/api/dashboard/view', payload: second });

    const getResponse = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(getResponse.json().savedView).toEqual(second);
  });

  it('returns a stored view verbatim even if it references since-deleted tags/lanes (client-side tolerance, FR-021)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const view = validSavedView({ lanes: ['A Deleted Lane'], tagIds: [99999] });

    await app.inject({ method: 'PUT', url: '/api/dashboard/view', payload: view });
    const getResponse = await app.inject({ method: 'GET', url: '/api/dashboard' });

    expect(getResponse.json().savedView).toEqual(view);
  });
});

describe('Story 5: MCP move-task reflected in GET /api/dashboard (SC-004)', () => {
  it('reflects an MCP move-task call in the next GET /api/dashboard', async () => {
    const stub = await startStubIdentityProvider();
    const { db } = createDb(':memory:');
    seed(db, [{ title: 'Follow up with Sam', lane: 'To Do', position: 0 }]);
    const app: FastifyInstance = buildApp({ db, lanes: LANES, mcpTokenSecret: 'correct-horse-battery', identityVerifier: createIdentityVerifier(stub.url) });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('expected a listening TCP address');
    }
    const serverUrl = `http://127.0.0.1:${address.port}`;

    const provider = await connectThroughApproval(`${serverUrl}/mcp`, { assertion: stub.mint('tyler') });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
    await client.connect(transport);

    const before = await app.inject({ method: 'GET', url: '/api/dashboard' });
    const taskId = before.json().cards.find((c: { title: string }) => c.title === 'Follow up with Sam').id;

    const result = await client.callTool({ name: 'move-task', arguments: { taskId, lane: 'Waiting' } });
    expect(result.isError).toBeFalsy();

    const after = await app.inject({ method: 'GET', url: '/api/dashboard' });
    const movedCard = after.json().cards.find((c: { id: number }) => c.id === taskId);
    expect(movedCard.lane).toBe('Waiting');

    await client.close();
    await app.close();
    await stub.close();
  });
});
