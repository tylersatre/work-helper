import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError, z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { primaryValue } from '../../shared/contacts.js';
import { getPerson, listPeople } from '../services/people.js';
import { addNote, createTask, getTaskDetail, listTasksByLane } from '../services/tasks.js';
import type * as schema from '../db/schema.js';
import type { MailProvider } from '../services/email/provider.js';
import { computeSyncWindow, runSync } from '../services/email/sync.js';
import { emailsForPerson, getConversation, listConversations } from '../services/email/queries.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface McpToolsContext {
  db: AppDb;
  lanes: string[];
  personFields: string[];
  mailProvider?: MailProvider;
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function personName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

const taskSummarySchema = { id: z.number(), title: z.string(), lane: z.string(), position: z.number(), createdAt: z.number() };

const noteSchema = { id: z.number(), text: z.string(), source: z.enum(['ui', 'mcp']), createdAt: z.number() };

const taskPersonSchema = { id: z.number(), firstName: z.string(), lastName: z.string(), email: z.string().nullable() };

export function createMcpServer(context: McpToolsContext): McpServer {
  const server = new McpServer({ name: 'work-helper', version: '1.0.0' });

  server.registerTool(
    'list-board',
    {
      description: "Lists the board's lanes and the tasks in each, in configured lane order.",
      outputSchema: { lanes: z.array(z.object({ name: z.string(), tasks: z.array(z.object(taskSummarySchema)) })) },
    },
    async () => {
      const lanes = context.lanes.map((name) => ({ name, tasks: listTasksByLane(context.db, name) }));
      const structuredContent = { lanes };
      return { content: [{ type: 'text', text: `The board has ${lanes.length} lanes.` }], structuredContent };
    },
  );

  server.registerTool(
    'get-task',
    {
      description: 'Fetches a task by id, including its notes (newest first) and linked people.',
      inputSchema: { taskId: z.number().int().positive() },
      outputSchema: {
        ...taskSummarySchema,
        notes: z.array(z.object(noteSchema)),
        people: z.array(z.object(taskPersonSchema)),
      },
    },
    async ({ taskId }) => {
      const task = getTaskDetail(context.db, taskId);
      if (!task) {
        return toolError(`Task ${taskId} not found`);
      }
      const structuredContent = {
        id: task.id,
        title: task.title,
        lane: task.lane,
        position: task.position,
        createdAt: task.createdAt,
        notes: task.notes.map((note) => ({ id: note.id, text: note.text, source: note.source, createdAt: note.createdAt })),
        people: task.people.map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
        })),
      };
      return { content: [{ type: 'text', text: `Task "${task.title}" in lane "${task.lane}".` }], structuredContent };
    },
  );

  server.registerTool(
    'search-people',
    {
      description: 'Searches people by a case-insensitive substring of first name, last name, or email.',
      inputSchema: { query: z.string() },
      outputSchema: {
        people: z.array(z.object({ id: z.number(), name: z.string(), email: z.string().nullable() })),
      },
    },
    async ({ query }) => {
      const people = listPeople(context.db, context.personFields, query).map((person) => ({
        id: person.id,
        name: personName(person),
        email: primaryValue(person.emails),
      }));
      return { content: [{ type: 'text', text: `Found ${people.length} matching people.` }], structuredContent: { people } };
    },
  );

  server.registerTool(
    'get-person',
    {
      description: 'Fetches a person by id, including their configured extra fields.',
      inputSchema: { personId: z.number().int().positive() },
      outputSchema: {
        id: z.number(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        extraFields: z.record(z.string(), z.string()),
      },
    },
    async ({ personId }) => {
      const person = getPerson(context.db, context.personFields, personId);
      if (!person) {
        return toolError(`Person ${personId} not found`);
      }
      const structuredContent = {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: primaryValue(person.emails),
        phone: primaryValue(person.phones),
        extraFields: person.extraFields,
      };
      return { content: [{ type: 'text', text: `${personName(person)}` }], structuredContent };
    },
  );

  server.registerTool(
    'create-task',
    {
      description: 'Creates a task in the first configured lane, optionally with an initial note.',
      inputSchema: { title: z.string(), note: z.string().optional() },
      outputSchema: taskSummarySchema,
    },
    async ({ title, note }) => {
      try {
        const created = createTask(context.db, context.lanes, title, note, 'mcp');
        const structuredContent = { id: created.id, title: created.title, lane: created.lane, position: created.position, createdAt: created.createdAt };
        return {
          content: [{ type: 'text', text: `Created task "${created.title}" in lane "${created.lane}".` }],
          structuredContent,
        };
      } catch (error) {
        if (error instanceof ZodError) {
          return toolError(error.issues[0]?.message ?? 'Title is required');
        }
        throw error;
      }
    },
  );

  server.registerTool(
    'add-note',
    {
      description: 'Appends a note (sourced "via MCP") to an existing task.',
      inputSchema: { taskId: z.number().int().positive(), text: z.string() },
      outputSchema: { id: z.number(), taskId: z.number(), text: z.string(), source: z.literal('mcp'), createdAt: z.number() },
    },
    async ({ taskId, text }) => {
      const result = addNote(context.db, taskId, text, 'mcp');
      if (!result.ok) {
        if (result.error === 'task-not-found') {
          return toolError(`Task ${taskId} not found`);
        }
        return toolError('Note text is required');
      }
      const { note: created } = result;
      const structuredContent = { id: created.id, taskId: created.taskId, text: created.text, source: created.source, createdAt: created.createdAt };
      return { content: [{ type: 'text', text: `Added a note to task ${taskId}.` }], structuredContent };
    },
  );

  server.registerTool(
    'sync-emails',
    {
      description: 'Pulls Inbox + Sent messages for a date range (inclusive, server-local timezone) from the connected mailbox into the store.',
      inputSchema: { startDate: z.string().optional(), endDate: z.string().optional() },
      outputSchema: {
        status: z.enum(['complete', 'interrupted']),
        syncedCount: z.number(),
        error: z.string().optional(),
      },
    },
    async ({ startDate, endDate }) => {
      if (!startDate || !endDate) {
        return toolError('A start date and end date are required');
      }

      let window;
      try {
        window = computeSyncWindow(startDate, endDate);
      } catch {
        return toolError('startDate and endDate must be valid YYYY-MM-DD dates, with endDate not before startDate');
      }

      if (!context.mailProvider) {
        return toolError('Mailbox is not connected — run npm run mail:signin');
      }

      try {
        const result = await runSync(context.db, context.mailProvider, window);
        const text =
          result.status === 'complete'
            ? `Synced ${result.syncedCount} email(s).`
            : `Sync interrupted after storing ${result.syncedCount} email(s): ${result.error}`;
        const structuredContent = { status: result.status, syncedCount: result.syncedCount, error: result.error };
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolError(`Could not reach the mailbox (${message}) — run npm run mail:signin to reconnect.`);
      }
    },
  );

  const conversationSummarySchema = {
    id: z.number(),
    subject: z.string(),
    messageCount: z.number(),
    latestMessageAt: z.number(),
  };

  const participantSchema = z.object({
    address: z.string(),
    role: z.enum(['from', 'to', 'cc', 'bcc']),
    person: z.object({ id: z.number(), name: z.string() }).nullable(),
  });

  const conversationMessageSchema = z.object({
    id: z.number(),
    subject: z.string(),
    sentAt: z.number(),
    bodyText: z.string(),
    sourceFolder: z.enum(['inbox', 'sent']),
    participants: z.array(participantSchema),
  });

  server.registerTool(
    'list-conversations',
    {
      description: 'Lists synced conversations, newest activity first, keyset-paged.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      },
      outputSchema: {
        conversations: z.array(z.object(conversationSummarySchema)),
        nextCursor: z.string().nullable(),
      },
    },
    async ({ limit, cursor }) => {
      let page;
      try {
        page = listConversations(context.db, { limit, cursor });
      } catch {
        return toolError('Invalid cursor');
      }
      const structuredContent = { conversations: page.conversations, nextCursor: page.nextCursor };
      return {
        content: [{ type: 'text', text: `Found ${page.conversations.length} conversation(s).` }],
        structuredContent,
      };
    },
  );

  server.registerTool(
    'get-conversation',
    {
      description: "Fetches one conversation's full message thread, chronological, with role-tagged participants.",
      inputSchema: { conversationId: z.number().int().positive() },
      outputSchema: {
        id: z.number(),
        subject: z.string(),
        messages: z.array(conversationMessageSchema),
      },
    },
    async ({ conversationId }) => {
      const conversation = getConversation(context.db, conversationId);
      if (!conversation) {
        return toolError(`Conversation ${conversationId} not found`);
      }
      const structuredContent = { id: conversation.id, subject: conversation.subject, messages: conversation.messages };
      return {
        content: [
          { type: 'text', text: `Conversation "${conversation.subject}" has ${conversation.messages.length} message(s).` },
        ],
        structuredContent,
      };
    },
  );

  server.registerTool(
    'emails-for-person',
    {
      description: "Every synced email involving any of a person's addresses, keyset-paged, each identifying the involved address and its role.",
      inputSchema: {
        personId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      },
      outputSchema: {
        person: z.object({ id: z.number(), name: z.string() }),
        emails: z.array(
          z.object({
            messageId: z.number(),
            conversationId: z.number(),
            subject: z.string(),
            sentAt: z.number(),
            addresses: z.array(z.object({ address: z.string(), role: z.enum(['from', 'to', 'cc', 'bcc']) })),
          }),
        ),
        nextCursor: z.string().nullable(),
      },
    },
    async ({ personId, limit, cursor }) => {
      const person = getPerson(context.db, context.personFields, personId);
      if (!person) {
        return toolError(`Person ${personId} not found`);
      }

      let page;
      try {
        page = emailsForPerson(context.db, personId, { limit, cursor });
      } catch {
        return toolError('Invalid cursor');
      }

      const structuredContent = {
        person: { id: person.id, name: personName(person) },
        emails: page.emails,
        nextCursor: page.nextCursor,
      };
      return {
        content: [{ type: 'text', text: `Found ${page.emails.length} email(s) for ${personName(person)}.` }],
        structuredContent,
      };
    },
  );

  return server;
}
