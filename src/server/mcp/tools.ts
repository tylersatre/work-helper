import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError, z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { primaryValue } from '../../shared/contacts.js';
import { addEntry, markPrimary, removeEntry } from '../services/contact-entries.js';
import { createPerson, getPerson, listPeople, updatePerson as updatePersonService, type PersonRecord } from '../services/people.js';
import { addNote, createTask, getTaskDetail, listTasksByLane } from '../services/tasks.js';
import { emailAddresses, personPhones } from '../db/schema.js';
import type * as schema from '../db/schema.js';
import type { CalendarProvider } from '../services/calendar/provider.js';
import { listEvents } from '../services/calendar/queries.js';
import type { MailProvider } from '../services/email/provider.js';
import { computeSyncWindow } from '../services/email/sync.js';
import type { SyncCoordinator } from '../services/email/sync-coordinator.js';
import { emailsForPerson, getConversation, listConversations, listUnlinkedAddresses } from '../services/email/queries.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface McpToolsContext {
  db: AppDb;
  lanes: string[];
  personFields: string[];
  mailProvider?: MailProvider;
  calendarProvider?: CalendarProvider;
  syncCoordinator: SyncCoordinator;
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

const contactEntrySchema = z.object({ id: z.number(), value: z.string(), isPrimary: z.boolean() });

const personDetailSchema = {
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  emails: z.array(contactEntrySchema),
  phones: z.array(contactEntrySchema),
  extraFields: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
};

function personDetail(person: PersonRecord) {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: primaryValue(person.emails),
    phone: primaryValue(person.phones),
    emails: person.emails.map((entry) => ({ id: entry.id, value: entry.value, isPrimary: entry.isPrimary })),
    phones: person.phones.map((entry) => ({ id: entry.id, value: entry.value, isPrimary: entry.isPrimary })),
    extraFields: person.extraFields,
    tags: person.tags.map((tag) => tag.name),
  };
}

/** Rejects any extraFields key not in the configured person-fields list, naming every offender (FR-005) — the UI's normalizeExtraFields silently drops unknown keys instead, so this guard lives only at the MCP tool layer. */
function unknownFieldsError(extraFields: Record<string, string> | undefined, personFields: string[]): string | undefined {
  if (!extraFields) return undefined;
  const allowed = new Set(personFields);
  const unknown = Object.keys(extraFields).filter((key) => !allowed.has(key));
  if (unknown.length === 0) return undefined;
  return `Unknown field ${unknown.map((key) => `"${key}"`).join(', ')}`;
}

/** `A value is required` for an explicitly blank/whitespace contact value; undefined for an omitted one. */
function blankContactValueError(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() === '' ? 'A value is required' : undefined;
}

function tableFor(type: 'email' | 'phone') {
  return type === 'email' ? emailAddresses : personPhones;
}

function toContactEntries(entries: { id: number; value: string; isPrimary: boolean }[]) {
  return entries.map((entry) => ({ id: entry.id, value: entry.value, isPrimary: entry.isPrimary }));
}

function conflictError(type: 'email' | 'phone', holder: { id: number; name: string } | null): string {
  const label = type === 'email' ? 'email' : 'phone number';
  return holder ? `That ${label} is already in use by ${holder.name}` : `That ${label} is already in use`;
}

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
      description: 'Fetches a task by id, including its notes (newest first), linked people, and tag names.',
      inputSchema: { taskId: z.number().int().positive() },
      outputSchema: {
        ...taskSummarySchema,
        notes: z.array(z.object(noteSchema)),
        people: z.array(z.object(taskPersonSchema)),
        tags: z.array(z.string()),
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
        tags: task.tags.map((tag) => tag.name),
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
      description: "Fetches a person by id, including every email address and phone number (primary of each type marked), configured extra fields, and tag names.",
      inputSchema: { personId: z.number().int().positive() },
      outputSchema: personDetailSchema,
    },
    async ({ personId }) => {
      const person = getPerson(context.db, context.personFields, personId);
      if (!person) {
        return toolError(`Person ${personId} not found`);
      }
      const structuredContent = personDetail(person);
      return { content: [{ type: 'text', text: `${personName(person)}` }], structuredContent };
    },
  );

  server.registerTool(
    'create-person',
    {
      description:
        'Creates a person with names, at most one email, at most one phone, and any configured extra fields — indistinguishable from a UI-created person. An email matching an address already synced but unlinked is linked instead of duplicated, bringing its mail history.',
      inputSchema: {
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        extraFields: z.record(z.string(), z.string()).optional(),
      },
      outputSchema: personDetailSchema,
    },
    async ({ firstName, lastName, email, phone, extraFields }) => {
      if (firstName.trim() === '' || lastName.trim() === '') {
        return toolError('First and last name are required');
      }
      const fieldsError = unknownFieldsError(extraFields, context.personFields);
      if (fieldsError) {
        return toolError(fieldsError);
      }
      const emailError = blankContactValueError(email);
      if (emailError) {
        return toolError(emailError);
      }
      const phoneError = blankContactValueError(phone);
      if (phoneError) {
        return toolError(phoneError);
      }

      const result = createPerson(context.db, context.personFields, { firstName, lastName, email, phone, extraFields });
      if (!result.ok) {
        const label = result.error === 'email-conflict' ? 'email' : 'phone number';
        return toolError(`That ${label} is already in use by ${result.holder.name}`);
      }

      const structuredContent = personDetail(result.person);
      return { content: [{ type: 'text', text: `Created person "${personName(result.person)}".` }], structuredContent };
    },
  );

  server.registerTool(
    'update-person',
    {
      description:
        "Partially edits a person's first name, last name, and extra configured field values, under the same validation as creation. Omitted inputs keep current values; provided extraFields keys merge over current ones, with an empty-string value clearing that field. Contact lists are not editable here — use the contact-entry tools.",
      inputSchema: {
        personId: z.number().int().positive(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        extraFields: z.record(z.string(), z.string()).optional(),
      },
      outputSchema: personDetailSchema,
    },
    async ({ personId, firstName, lastName, extraFields }) => {
      const current = getPerson(context.db, context.personFields, personId);
      if (!current) {
        return toolError(`Person ${personId} not found`);
      }

      if ((firstName !== undefined && firstName.trim() === '') || (lastName !== undefined && lastName.trim() === '')) {
        return toolError('First and last name are required');
      }
      const fieldsError = unknownFieldsError(extraFields, context.personFields);
      if (fieldsError) {
        return toolError(fieldsError);
      }

      const result = updatePersonService(context.db, context.personFields, personId, {
        firstName: firstName ?? current.firstName,
        lastName: lastName ?? current.lastName,
        extraFields: { ...current.extraFields, ...extraFields },
      });
      if (!result.ok) {
        return toolError(`Person ${personId} not found`);
      }

      const structuredContent = personDetail(result.person);
      return { content: [{ type: 'text', text: `Updated person "${personName(result.person)}".` }], structuredContent };
    },
  );

  const contactMutationOutputSchema = {
    personId: z.number(),
    type: z.enum(['email', 'phone']),
    entries: z.array(contactEntrySchema),
  };

  server.registerTool(
    'add-contact-entry',
    {
      description:
        "Adds an email or phone number to a person. The first entry of its type becomes primary; an email that exists in synced mail but is linked to no person is linked in place, bringing its mail history.",
      inputSchema: { personId: z.number().int().positive(), type: z.enum(['email', 'phone']), value: z.string() },
      outputSchema: contactMutationOutputSchema,
    },
    async ({ personId, type, value }) => {
      try {
        const result = addEntry(context.db, tableFor(type), personId, value);
        if (!result.ok) {
          if (result.error === 'person-not-found') {
            return toolError(`Person ${personId} not found`);
          }
          if (result.error === 'conflict') {
            return toolError(conflictError(type, result.holder));
          }
          return toolError('Entry not found');
        }

        const person = getPerson(context.db, context.personFields, personId)!;
        const structuredContent = { personId, type, entries: toContactEntries(result.entries) };
        return {
          content: [{ type: 'text', text: `Added ${type} "${value.trim()}" to ${personName(person)}.` }],
          structuredContent,
        };
      } catch (error) {
        if (error instanceof ZodError) {
          return toolError(error.issues[0]?.message ?? 'A value is required');
        }
        throw error;
      }
    },
  );

  server.registerTool(
    'mark-contact-primary',
    {
      description: "Marks one of a person's email addresses or phone numbers as primary, moving the marker off the previous primary of that type. Marking the current primary again is a no-op.",
      inputSchema: { personId: z.number().int().positive(), type: z.enum(['email', 'phone']), entryId: z.number().int().positive() },
      outputSchema: contactMutationOutputSchema,
    },
    async ({ personId, type, entryId }) => {
      const result = markPrimary(context.db, tableFor(type), personId, entryId);
      if (!result.ok) {
        if (result.error === 'person-not-found') {
          return toolError(`Person ${personId} not found`);
        }
        return toolError(`Entry ${entryId} not found`);
      }

      const person = getPerson(context.db, context.personFields, personId)!;
      const value = result.entries.find((entry) => entry.id === entryId)?.value ?? '';
      const structuredContent = { personId, type, entries: toContactEntries(result.entries) };
      return {
        content: [{ type: 'text', text: `Marked "${value}" as ${personName(person)}'s primary ${type}.` }],
        structuredContent,
      };
    },
  );

  server.registerTool(
    'remove-contact-entry',
    {
      description:
        "Removes one of a person's email addresses or phone numbers. A removed email that synced mail references reverts to unlinked (mail untouched); an unreferenced one is deleted. If the removed entry was primary and others remain, one is promoted automatically.",
      inputSchema: { personId: z.number().int().positive(), type: z.enum(['email', 'phone']), entryId: z.number().int().positive() },
      outputSchema: contactMutationOutputSchema,
    },
    async ({ personId, type, entryId }) => {
      const person = getPerson(context.db, context.personFields, personId);
      const removedValue = (type === 'email' ? person?.emails : person?.phones)?.find((entry) => entry.id === entryId)?.value;

      const result = removeEntry(context.db, tableFor(type), personId, entryId);
      if (!result.ok) {
        if (result.error === 'person-not-found') {
          return toolError(`Person ${personId} not found`);
        }
        return toolError(`Entry ${entryId} not found`);
      }

      const structuredContent = { personId, type, entries: toContactEntries(result.entries) };
      return {
        content: [{ type: 'text', text: `Removed ${type} "${removedValue}" from ${personName(person!)}.` }],
        structuredContent,
      };
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
      description:
        'Pulls messages for a date range (inclusive, server-local timezone) from every mailbox folder except Junk, Deleted Items, and Drafts into the store, refreshing already-stored messages it re-encounters.',
      inputSchema: { startDate: z.string().optional(), endDate: z.string().optional() },
      outputSchema: {
        status: z.enum(['complete', 'interrupted']),
        syncedCount: z.number(),
        updatedCount: z.number(),
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

      const outcome = await context.syncCoordinator.trigger({ startDate, endDate, window, source: 'mcp', provider: context.mailProvider });
      if (outcome.kind === 'already-running') {
        return toolError('A sync is already running');
      }

      const { run } = outcome;
      if (run.status === 'failure' && run.newCount === 0 && run.updatedCount === 0) {
        return toolError(`Could not reach the mailbox (${run.error}) — connect the mailbox on the Sync page.`);
      }

      const status = run.status === 'success' ? 'complete' : 'interrupted';
      const text =
        status === 'complete'
          ? `Synced ${run.newCount} email(s).`
          : `Sync interrupted after storing ${run.newCount} email(s): ${run.error}`;
      const structuredContent = { status, syncedCount: run.newCount, updatedCount: run.updatedCount, error: run.error ?? undefined };
      return { content: [{ type: 'text', text }], structuredContent };
    },
  );

  const personRefSchema = z.object({ id: z.number(), name: z.string() }).nullable();

  const conversationParticipantSummarySchema = z.object({
    address: z.string(),
    displayName: z.string(),
    person: personRefSchema,
  });

  const conversationSummarySchema = {
    id: z.number(),
    subject: z.string(),
    messageCount: z.number(),
    latestMessageAt: z.number(),
    hasUnread: z.boolean(),
    hasAttachments: z.boolean(),
    participants: z.array(conversationParticipantSummarySchema),
  };

  const participantSchema = z.object({
    address: z.string(),
    displayName: z.string(),
    role: z.enum(['from', 'to', 'cc', 'bcc']),
    person: personRefSchema,
  });

  const attachmentSchema = z.object({
    name: z.string(),
    contentType: z.string().nullable(),
    sizeBytes: z.number(),
  });

  const conversationMessageSchema = z.object({
    id: z.number(),
    subject: z.string(),
    sentAt: z.number(),
    receivedAt: z.number(),
    bodyText: z.string(),
    sourceFolder: z.string(),
    isRead: z.boolean(),
    importance: z.enum(['low', 'normal', 'high']),
    flagStatus: z.enum(['notFlagged', 'complete', 'flagged']),
    categories: z.array(z.string()),
    webLink: z.string(),
    internetMessageId: z.string(),
    attachments: z.array(attachmentSchema),
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
            receivedAt: z.number(),
            sourceFolder: z.string(),
            isRead: z.boolean(),
            importance: z.enum(['low', 'normal', 'high']),
            flagStatus: z.enum(['notFlagged', 'complete', 'flagged']),
            categories: z.array(z.string()),
            webLink: z.string(),
            internetMessageId: z.string(),
            attachments: z.array(attachmentSchema),
            addresses: z.array(z.object({ address: z.string(), role: z.enum(['from', 'to', 'cc', 'bcc']), displayName: z.string() })),
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

  server.registerTool(
    'list-unlinked-addresses',
    {
      description:
        'Lists every synced-mail address linked to no person — complete, unsuppressed, and computed live — with its message count, most recently seen display name, and most recent message date, ordered by message count descending.',
      outputSchema: {
        addresses: z.array(
          z.object({
            address: z.string(),
            messageCount: z.number(),
            displayName: z.string(),
            lastMessageAt: z.number(),
          }),
        ),
      },
    },
    async () => {
      const addresses = listUnlinkedAddresses(context.db);
      return {
        content: [{ type: 'text', text: `Found ${addresses.length} unlinked address(es).` }],
        structuredContent: { addresses },
      };
    },
  );

  const eventSummarySchema = {
    id: z.number(),
    subject: z.string(),
    startAt: z.number(),
    endAt: z.number(),
    isAllDay: z.boolean(),
    isCancelled: z.boolean(),
    location: z.string(),
    seriesId: z.string().nullable(),
  };

  server.registerTool(
    'list-events',
    {
      description:
        'Lists stored calendar events overlapping an inclusive date range (server-local days), ascending by start time; cancelled events are included and flagged.',
      inputSchema: { startDate: z.string().optional(), endDate: z.string().optional() },
      outputSchema: { events: z.array(z.object(eventSummarySchema)) },
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

      const events = listEvents(context.db, window);
      return { content: [{ type: 'text', text: `Found ${events.length} event(s).` }], structuredContent: { events } };
    },
  );

  return server;
}
