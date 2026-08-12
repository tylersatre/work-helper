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

async function createCompany(args: Record<string, unknown>) {
  return client.callTool({ name: 'create-company', arguments: args });
}

async function renameCompany(args: Record<string, unknown>) {
  return client.callTool({ name: 'rename-company', arguments: args });
}

async function deleteCompany(args: Record<string, unknown>) {
  return client.callTool({ name: 'delete-company', arguments: args });
}

async function listCompanies() {
  return client.callTool({ name: 'list-companies' });
}

async function getCompany(args: Record<string, unknown>) {
  return client.callTool({ name: 'get-company', arguments: args });
}

async function setPersonCompany(args: Record<string, unknown>) {
  return client.callTool({ name: 'set-person-company', arguments: args });
}

async function addCompanyToTask(args: Record<string, unknown>) {
  return client.callTool({ name: 'add-company-to-task', arguments: args });
}

async function removeCompanyFromTask(args: Record<string, unknown>) {
  return client.callTool({ name: 'remove-company-from-task', arguments: args });
}

async function getPerson(args: Record<string, unknown>) {
  return client.callTool({ name: 'get-person', arguments: args });
}

async function getTask(args: Record<string, unknown>) {
  return client.callTool({ name: 'get-task', arguments: args });
}

async function createCompanyViaApi(name: string): Promise<{ id: number; name: string }> {
  const response = await app.inject({ method: 'POST', url: '/api/companies', payload: { name } });
  return response.json();
}

async function createPersonViaApi(payload: Record<string, unknown>): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json();
}

async function createTaskViaApi(title: string): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json();
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
});

afterEach(async () => {
  await client.close();
  await app.close();
  await stub.close();
});

describe('company lifecycle via MCP tools (SC-008)', () => {
  it('create → list → get (empty) → rename (own-casing) → delete, each step visible in the web API', async () => {
    buildTestApp();
    await startAndConnect();

    const created = await createCompany({ name: 'Initech' });
    expect(created.isError).toBeFalsy();
    expect((created.content as { text: string }[])[0]?.text).toBe('Created company "Initech".');
    const company = created.structuredContent as { id: number; name: string };
    expect(company.name).toBe('Initech');

    const listed = await listCompanies();
    expect((listed.structuredContent as { companies: { name: string }[] }).companies.map((c) => c.name)).toEqual(['Initech']);
    const httpList = await app.inject({ method: 'GET', url: '/api/companies' });
    expect(httpList.json()).toEqual([{ id: company.id, name: 'Initech' }]);

    const detail = await getCompany({ companyId: company.id });
    expect(detail.isError).toBeFalsy();
    expect(detail.structuredContent).toEqual({ id: company.id, name: 'Initech', people: [], cards: [], tags: [] });

    const renamed = await renameCompany({ companyId: company.id, name: 'INITECH' });
    expect(renamed.isError).toBeFalsy();
    expect((renamed.content as { text: string }[])[0]?.text).toBe('Renamed company to "INITECH".');
    expect((renamed.structuredContent as { name: string }).name).toBe('INITECH');
    const httpDetail = await app.inject({ method: 'GET', url: `/api/companies/${company.id}` });
    expect(httpDetail.json()).toMatchObject({ name: 'INITECH' });

    const deleted = await deleteCompany({ companyId: company.id });
    expect(deleted.isError).toBeFalsy();
    expect((deleted.content as { text: string }[])[0]?.text).toBe('Deleted company "INITECH". 0 person assignment(s) cleared, 0 card link(s) removed.');
    expect(deleted.structuredContent).toEqual({ deleted: true });

    const afterDelete = await listCompanies();
    expect((afterDelete.structuredContent as { companies: unknown[] }).companies).toEqual([]);
    const httpAfterDelete = await app.inject({ method: 'GET', url: '/api/companies' });
    expect(httpAfterDelete.json()).toEqual([]);
  });

  it('validation errors are worded identically to HTTP', async () => {
    buildTestApp();
    await startAndConnect();

    const blank = await createCompany({ name: '   ' });
    expect(blank.isError).toBe(true);
    expect((blank.content as { text: string }[])[0]?.text).toBe('A name is required');

    await createCompany({ name: 'Acme Corp' });
    const duplicate = await createCompany({ name: 'acme corp' });
    expect(duplicate.isError).toBe(true);
    expect((duplicate.content as { text: string }[])[0]?.text).toBe('That company name is already in use');

    const notFound = await getCompany({ companyId: 999 });
    expect(notFound.isError).toBe(true);
    expect((notFound.content as { text: string }[])[0]?.text).toBe('Company 999 not found');
  });

  it('delete-company reports cleared assignments and removed links, and 404s for an unknown id', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    const task = await createTaskViaApi('Follow up with Sam');
    await app.inject({ method: 'PUT', url: `/api/people/${sam.id}`, payload: { firstName: 'Sam', lastName: 'Rivera', companyId: acme.id } });
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/companies`, payload: { companyId: acme.id } });
    await startAndConnect();

    const result = await deleteCompany({ companyId: acme.id });

    expect(result.isError).toBeFalsy();
    expect((result.content as { text: string }[])[0]?.text).toBe('Deleted company "Acme Corp". 1 person assignment(s) cleared, 1 card link(s) removed.');

    const missing = await deleteCompany({ companyId: 999 });
    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toBe('Company 999 not found');
  });
});

describe('set-person-company (SC-008)', () => {
  it('sets, switches, and clears — visible in get-person and the web API', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const globex = await createCompanyViaApi('Globex');
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    await startAndConnect();

    const set = await setPersonCompany({ personId: sam.id, companyId: acme.id });
    expect(set.isError).toBeFalsy();
    expect((set.content as { text: string }[])[0]?.text).toBe('Set Sam Rivera\'s company to "Acme Corp".');
    expect((set.structuredContent as { company: { name: string } }).company).toEqual({ id: acme.id, name: 'Acme Corp' });

    const httpAfterSet = await app.inject({ method: 'GET', url: `/api/people/${sam.id}` });
    expect(httpAfterSet.json().company).toEqual({ id: acme.id, name: 'Acme Corp' });

    const switched = await setPersonCompany({ personId: sam.id, companyId: globex.id });
    expect((switched.structuredContent as { company: { name: string } }).company).toEqual({ id: globex.id, name: 'Globex' });

    const cleared = await setPersonCompany({ personId: sam.id, companyId: null });
    expect(cleared.isError).toBeFalsy();
    expect((cleared.content as { text: string }[])[0]?.text).toBe("Cleared Sam Rivera's company.");
    expect((cleared.structuredContent as { company: unknown }).company).toBeNull();

    const httpAfterClear = await app.inject({ method: 'GET', url: `/api/people/${sam.id}` });
    expect(httpAfterClear.json().company).toBeNull();
  });

  it('errors "Person N not found" / "Company N not found"', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    await startAndConnect();

    const missingPerson = await setPersonCompany({ personId: 999, companyId: acme.id });
    expect(missingPerson.isError).toBe(true);
    expect((missingPerson.content as { text: string }[])[0]?.text).toBe('Person 999 not found');

    const missingCompany = await setPersonCompany({ personId: sam.id, companyId: 999 });
    expect(missingCompany.isError).toBe(true);
    expect((missingCompany.content as { text: string }[])[0]?.text).toBe('Company 999 not found');
  });
});

describe('add-company-to-task / remove-company-from-task (SC-008)', () => {
  it('links (no-op when already linked) and unlinks — visible in get-task and the web API', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();

    const added = await addCompanyToTask({ taskId: task.id, companyId: acme.id });
    expect(added.isError).toBeFalsy();
    expect((added.content as { text: string }[])[0]?.text).toBe(`Added "Acme Corp" to task "Follow up with Sam".`);
    expect((added.structuredContent as { companies: { name: string }[] }).companies).toEqual([{ id: acme.id, name: 'Acme Corp' }]);

    const noop = await addCompanyToTask({ taskId: task.id, companyId: acme.id });
    expect((noop.structuredContent as { companies: unknown[] }).companies).toHaveLength(1);

    const httpTask = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(httpTask.json().companies).toEqual([{ id: acme.id, name: 'Acme Corp' }]);

    const removed = await removeCompanyFromTask({ taskId: task.id, companyId: acme.id });
    expect(removed.isError).toBeFalsy();
    expect((removed.content as { text: string }[])[0]?.text).toBe(`Removed "Acme Corp" from task "Follow up with Sam".`);
    expect((removed.structuredContent as { companies: unknown[] }).companies).toEqual([]);
  });

  it('errors "Task N not found" / "Company N not found"', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();

    const missingTask = await addCompanyToTask({ taskId: 999, companyId: acme.id });
    expect(missingTask.isError).toBe(true);
    expect((missingTask.content as { text: string }[])[0]?.text).toBe('Task 999 not found');

    const missingCompany = await addCompanyToTask({ taskId: task.id, companyId: 999 });
    expect(missingCompany.isError).toBe(true);
    expect((missingCompany.content as { text: string }[])[0]?.text).toBe('Company 999 not found');

    const missingTaskOnRemove = await removeCompanyFromTask({ taskId: 999, companyId: acme.id });
    expect(missingTaskOnRemove.isError).toBe(true);
    expect((missingTaskOnRemove.content as { text: string }[])[0]?.text).toBe('Task 999 not found');
  });
});

describe('get-company populated detail (AS2, SC-008)', () => {
  it("lists Sam Rivera among people and the card among cards, plus attached tags, after linking both", async () => {
    buildTestApp();
    const globex = await createCompanyViaApi('Globex');
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();

    await setPersonCompany({ personId: sam.id, companyId: globex.id });
    await addCompanyToTask({ taskId: task.id, companyId: globex.id });
    const tagged = await app.inject({ method: 'POST', url: `/api/companies/${globex.id}/tags`, payload: { name: 'VIP' } });
    expect(tagged.statusCode).toBe(200);

    const detail = await getCompany({ companyId: globex.id });

    expect(detail.isError).toBeFalsy();
    expect((detail.content as { text: string }[])[0]?.text).toBe('Company "Globex".');
    const structured = detail.structuredContent as {
      id: number;
      name: string;
      people: { id: number; firstName: string; lastName: string }[];
      cards: { id: number; title: string; lane: string }[];
      tags: string[];
    };
    expect(structured).toEqual({
      id: globex.id,
      name: 'Globex',
      people: [{ id: sam.id, firstName: 'Sam', lastName: 'Rivera' }],
      cards: [{ id: task.id, title: 'Follow up with Sam', lane: 'To Do' }],
      tags: ['VIP'],
    });

    const httpDetail = await app.inject({ method: 'GET', url: `/api/companies/${globex.id}` });
    expect(httpDetail.json().people).toEqual(structured.people);
    expect(httpDetail.json().cards).toEqual(structured.cards);
  });
});

describe('get-person / get-task company fields (FR-015)', () => {
  it('get-person includes company: { id, name } | null', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const sam = await createPersonViaApi({ firstName: 'Sam', lastName: 'Rivera' });
    await startAndConnect();

    const before = await getPerson({ personId: sam.id });
    expect((before.structuredContent as { company: unknown }).company).toBeNull();

    await setPersonCompany({ personId: sam.id, companyId: acme.id });
    const after = await getPerson({ personId: sam.id });
    expect((after.structuredContent as { company: { id: number; name: string } | null }).company).toEqual({ id: acme.id, name: 'Acme Corp' });
  });

  it('get-task includes companies: [{ id, name }]', async () => {
    buildTestApp();
    const acme = await createCompanyViaApi('Acme Corp');
    const task = await createTaskViaApi('Follow up with Sam');
    await startAndConnect();

    const before = await getTask({ taskId: task.id });
    expect((before.structuredContent as { companies: unknown[] }).companies).toEqual([]);

    await addCompanyToTask({ taskId: task.id, companyId: acme.id });
    const after = await getTask({ taskId: task.id });
    expect((after.structuredContent as { companies: { id: number; name: string }[] }).companies).toEqual([{ id: acme.id, name: 'Acme Corp' }]);
  });
});
