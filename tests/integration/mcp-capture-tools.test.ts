import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { tasks } from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';

let db: ReturnType<typeof createDb>['db'];
let app: FastifyInstance;
let client: Client;
let stub: StubIdentityProvider;

async function totalTaskCount(): Promise<number> {
  const board = await app.inject({ method: 'GET', url: '/api/board' });
  return board.json().lanes.reduce((sum: number, lane: { tasks: unknown[] }) => sum + lane.tasks.length, 0);
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
  const serverUrl = `http://127.0.0.1:${address.port}`;

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

describe('US3: capture tools', () => {
  it('create-task with a note lands in the first lane, visible via the web API, with source "mcp" (US3-AS1, FR-020)', async () => {
    const result = await client.callTool({
      name: 'create-task',
      arguments: { title: 'Book venue', note: 'Requested during planning chat' },
    });
    expect(result.isError).toBeFalsy();

    const created = result.structuredContent as { id: number; title: string; lane: string };
    expect(created.title).toBe('Book venue');
    expect(created.lane).toBe(LANES[0]);

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${created.id}` });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().notes[0]).toMatchObject({ text: 'Requested during planning chat', source: 'mcp' });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const firstLane = board.json().lanes[0];
    expect(firstLane.tasks.map((t: { title: string }) => t.title)).toContain('Book venue');
  });

  it('create-task without a note creates a card with zero notes', async () => {
    const result = await client.callTool({ name: 'create-task', arguments: { title: 'Book flights' } });
    expect(result.isError).toBeFalsy();

    const created = result.structuredContent as { id: number };
    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${created.id}` });
    expect(detail.json().notes).toEqual([]);
  });

  it('rejects a whitespace-only title and creates nothing (US3-AS3)', async () => {
    const before = await totalTaskCount();
    const result = await client.callTool({ name: 'create-task', arguments: { title: '   ' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Title is required');
    expect(await totalTaskCount()).toBe(before);
  });

  it('add-note appends a newest "mcp" note without touching an existing "ui" note (US3-AS2)', async () => {
    const taskResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Prep board deck', note: 'Kickoff call went well' },
    });
    const taskId = taskResponse.json().id;

    const result = await client.callTool({ name: 'add-note', arguments: { taskId, text: 'Follow-up scheduled' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ taskId, text: 'Follow-up scheduled', source: 'mcp' });

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}` });
    const notes = detail.json().notes;
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ text: 'Follow-up scheduled', source: 'mcp' });
    expect(notes[1]).toMatchObject({ text: 'Kickoff call went well', source: 'ui' });
  });

  it('add-note on an unknown task errors and changes nothing', async () => {
    const result = await client.callTool({ name: 'add-note', arguments: { taskId: 999999, text: 'Anything' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Task 999999 not found');
  });

  it('rejects a whitespace-only note text and creates nothing', async () => {
    const taskResponse = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Prep board deck' } });
    const taskId = taskResponse.json().id;

    const result = await client.callTool({ name: 'add-note', arguments: { taskId, text: '   ' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Note text is required');

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}` });
    expect(detail.json().notes).toEqual([]);
  });

  it('create-task with an explicit lane lands at the bottom of that lane, visible via list-board and GET /api/board (US3-AS1)', async () => {
    db.insert(tasks)
      .values([
        { title: 'Chase invoice', lane: 'Waiting', position: 0, createdAt: 1 },
        { title: 'Await contract', lane: 'Waiting', position: 1, createdAt: 2 },
      ])
      .run();

    const result = await client.callTool({ name: 'create-task', arguments: { title: 'Confirm venue hold', lane: 'Waiting' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ lane: 'Waiting' });

    const boardTool = await client.callTool({ name: 'list-board', arguments: {} });
    const { lanes: lanesFromTool } = boardTool.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    const waitingFromTool = lanesFromTool.find((lane) => lane.name === 'Waiting')!;
    expect(waitingFromTool.tasks.map((t) => t.title)).toEqual(['Chase invoice', 'Await contract', 'Confirm venue hold']);

    const boardApi = await app.inject({ method: 'GET', url: '/api/board' });
    const waitingFromApi = boardApi.json().lanes.find((lane: { name: string }) => lane.name === 'Waiting');
    expect(waitingFromApi.tasks.map((t: { title: string }) => t.title)).toEqual(['Chase invoice', 'Await contract', 'Confirm venue hold']);
  });

  it('create-task without a lane still lands at the bottom of lanes[0], result shape unchanged (US3-AS2)', async () => {
    db.insert(tasks)
      .values([
        { title: 'Book venue', lane: 'To Do', position: 0, createdAt: 1 },
        { title: 'Order catering', lane: 'To Do', position: 1, createdAt: 2 },
      ])
      .run();

    const result = await client.callTool({ name: 'create-task', arguments: { title: 'Send invites' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ lane: LANES[0] });
    expect(result.content).toEqual([{ type: 'text', text: 'Created task "Send invites" in lane "To Do".' }]);

    const boardApi = await app.inject({ method: 'GET', url: '/api/board' });
    const toDoFromApi = boardApi.json().lanes.find((lane: { name: string }) => lane.name === 'To Do');
    expect(toDoFromApi.tasks.map((t: { title: string }) => t.title)).toEqual(['Book venue', 'Order catering', 'Send invites']);
  });

  it('rejects an unconfigured lane on create-task, naming the valid lanes, and creates no card (US4-AS3)', async () => {
    const before = await totalTaskCount();

    const result = await client.callTool({ name: 'create-task', arguments: { title: 'Book venue', lane: 'Doing' } });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'Unknown lane "Doing". Valid lanes: To Do, In Progress, Waiting, Done' },
    ]);
    expect(await totalTaskCount()).toBe(before);

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const titles = board.json().lanes.flatMap((lane: { tasks: { title: string }[] }) => lane.tasks.map((t) => t.title));
    expect(titles).not.toContain('Book venue');
  });
});
