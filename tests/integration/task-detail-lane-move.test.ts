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

describe('GET /api/tasks/:id lanes field', () => {
  it('returns the configured lane list in configured order, regardless of which lanes currently hold tasks (FR-001)', async () => {
    const { db } = createDb(':memory:');
    const app = buildApp({ db, lanes: LANES });
    const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'Waiting', position: 0, createdAt: Date.now() }).returning().all();

    const response = await app.inject({ method: 'GET', url: `/api/tasks/${task!.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().lanes).toEqual(LANES);
  });
});

describe('a pill-triggered move is visible through the MCP list-board tool (User Story 2)', () => {
  let db: ReturnType<typeof createDb>['db'];
  let app: FastifyInstance;
  let client: Client;
  let stub: StubIdentityProvider;
  let serverUrl: string;

  /** Seeds titled cards into named lanes, top-to-bottom in array order. Returns a title -> id lookup. */
  function seedBoard(lanesWithTitles: Record<string, string[]>): Record<string, number> {
    const ids: Record<string, number> = {};
    let createdAt = 1;
    for (const [lane, titles] of Object.entries(lanesWithTitles)) {
      titles.forEach((title, position) => {
        const [row] = db.insert(tasks).values({ title, lane, position, createdAt: createdAt++ }).returning().all();
        ids[title] = row!.id;
      });
    }
    return ids;
  }

  async function boardOrderViaListBoard(): Promise<Record<string, string[]>> {
    const result = await client.callTool({ name: 'list-board', arguments: {} });
    const { lanes } = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    return Object.fromEntries(lanes.map((lane) => [lane.name, lane.tasks.map((t) => t.title)]));
  }

  async function boardOrderViaApi(): Promise<Record<string, string[]>> {
    const response = await app.inject({ method: 'GET', url: '/api/board' });
    const lanes = response.json().lanes as { name: string; tasks: { title: string }[] }[];
    return Object.fromEntries(lanes.map((lane) => [lane.name, lane.tasks.map((t) => t.title)]));
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

  it('shows a task moved via PUT /api/tasks/:id/placement (the exact shape the pill row sends) at the bottom of the destination lane, matching GET /api/board (FR-004, FR-006, FR-008, FR-009)', async () => {
    const ids = seedBoard({
      'To Do': ['Follow up with Sam'],
      Waiting: ['Draft Q3 goals', 'Review budget'],
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${ids['Follow up with Sam']}/placement`,
      payload: { lane: 'Waiting', index: Number.MAX_SAFE_INTEGER },
    });
    expect(response.statusCode).toBe(200);

    const fromListBoard = await boardOrderViaListBoard();
    const fromApi = await boardOrderViaApi();
    expect(fromListBoard['Waiting']).toEqual(['Draft Q3 goals', 'Review budget', 'Follow up with Sam']);
    expect(fromListBoard).toEqual(fromApi);
  });
});
