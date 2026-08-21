import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailConversations, taskConversations, taskNotes, taskPeople, taskTags, taskCompanies } from '../../src/server/db/schema.js';
import type * as schema from '../../src/server/db/schema.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { linkConversationToTask } from '../../src/server/services/task-conversations.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp(): { app: FastifyInstance; db: AppDb } {
  const { db } = createDb(':memory:');
  const app = buildApp({ db, lanes: LANES });
  return { app, db };
}

async function createTask(app: FastifyInstance, title: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

async function createPerson(app: FastifyInstance, payload: Record<string, unknown>): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json();
}

async function createCompany(app: FastifyInstance, name: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/companies', payload: { name } });
  return response.json();
}

describe('DELETE /api/tasks/:id', () => {
  it('deletes an existing card with 200 and the card is gone from GET /api/board (US1)', async () => {
    const { app } = buildTestApp();
    const task = await createTask(app, 'Prep board deck');

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const board = await app.inject({ method: 'GET', url: '/api/board' });
    const titles = (board.json().lanes as { tasks: { title: string }[] }[]).flatMap((lane) => lane.tasks.map((t) => t.title));
    expect(titles).not.toContain('Prep board deck');
  });

  it('cascades to the card\'s own links but leaves linked people and conversations untouched (US3, FR-007)', async () => {
    const { app, db } = buildTestApp();
    const task = await createTask(app, 'Prep board deck');
    const person = await createPerson(app, { firstName: 'Sam', lastName: 'Rivera' });
    const company = await createCompany(app, 'Acme Corp');
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/notes`, payload: { text: 'Kickoff call went well' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/people`, payload: { personId: person.id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: company.id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/tags`, payload: { name: 'VIP' } });

    const [conversation] = db
      .insert(emailConversations)
      .values({ graphConversationId: 'conv-1', createdAt: Date.now() })
      .returning()
      .all();
    linkConversationToTask(db, task.id, conversation!.id);

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });
    expect(response.statusCode).toBe(200);

    expect(db.select().from(taskNotes).where(eq(taskNotes.taskId, task.id)).all()).toEqual([]);
    expect(db.select().from(taskPeople).where(eq(taskPeople.taskId, task.id)).all()).toEqual([]);
    expect(db.select().from(taskCompanies).where(eq(taskCompanies.taskId, task.id)).all()).toEqual([]);
    expect(db.select().from(taskTags).where(eq(taskTags.taskId, task.id)).all()).toEqual([]);
    expect(db.select().from(taskConversations).where(eq(taskConversations.taskId, task.id)).all()).toEqual([]);

    const personResponse = await app.inject({ method: 'GET', url: `/api/people/${person.id}` });
    expect(personResponse.statusCode).toBe(200);
    expect(personResponse.json().firstName).toBe('Sam');

    const conversationRow = db.select().from(emailConversations).where(eq(emailConversations.id, conversation!.id)).all();
    expect(conversationRow).toHaveLength(1);

    const companyResponse = await app.inject({ method: 'GET', url: `/api/companies/${company.id}` });
    expect(companyResponse.statusCode).toBe(200);
    expect(companyResponse.json().name).toBe('Acme Corp');
  });

  it('returns 404 "Task not found" for a non-existent id, not a 500', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: 'DELETE', url: '/api/tasks/999999' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });

  it('returns 404 "Task not found" when confirming deletion of an already-deleted card (stale tab edge case)', async () => {
    const { app } = buildTestApp();
    const task = await createTask(app, 'Prep board deck');
    await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });

    const response = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: 'Task not found' } });
  });
});

describe('US3: MCP visibility of a deleted card', () => {
  const MCP_TOKEN_SECRET = 'correct-horse-battery';
  let app: FastifyInstance;
  let client: Client;
  let serverUrl: string;
  let stub: StubIdentityProvider;

  beforeEach(async () => {
    stub = await startStubIdentityProvider();
    const { db } = createDb(':memory:');
    app = buildApp({
      db,
      lanes: LANES,
      mcpTokenSecret: MCP_TOKEN_SECRET,
      identityVerifier: createIdentityVerifier(stub.url),
    });

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

  it('list-board no longer includes a card deleted via DELETE /api/tasks/:id (US3-AS2, FR-008)', async () => {
    const task = await createTask(app, 'Prep board deck');

    const before = await client.callTool({ name: 'list-board', arguments: {} });
    const boardBefore = before.structuredContent as { lanes: { tasks: { title: string }[] }[] };
    expect(boardBefore.lanes.flatMap((lane) => lane.tasks.map((t) => t.title))).toContain('Prep board deck');

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });
    expect(deleteResponse.statusCode).toBe(200);

    const after = await client.callTool({ name: 'list-board', arguments: {} });
    const boardAfter = after.structuredContent as { lanes: { tasks: { title: string }[] }[] };
    expect(boardAfter.lanes.flatMap((lane) => lane.tasks.map((t) => t.title))).not.toContain('Prep board deck');
  });

  it('registers no MCP tool that deletes a task (FR-009)', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('list-board');
    expect(names).toContain('get-task');

    expect(names).not.toContain('delete-task');
    expect(names).not.toContain('delete_task');
    expect(names).not.toContain('remove-task');
    expect(names).not.toContain('delete-card');
    expect(names).not.toContain('archive-task');
    expect(names.filter((n) => /(delete|remove|destroy|archive)[-_](task|card)/.test(n))).toEqual([]);
  });
});
