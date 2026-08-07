import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { tasks } from '../../src/server/db/schema.js';
import { connectThroughPasswordGate } from './helpers/oauth-client.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const PASSWORD = 'correct-horse-battery';

let app: FastifyInstance;
let client: Client;
let serverUrl: string;
let sam: number;
let prepDeckTaskId: number;

async function createPerson(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function createTaskViaApi(title: string): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json().id;
}

beforeEach(async () => {
  const { db } = createDb(':memory:');
  app = buildApp({ db, lanes: LANES, personFields: ['Nickname'], connectorPassword: PASSWORD });

  await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Follow up with Sam' } });
  const draftId = await createTaskViaApi('Draft Q3 goals');
  db.update(tasks).set({ lane: 'In Progress' }).where(eq(tasks.id, draftId)).run();

  prepDeckTaskId = await createTaskViaApi('Prep board deck');
  await app.inject({
    method: 'POST',
    url: `/api/tasks/${prepDeckTaskId}/notes`,
    payload: { text: 'Kickoff call went well' },
  });

  sam = await createPerson({
    firstName: 'Sam',
    lastName: 'Rivera',
    email: 'sam.rivera@example.com',
    phone: '555-0100',
    extraFields: { Nickname: 'Sammy' },
  });
  await createPerson({ firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com' });

  await app.inject({ method: 'POST', url: `/api/tasks/${prepDeckTaskId}/people`, payload: { personId: sam } });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected a listening TCP address');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;

  const provider = await connectThroughPasswordGate(`${serverUrl}/mcp`, PASSWORD);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), { authProvider: provider });
  await client.connect(transport);
});

afterEach(async () => {
  await client.close();
  await app.close();
});

describe('US2: read tools', () => {
  it('list-board returns all configured lanes in order with seeded tasks in the right lanes (US2-AS1)', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: {} });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(board.lanes.map((lane) => lane.name)).toEqual(LANES);

    const toDo = board.lanes.find((lane) => lane.name === 'To Do')!;
    expect(toDo.tasks.map((t) => t.title)).toContain('Follow up with Sam');

    const inProgress = board.lanes.find((lane) => lane.name === 'In Progress')!;
    expect(inProgress.tasks.map((t) => t.title)).toContain('Draft Q3 goals');
  });

  it('list-board succeeds when the client omits `arguments` entirely (a conversational client calling a zero-arg tool)', async () => {
    const result = await client.callTool({ name: 'list-board' });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string }[] };
    expect(board.lanes.map((lane) => lane.name)).toEqual(LANES);
  });

  it('get-task returns title, lane, notes newest-first, and linked people (US2-AS2)', async () => {
    const result = await client.callTool({ name: 'get-task', arguments: { taskId: prepDeckTaskId } });
    expect(result.isError).toBeFalsy();

    const task = result.structuredContent as {
      title: string;
      lane: string;
      notes: { text: string; source: string; createdAt: number }[];
      people: { firstName: string; lastName: string }[];
    };
    expect(task.title).toBe('Prep board deck');
    expect(task.lane).toBe('To Do');
    expect(task.notes).toHaveLength(1);
    expect(task.notes[0]).toMatchObject({ text: 'Kickoff call went well', source: 'ui' });
    expect(typeof task.notes[0]!.createdAt).toBe('number');
    expect(task.people.map((p) => `${p.firstName} ${p.lastName}`)).toContain('Sam Rivera');
  });

  it('get-task errors for an unknown task id', async () => {
    const result = await client.callTool({ name: 'get-task', arguments: { taskId: 999999 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Task 999999 not found');
  });

  it('search-people finds Sam Rivera by substring and excludes Ana Alvarez (US2-AS3)', async () => {
    const result = await client.callTool({ name: 'search-people', arguments: { query: 'sam' } });
    expect(result.isError).toBeFalsy();

    const { people } = result.structuredContent as { people: { name: string; email: string | null }[] };
    expect(people).toEqual([{ id: sam, name: 'Sam Rivera', email: 'sam.rivera@example.com' }]);
  });

  it('search-people returns an empty success result for no matches', async () => {
    const result = await client.callTool({ name: 'search-people', arguments: { query: 'zzz-no-match' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ people: [] });
  });

  it('get-person returns first/last/email/phone/extraFields (US2-AS3)', async () => {
    const result = await client.callTool({ name: 'get-person', arguments: { personId: sam } });
    expect(result.isError).toBeFalsy();

    expect(result.structuredContent).toEqual({
      id: sam,
      firstName: 'Sam',
      lastName: 'Rivera',
      email: 'sam.rivera@example.com',
      phone: '555-0100',
      extraFields: { Nickname: 'Sammy' },
    });
  });

  it('get-person errors for an unknown person id', async () => {
    const result = await client.callTool({ name: 'get-person', arguments: { personId: 999999 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Person 999999 not found');
  });
});
