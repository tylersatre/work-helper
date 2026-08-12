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

function buildTestApp() {
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({
    db,
    lanes: LANES,
    mcpTokenSecret: MCP_TOKEN_SECRET,
    identityVerifier: createIdentityVerifier(stub.url),
  });
}

async function startAndConnect(): Promise<void> {
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
}

async function addPersonToTask(args: Record<string, unknown>) {
  return client.callTool({ name: 'add-person-to-task', arguments: args });
}

async function removePersonFromTask(args: Record<string, unknown>) {
  return client.callTool({ name: 'remove-person-from-task', arguments: args });
}

async function getTask(args: Record<string, unknown>) {
  return client.callTool({ name: 'get-task', arguments: args });
}

async function createPersonViaApi(payload: Record<string, unknown>): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json();
}

async function createTaskViaApi(title: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

type LinkedPerson = { id: number; firstName: string; lastName: string; email: string | null };

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('add-person-to-task / remove-person-from-task', () => {
  it('links (no-op when already linked) and unlinks — visible in get-task and the web API', async () => {
    buildTestApp();
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' });
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();

    const added = await addPersonToTask({ taskId: task.id, personId: sam.id });
    expect(added.isError).toBeFalsy();
    expect((added.content as { text: string }[])[0]?.text).toBe('Added "Sam Rivera" to task "Follow up with Sam".');
    expect((added.structuredContent as { people: LinkedPerson[] }).people).toEqual([
      { id: sam.id, firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
    ]);

    const noop = await addPersonToTask({ taskId: task.id, personId: sam.id });
    expect(noop.isError).toBeFalsy();
    expect((noop.structuredContent as { people: unknown[] }).people).toHaveLength(1);

    const viaGetTask = await getTask({ taskId: task.id });
    expect((viaGetTask.structuredContent as { people: LinkedPerson[] }).people).toEqual([
      { id: sam.id, firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
    ]);

    const httpTask = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect((httpTask.json().people as { id: number }[]).map((person) => person.id)).toEqual([sam.id]);

    const removed = await removePersonFromTask({ taskId: task.id, personId: sam.id });
    expect(removed.isError).toBeFalsy();
    expect((removed.content as { text: string }[])[0]?.text).toBe('Removed "Sam Rivera" from task "Follow up with Sam".');
    expect((removed.structuredContent as { people: unknown[] }).people).toEqual([]);

    const httpAfter = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(httpAfter.json().people).toEqual([]);
  });

  it('links several people to one card, sorted by last name then first name', async () => {
    buildTestApp();
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    const ana = await createPersonViaApi({ firstName: 'Ana', lastName: 'Alvarez' });
    const task = await createTaskViaApi('Kickoff');
    await startAndConnect();

    await addPersonToTask({ taskId: task.id, personId: sam.id });
    const second = await addPersonToTask({ taskId: task.id, personId: ana.id });

    expect((second.structuredContent as { people: LinkedPerson[] }).people.map((person) => person.lastName)).toEqual([
      'Alvarez',
      'Rivera',
    ]);
  });

  it('errors "Task N not found" / "Person N not found" and leaves links unchanged', async () => {
    buildTestApp();
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();
    await addPersonToTask({ taskId: task.id, personId: sam.id });

    const missingTask = await addPersonToTask({ taskId: 999, personId: sam.id });
    expect(missingTask.isError).toBe(true);
    expect((missingTask.content as { text: string }[])[0]?.text).toBe('Task 999 not found');

    const missingPerson = await addPersonToTask({ taskId: task.id, personId: 999 });
    expect(missingPerson.isError).toBe(true);
    expect((missingPerson.content as { text: string }[])[0]?.text).toBe('Person 999 not found');

    const missingTaskOnRemove = await removePersonFromTask({ taskId: 999, personId: sam.id });
    expect(missingTaskOnRemove.isError).toBe(true);
    expect((missingTaskOnRemove.content as { text: string }[])[0]?.text).toBe('Task 999 not found');

    const after = await getTask({ taskId: task.id });
    expect((after.structuredContent as { people: unknown[] }).people).toHaveLength(1);
  });

  it('unlinking a person who is not linked is a no-op that leaves the other links intact', async () => {
    buildTestApp();
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    const ana = await createPersonViaApi({ firstName: 'Ana', lastName: 'Alvarez' });
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();
    await addPersonToTask({ taskId: task.id, personId: sam.id });

    const notLinked = await removePersonFromTask({ taskId: task.id, personId: ana.id });

    expect(notLinked.isError).toBeFalsy();
    expect((notLinked.content as { text: string }[])[0]?.text).toBe('Removed "Ana Alvarez" from task "Follow up with Sam".');
    expect((notLinked.structuredContent as { people: LinkedPerson[] }).people.map((person) => person.id)).toEqual([sam.id]);
  });
});
