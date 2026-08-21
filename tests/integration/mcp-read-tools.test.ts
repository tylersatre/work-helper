import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';
import { emailAddresses, tasks } from '../../src/server/db/schema.js';
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
let sam: number;
let prepDeckTaskId: number;
let followUpTaskId: number;
let draftTaskId: number;

async function createPerson(payload: Record<string, unknown>): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/people', payload });
  return response.json().id;
}

async function createTaskViaApi(title: string): Promise<number> {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
  return response.json().id;
}

beforeEach(async () => {
  stub = await startStubIdentityProvider();
  const created = createDb(':memory:');
  db = created.db;
  app = buildApp({
    db,
    lanes: LANES,
    personFields: ['Nickname'],
    mcpTokenSecret: MCP_TOKEN_SECRET,
    identityVerifier: createIdentityVerifier(stub.url),
  });

  followUpTaskId = await createTaskViaApi('Follow up with Sam');
  draftTaskId = await createTaskViaApi('Draft Q3 goals');
  await app.inject({ method: 'PUT', url: `/api/tasks/${draftTaskId}/placement`, payload: { lane: 'In Progress', index: 0 } });

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
      people: { firstName: string; lastName: string; email: string | null }[];
    };
    expect(task.title).toBe('Prep board deck');
    expect(task.lane).toBe('To Do');
    expect(task.notes).toHaveLength(1);
    expect(task.notes[0]).toMatchObject({ text: 'Kickoff call went well', source: 'ui' });
    expect(typeof task.notes[0]!.createdAt).toBe('number');
    expect(task.people.map((p) => `${p.firstName} ${p.lastName}`)).toContain('Sam Rivera');
    const samLinked = task.people.find((p) => `${p.firstName} ${p.lastName}` === 'Sam Rivera');
    expect(samLinked?.email).toBe('sam.rivera@example.com');
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
      emails: [{ id: expect.any(Number), value: 'sam.rivera@example.com', isPrimary: true }],
      phones: [{ id: expect.any(Number), value: '555-0100', isPrimary: true }],
      extraFields: { Nickname: 'Sammy' },
      tags: [],
      company: null,
    });
  });

  it('get-person errors for an unknown person id', async () => {
    const result = await client.callTool({ name: 'get-person', arguments: { personId: 999999 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Person 999999 not found');
  });

  it('get-person and search-people return the primary email when a person has two, the second marked primary (mcp-tools contract assertion 1)', async () => {
    db.update(emailAddresses).set({ isPrimary: false }).where(eq(emailAddresses.personId, sam)).run();
    db.insert(emailAddresses)
      .values({ personId: sam, value: 'sam.personal@example.com', isPrimary: true, createdAt: Date.now() })
      .run();

    const personResult = await client.callTool({ name: 'get-person', arguments: { personId: sam } });
    expect((personResult.structuredContent as { email: string | null }).email).toBe('sam.personal@example.com');

    const searchResult = await client.callTool({ name: 'search-people', arguments: { query: 'sam' } });
    const { people } = searchResult.structuredContent as { people: { email: string | null }[] };
    expect(people[0]?.email).toBe('sam.personal@example.com');
  });

  it('get-person returns null email and phone for a person with neither (mcp-tools contract assertion 2)', async () => {
    const noneId = await createPerson({ firstName: 'Cy', lastName: 'Cole' });

    const result = await client.callTool({ name: 'get-person', arguments: { personId: noneId } });

    expect(result.structuredContent).toMatchObject({ email: null, phone: null });
  });

  it('get-person and search-people immediately return the promoted survivor after the primary email is removed (mcp-tools contract assertion 3)', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/people/${sam}/emails`,
      payload: { value: 'sam.personal@example.com' },
    });
    const beforeRemoval = await app.inject({ method: 'GET', url: `/api/people/${sam}` });
    const primaryId = (beforeRemoval.json().emails as { id: number; isPrimary: boolean }[]).find((e) => e.isPrimary)!.id;

    await app.inject({ method: 'DELETE', url: `/api/people/${sam}/emails/${primaryId}` });

    const personResult = await client.callTool({ name: 'get-person', arguments: { personId: sam } });
    expect((personResult.structuredContent as { email: string | null }).email).toBe('sam.personal@example.com');

    const searchResult = await client.callTool({ name: 'search-people', arguments: { query: 'sam' } });
    const { people } = searchResult.structuredContent as { people: { email: string | null }[] };
    expect(people[0]?.email).toBe('sam.personal@example.com');
  });
});

describe('US3: position field and board-mirror ordering', () => {
  it('list-board includes position on every task summary', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: {} });
    const board = result.structuredContent as { lanes: { name: string; tasks: { position: number }[] }[] };
    const toDo = board.lanes.find((lane) => lane.name === 'To Do')!;
    expect(toDo.tasks.length).toBeGreaterThan(0);
    for (const lane of board.lanes) {
      for (const task of lane.tasks) {
        expect(typeof task.position).toBe('number');
      }
    }
  });

  it('get-task includes position', async () => {
    const result = await client.callTool({ name: 'get-task', arguments: { taskId: prepDeckTaskId } });
    const task = result.structuredContent as { position: number };
    expect(typeof task.position).toBe('number');
  });

  it('create-task includes position and appends at the bottom of the first configured lane', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/board' });
    const toDoLengthBefore = before.json().lanes.find((lane: { name: string }) => lane.name === 'To Do').tasks.length;

    const result = await client.callTool({ name: 'create-task', arguments: { title: 'Send invites' } });
    const created = result.structuredContent as { lane: string; position: number };

    expect(created.lane).toBe('To Do');
    expect(created.position).toBe(toDoLengthBefore);
  });

  it('list-board mirrors GET /api/board lane membership and (position, id) order after arranging the board via the placement endpoint (FR-010/SC-005)', async () => {
    await app.inject({ method: 'PUT', url: `/api/tasks/${followUpTaskId}/placement`, payload: { lane: 'Waiting', index: 0 } });
    await app.inject({ method: 'PUT', url: `/api/tasks/${prepDeckTaskId}/placement`, payload: { lane: 'To Do', index: 0 } });
    await app.inject({ method: 'PUT', url: `/api/tasks/${draftTaskId}/placement`, payload: { lane: 'Waiting', index: 0 } });

    const boardResponse = await app.inject({ method: 'GET', url: '/api/board' });
    const restBoard = boardResponse.json() as { lanes: { name: string; tasks: { title: string }[] }[] };

    const result = await client.callTool({ name: 'list-board', arguments: {} });
    const mcpBoard = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };

    expect(mcpBoard.lanes.map((lane) => lane.name)).toEqual(restBoard.lanes.map((lane) => lane.name));
    for (let i = 0; i < restBoard.lanes.length; i++) {
      expect(mcpBoard.lanes[i]!.tasks.map((t) => t.title)).toEqual(restBoard.lanes[i]!.tasks.map((t) => t.title));
    }

    const waiting = mcpBoard.lanes.find((lane) => lane.name === 'Waiting')!;
    expect(waiting.tasks.map((t) => t.title)).toEqual(['Draft Q3 goals', 'Follow up with Sam']);
    expect(mcpBoard.lanes.find((lane) => lane.name === 'To Do')!.tasks.map((t) => t.title)).toEqual(['Prep board deck']);
    expect(mcpBoard.lanes.find((lane) => lane.name === 'In Progress')!.tasks).toEqual([]);
  });
});

describe('US3 (011-tags): tags on get-person and get-task', () => {
  it('get-person structuredContent includes tags as an array of tag names ordered case-insensitively', async () => {
    await app.inject({ method: 'POST', url: `/api/people/${sam}/tags`, payload: { name: 'VIP' } });

    const result = await client.callTool({ name: 'get-person', arguments: { personId: sam } });

    expect((result.structuredContent as { tags: string[] }).tags).toEqual(['VIP']);
  });

  it('get-task structuredContent includes tags as an array of tag names ordered case-insensitively', async () => {
    await app.inject({ method: 'POST', url: `/api/tasks/${prepDeckTaskId}/tags`, payload: { name: 'VIP' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${prepDeckTaskId}/tags`, payload: { name: 'Q3' } });

    const result = await client.callTool({ name: 'get-task', arguments: { taskId: prepDeckTaskId } });

    expect((result.structuredContent as { tags: string[] }).tags).toEqual(['Q3', 'VIP']);
  });

  it('an untagged person returns tags: []', async () => {
    const result = await client.callTool({ name: 'get-person', arguments: { personId: sam } });

    expect((result.structuredContent as { tags: string[] }).tags).toEqual([]);
  });

  it('an untagged task returns tags: []', async () => {
    const result = await client.callTool({ name: 'get-task', arguments: { taskId: followUpTaskId } });

    expect((result.structuredContent as { tags: string[] }).tags).toEqual([]);
  });

  it('tag entries are plain strings carrying no color or id data', async () => {
    await app.inject({ method: 'POST', url: `/api/people/${sam}/tags`, payload: { name: 'VIP' } });

    const result = await client.callTool({ name: 'get-person', arguments: { personId: sam } });

    const tags = (result.structuredContent as { tags: unknown[] }).tags;
    expect(tags).toEqual(['VIP']);
  });
});

describe('US5 (015-mcp-people-tools): get-person full contact lists, search-people unchanged', () => {
  it('get-person returns full emails/phones arrays with exactly one primary each, while search-people rows stay primary-only (FR-018/FR-019)', async () => {
    await app.inject({ method: 'POST', url: `/api/people/${sam}/emails`, payload: { value: 'sam.personal@example.com' } });
    await app.inject({ method: 'POST', url: `/api/people/${sam}/phones`, payload: { value: '555-0101' } });

    const result = await client.callTool({ name: 'get-person', arguments: { personId: sam } });
    expect(result.isError).toBeFalsy();
    const person = result.structuredContent as {
      email: string | null;
      phone: string | null;
      emails: { id: number; value: string; isPrimary: boolean }[];
      phones: { id: number; value: string; isPrimary: boolean }[];
      extraFields: Record<string, string>;
      tags: string[];
    };

    expect(person.emails).toHaveLength(2);
    expect(person.emails.filter((e) => e.isPrimary)).toHaveLength(1);
    expect(person.emails.map((e) => e.value).sort()).toEqual(['sam.personal@example.com', 'sam.rivera@example.com']);
    expect(person.phones).toHaveLength(2);
    expect(person.phones.filter((p) => p.isPrimary)).toHaveLength(1);
    expect(person.phones.map((p) => p.value).sort()).toEqual(['555-0100', '555-0101']);
    expect(person.email).toBe('sam.rivera@example.com');
    expect(person.phone).toBe('555-0100');
    expect(person.extraFields).toEqual({ Nickname: 'Sammy' });

    const search = await client.callTool({ name: 'search-people', arguments: { query: 'sam' } });
    const { people } = search.structuredContent as { people: Record<string, unknown>[] };
    expect(people).toEqual([{ id: sam, name: 'Sam Rivera', email: 'sam.rivera@example.com' }]);
    expect(people[0]).not.toHaveProperty('emails');
    expect(people[0]).not.toHaveProperty('phones');
  });
});

describe('US5 (025-board-search-filter): list-board search and tags arguments', () => {
  beforeEach(async () => {
    // Reshape the outer fixture's "Follow up with Sam" card into the spec's card of the same name.
    await app.inject({ method: 'POST', url: `/api/tasks/${followUpTaskId}/notes`, payload: { text: 'Kickoff call went well' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${followUpTaskId}/people`, payload: { personId: sam } });
    const vipTag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'VIP' } });
    await app.inject({ method: 'POST', url: `/api/tasks/${followUpTaskId}/tags`, payload: { tagId: vipTag.json().id } });

    // Remove the outer fixture's stray note/link from "Prep board deck" so it doesn't collide with
    // "rivera" and note-text assertions below, then reshape it into the spec's Done-lane card.
    await app.inject({ method: 'DELETE', url: `/api/tasks/${prepDeckTaskId}/people/${sam}` });
    const prepDetail = await app.inject({ method: 'GET', url: `/api/tasks/${prepDeckTaskId}` });
    for (const note of prepDetail.json().notes as { id: number }[]) {
      await app.inject({ method: 'DELETE', url: `/api/tasks/${prepDeckTaskId}/notes/${note.id}` });
    }
    await app.inject({ method: 'PUT', url: `/api/tasks/${prepDeckTaskId}/placement`, payload: { lane: 'Done', index: 0 } });
    const q3Tag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Q3' } });
    const q3TagId = q3Tag.json().id;
    await app.inject({ method: 'POST', url: `/api/tasks/${prepDeckTaskId}/tags`, payload: { tagId: q3TagId } });

    const writeProposal = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Write proposal', note: 'Waiting on budget numbers' },
    });
    const writeProposalId = writeProposal.json().id;
    await app.inject({ method: 'PUT', url: `/api/tasks/${writeProposalId}/placement`, payload: { lane: 'In Progress', index: 0 } });
    await app.inject({ method: 'POST', url: `/api/tasks/${writeProposalId}/tags`, payload: { tagId: q3TagId } });

    const reviewBudget = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Review budget' } });
    await app.inject({
      method: 'PUT',
      url: `/api/tasks/${reviewBudget.json().id}/placement`,
      payload: { lane: 'In Progress', index: 1 },
    });

    const companyResponse = await app.inject({ method: 'POST', url: '/api/companies', payload: { name: 'Acme Inc' } });
    const acme = companyResponse.json().id;
    const bookVenue = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Book venue' } });
    const bookVenueId = bookVenue.json().id;
    await app.inject({ method: 'PUT', url: `/api/tasks/${bookVenueId}/placement`, payload: { lane: 'Waiting', index: 0 } });
    await app.inject({ method: 'POST', url: `/api/tasks/${bookVenueId}/companies`, payload: { companyId: acme } });

    const sendRecap = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Send recap' } });
    const sendRecapId = sendRecap.json().id;
    await app.inject({ method: 'PUT', url: `/api/tasks/${sendRecapId}/placement`, payload: { lane: 'Done', index: 1 } });
    await app.inject({ method: 'POST', url: `/api/tasks/${sendRecapId}/tags`, payload: { tagId: q3TagId } });

    // "Prospect" is attached to Sam Rivera the person only — no card carries it.
    const prospectTag = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Prospect' } });
    await app.inject({ method: 'POST', url: `/api/people/${sam}/tags`, payload: { tagId: prospectTag.json().id } });
  });

  function laneTasks(board: { lanes: { name: string; tasks: { title: string }[] }[] }, laneName: string): string[] {
    return board.lanes.find((lane) => lane.name === laneName)!.tasks.map((t) => t.title);
  }

  it('search:"budget" returns exactly Write proposal and Review budget, grouped under In Progress in board order', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { search: 'budget' } });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(board.lanes.map((lane) => lane.name)).toEqual(LANES);
    expect(laneTasks(board, 'In Progress')).toEqual(['Write proposal', 'Review budget']);
    expect(laneTasks(board, 'To Do')).not.toContain('Write proposal');
    expect(laneTasks(board, 'Done')).not.toContain('Review budget');
  });

  it('tags:["Q3"] returns exactly Write proposal, Prep board deck, Send recap, grouped by lane', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { tags: ['Q3'] } });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(laneTasks(board, 'In Progress')).toEqual(['Write proposal']);
    expect(laneTasks(board, 'Done')).toEqual(['Prep board deck', 'Send recap']);
  });

  it('search:"budget" and tags:["Q3"] together return exactly Write proposal', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { search: 'budget', tags: ['Q3'] } });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(laneTasks(board, 'In Progress')).toEqual(['Write proposal']);
    expect(laneTasks(board, 'Done')).toEqual([]);
  });

  it('with neither argument, the whole board is returned unchanged, including every seeded card', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: {} });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(board.lanes.map((lane) => lane.name)).toEqual(LANES);
    expect(laneTasks(board, 'To Do')).toContain('Follow up with Sam');
    expect(laneTasks(board, 'In Progress')).toEqual(expect.arrayContaining(['Write proposal', 'Review budget']));
    expect(laneTasks(board, 'Waiting')).toContain('Book venue');
    expect(laneTasks(board, 'Done')).toEqual(expect.arrayContaining(['Prep board deck', 'Send recap']));
  });

  it('search omitted, empty, or whitespace-only behaves as no filter (M1)', async () => {
    const omitted = await client.callTool({ name: 'list-board', arguments: {} });
    const whitespace = await client.callTool({ name: 'list-board', arguments: { search: '   ' } });

    const omittedBoard = omitted.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    const whitespaceBoard = whitespace.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(whitespaceBoard).toEqual(omittedBoard);
  });

  it('leading/trailing whitespace is trimmed from search before matching', async () => {
    const padded = await client.callTool({ name: 'list-board', arguments: { search: '  budget  ' } });
    const bare = await client.callTool({ name: 'list-board', arguments: { search: 'budget' } });

    expect(padded.structuredContent).toEqual(bare.structuredContent);
  });

  it('search:"rivera" matches only on a linked person\'s name (M2)', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { search: 'rivera' } });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: { title: string }[] }[] };
    expect(laneTasks(board, 'To Do')).toEqual(['Follow up with Sam']);
    expect(laneTasks(board, 'Done')).toEqual([]);
    expect(laneTasks(board, 'In Progress')).toEqual([]);
    expect(laneTasks(board, 'Waiting')).toEqual([]);
  });

  it('tag names resolve case-insensitively (M4)', async () => {
    const lower = await client.callTool({ name: 'list-board', arguments: { tags: ['q3'] } });
    const proper = await client.callTool({ name: 'list-board', arguments: { tags: ['Q3'] } });

    expect(lower.structuredContent).toEqual(proper.structuredContent);
  });

  it('a tag that exists but carries no card is not an error and returns no cards for that condition (M5)', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { tags: ['Prospect'] } });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: unknown[] }[] };
    for (const lane of board.lanes) {
      expect(lane.tasks).toEqual([]);
    }
  });

  it('a tag name matching no existing tag at all is not an error and returns no cards — not the whole board (M5, FR-017)', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { tags: ['NoSuchTagAtAll'] } });
    expect(result.isError).toBeFalsy();

    const board = result.structuredContent as { lanes: { name: string; tasks: unknown[] }[] };
    for (const lane of board.lanes) {
      expect(lane.tasks).toEqual([]);
    }
  });

  it('the output shape is unchanged — no tags or searchText leak into the task summary (output-schema contract)', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { search: 'budget' } });
    const board = result.structuredContent as { lanes: { tasks: Record<string, unknown>[] }[] };
    const task = board.lanes.flatMap((lane) => lane.tasks)[0]!;

    expect(Object.keys(task).sort()).toEqual(['createdAt', 'id', 'lane', 'position', 'title'].sort());
  });

  it('performs no writes (M10)', async () => {
    const before = db.select().from(tasks).all();

    await client.callTool({ name: 'list-board', arguments: { search: 'budget', tags: ['Q3'] } });

    const after = db.select().from(tasks).all();
    expect(after).toEqual(before);
  });

  it('the text summary reports the number of matching cards', async () => {
    const result = await client.callTool({ name: 'list-board', arguments: { tags: ['Q3'] } });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).toContain('3');
  });
});
