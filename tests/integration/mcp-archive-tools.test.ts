import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { createIdentityVerifier } from '../../src/server/mcp/auth/identity.js';
import { connectThroughApproval } from './helpers/oauth-client.js';
import { startStubIdentityProvider, type StubIdentityProvider } from './helpers/stub-identity-provider.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const MCP_TOKEN_SECRET = 'correct-horse-battery';

let app: FastifyInstance;
let client: Client;
let serverUrl: string;
let stub: StubIdentityProvider;

async function createTaskViaApi(title: string): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json().id;
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
  const { db } = createDb(':memory:');
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

describe('no bulk archive/unarchive tool (FR-016)', () => {
  it('archive-card and unarchive-card each take exactly one taskId, and no bulk-shaped archive tool is registered', async () => {
    const { tools } = await client.listTools();
    const archiveTool = tools.find((tool) => tool.name === 'archive-card')!;
    const unarchiveTool = tools.find((tool) => tool.name === 'unarchive-card')!;

    expect(Object.keys(archiveTool.inputSchema.properties ?? {})).toEqual(['taskId']);
    expect(Object.keys(unarchiveTool.inputSchema.properties ?? {})).toEqual(['taskId']);

    const names = tools.map((tool) => tool.name);
    expect(names.filter((n) => /archiv/i.test(n))).toEqual(['archive-card', 'unarchive-card']);
  });
});

describe('archive-card', () => {
  it('archives an active task, returning a taskSummarySchema with archived: true', async () => {
    const taskId = await createTaskViaApi('Draft Q3 goals');

    const result = await client.callTool({ name: 'archive-card', arguments: { taskId } });

    expect(result.isError).toBeFalsy();
    const task = result.structuredContent as { id: number; title: string; archived: boolean };
    expect(task).toMatchObject({ id: taskId, title: 'Draft Q3 goals', archived: true });
  });

  it('errors for a not-found taskId', async () => {
    const result = await client.callTool({ name: 'archive-card', arguments: { taskId: 999999 } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Task 999999 not found');
  });

  it('archiving an already-archived task is an idempotent no-op returning the same success shape (R4)', async () => {
    const taskId = await createTaskViaApi('Draft Q3 goals');
    await client.callTool({ name: 'archive-card', arguments: { taskId } });

    const result = await client.callTool({ name: 'archive-card', arguments: { taskId } });

    expect(result.isError).toBeFalsy();
    const task = result.structuredContent as { archived: boolean };
    expect(task.archived).toBe(true);
  });
});

describe('unarchive-card', () => {
  it('unarchiving an archived task returns archived: false with position at the bottom of its lane', async () => {
    const firstId = await createTaskViaApi('A');
    await createTaskViaApi('B');
    await client.callTool({ name: 'archive-card', arguments: { taskId: firstId } });

    const result = await client.callTool({ name: 'unarchive-card', arguments: { taskId: firstId } });

    expect(result.isError).toBeFalsy();
    const task = result.structuredContent as { archived: boolean; position: number };
    expect(task.archived).toBe(false);
    expect(task.position).toBe(2);
  });

  it('errors for a not-found taskId', async () => {
    const result = await client.callTool({ name: 'unarchive-card', arguments: { taskId: 999999 } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Task 999999 not found');
  });

  it('unarchiving an already-active task is an idempotent no-op that does not move position (FR-014, R4)', async () => {
    const taskId = await createTaskViaApi('Draft Q3 goals');
    const before = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}` });
    const beforePosition = before.json().position;

    const result = await client.callTool({ name: 'unarchive-card', arguments: { taskId } });

    expect(result.isError).toBeFalsy();
    const task = result.structuredContent as { archived: boolean; position: number };
    expect(task.archived).toBe(false);
    expect(task.position).toBe(beforePosition);
  });
});
