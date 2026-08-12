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

/** Reads lane orders through both list-board (MCP) and GET /api/board (the web app's data source). */
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

/** Snapshots every configured lane's order, through the same dual-surface read `assertBoardOrder` uses. */
async function boardSnapshot(): Promise<Record<string, string[]>> {
  const fromApi = await boardOrderViaApi();
  expect(await boardOrderViaListBoard()).toEqual(fromApi);
  return fromApi;
}

/** Asserts lane orders named in `expected` match on both surfaces (FR-012). Lanes omitted from `expected` are not checked. */
async function assertBoardOrder(expected: Record<string, string[]>): Promise<void> {
  const fromTool = await boardOrderViaListBoard();
  const fromApi = await boardOrderViaApi();
  for (const [lane, titles] of Object.entries(expected)) {
    expect(fromTool[lane]).toEqual(titles);
    expect(fromApi[lane]).toEqual(titles);
  }
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

describe('move-task harness', () => {
  it('seeds a board and reads matching order through both surfaces', async () => {
    seedBoard({ 'To Do': ['Follow up with Sam'] });
    await assertBoardOrder({ 'To Do': ['Follow up with Sam'], 'In Progress': [], Waiting: [], Done: [] });
    expect(await boardSnapshot()).toMatchObject({ 'To Do': ['Follow up with Sam'] });
  });
});

describe('US1: move-task default position', () => {
  it('moves a card to the bottom of another lane with no position (US1-AS1)', async () => {
    const ids = seedBoard({
      'To Do': ['Follow up with Sam'],
      'In Progress': ['Write proposal', 'Review budget'],
    });

    const result = await client.callTool({
      name: 'move-task',
      arguments: { taskId: ids['Follow up with Sam'], lane: 'In Progress' },
    });
    expect(result.isError).toBeFalsy();

    await assertBoardOrder({
      'In Progress': ['Write proposal', 'Review budget', 'Follow up with Sam'],
      'To Do': [],
    });
  });

  it('moving a card to its current lane with no position lands it at the bottom (edge case)', async () => {
    const ids = seedBoard({ 'To Do': ['A', 'B', 'C'] });

    const result = await client.callTool({
      name: 'move-task',
      arguments: { taskId: ids['A'], lane: 'To Do' },
    });
    expect(result.isError).toBeFalsy();

    await assertBoardOrder({ 'To Do': ['B', 'C', 'A'] });
  });
});

describe('US2: move-task explicit position', () => {
  it('moves a card cross-lane to position 2 (US2-AS1a)', async () => {
    const ids = seedBoard({
      'To Do': ['Draft Q3 goals'],
      'In Progress': ['Write proposal', 'Review budget'],
    });

    const result = await client.callTool({
      name: 'move-task',
      arguments: { taskId: ids['Draft Q3 goals'], lane: 'In Progress', position: 2 },
    });
    expect(result.isError).toBeFalsy();

    await assertBoardOrder({ 'In Progress': ['Write proposal', 'Draft Q3 goals', 'Review budget'] });
  });

  it('reorders a card within its own lane to position 1 (US2-AS2)', async () => {
    const ids = seedBoard({ 'To Do': ['Book venue', 'Order catering', 'Send invites'] });

    const result = await client.callTool({
      name: 'move-task',
      arguments: { taskId: ids['Send invites'], lane: 'To Do', position: 1 },
    });
    expect(result.isError).toBeFalsy();

    await assertBoardOrder({ 'To Do': ['Send invites', 'Book venue', 'Order catering'] });
  });

  it('clamps a past-the-end position to the bottom and reports the true landed position (US2-AS3)', async () => {
    const ids = seedBoard({ Waiting: ['Chase invoice', 'Await contract', 'Ping vendor'] });

    const result = await client.callTool({
      name: 'move-task',
      arguments: { taskId: ids['Chase invoice'], lane: 'Waiting', position: 10 },
    });
    expect(result.isError).toBeFalsy();

    await assertBoardOrder({ Waiting: ['Await contract', 'Ping vendor', 'Chase invoice'] });
    expect((result.structuredContent as { landedPosition: number }).landedPosition).toBe(3);
  });

  it('moving a card to its current position is a successful no-op (edge case)', async () => {
    const ids = seedBoard({ 'To Do': ['A', 'B', 'C'] });

    const result = await client.callTool({
      name: 'move-task',
      arguments: { taskId: ids['B'], lane: 'To Do', position: 2 },
    });
    expect(result.isError).toBeFalsy();

    await assertBoardOrder({ 'To Do': ['A', 'B', 'C'] });
    expect((result.structuredContent as { landedPosition: number }).landedPosition).toBe(2);
  });

  it('rejects out-of-range or non-integer positions at the tool boundary, leaving the board unchanged (edge case)', async () => {
    // The installed MCP SDK (@modelcontextprotocol/sdk) catches Zod input-validation errors inside
    // its CallToolRequestSchema handler and returns them as a resolved CallToolResult with
    // isError: true (see server/mcp.js's catch block, which wraps every McpError except
    // UrlElicitationRequired via createToolError) rather than rejecting the client-side promise.
    // This is SDK-boundary validation — our handler never runs, confirmed by the board staying byte-identical.
    const ids = seedBoard({ 'To Do': ['A', 'B', 'C'] });

    for (const position of [0, -1, 1.5]) {
      const before = await boardSnapshot();
      const result = await client.callTool({ name: 'move-task', arguments: { taskId: ids['A'], lane: 'To Do', position } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('Input validation error');
      expect(await boardSnapshot()).toEqual(before);
    }
  });
});
