import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  lane: text('lane').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const people = sqliteTable('people', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  extraFields: text('extra_fields', { mode: 'json' })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
});

export const emailAddresses = sqliteTable(
  'email_addresses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
    value: text('value').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('email_addresses_value_unique').on(sql`lower(${t.value})`),
    uniqueIndex('email_addresses_one_primary').on(t.personId).where(sql`${t.isPrimary} = 1`),
  ],
);

export const emailConversations = sqliteTable(
  'email_conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    graphConversationId: text('graph_conversation_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('email_conversations_graph_id_unique').on(t.graphConversationId)],
);

export const emailMessages = sqliteTable(
  'email_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => emailConversations.id),
    graphMessageId: text('graph_message_id').notNull(),
    sourceFolder: text('source_folder').notNull(),
    subject: text('subject').notNull().default(''),
    bodyOriginal: text('body_original').notNull(),
    bodyContentType: text('body_content_type', { enum: ['html', 'text'] }).notNull(),
    bodyText: text('body_text').notNull(),
    sentAt: integer('sent_at').notNull(),
    receivedAt: integer('received_at').notNull(),
    isRead: integer('is_read', { mode: 'boolean' }).notNull(),
    importance: text('importance', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .default('normal'),
    flagStatus: text('flag_status', { enum: ['notFlagged', 'complete', 'flagged'] })
      .notNull()
      .default('notFlagged'),
    categories: text('categories', { mode: 'json' }).$type<string[]>().notNull().default([]),
    webLink: text('web_link').notNull().default(''),
    internetMessageId: text('internet_message_id').notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('email_messages_graph_id_unique').on(t.graphMessageId),
    index('email_messages_conversation_sent_at').on(t.conversationId, t.sentAt),
    index('email_messages_sent_at').on(t.sentAt),
  ],
);

export const emailParticipants = sqliteTable(
  'email_participants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id')
      .notNull()
      .references(() => emailMessages.id),
    addressId: integer('address_id')
      .notNull()
      .references(() => emailAddresses.id),
    role: text('role', { enum: ['from', 'to', 'cc', 'bcc'] }).notNull(),
    displayName: text('display_name').notNull().default(''),
  },
  (t) => [
    uniqueIndex('email_participants_message_address_role_unique').on(t.messageId, t.addressId, t.role),
    index('email_participants_address_id').on(t.addressId),
  ],
);

export const emailAttachments = sqliteTable(
  'email_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id')
      .notNull()
      .references(() => emailMessages.id),
    name: text('name').notNull(),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes').notNull(),
    isInline: integer('is_inline', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('email_attachments_message_id').on(t.messageId)],
);

export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ranAt: integer('ran_at').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    source: text('source', { enum: ['web', 'mcp'] }).notNull(),
    status: text('status', { enum: ['success', 'failure'] }).notNull(),
    newCount: integer('new_count').notNull(),
    updatedCount: integer('updated_count').notNull(),
    error: text('error'),
  },
  (t) => [index('sync_runs_ran_at').on(t.ranAt)],
);

export const personPhones = sqliteTable(
  'person_phones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('person_phones_value_unique').on(t.value),
    uniqueIndex('person_phones_one_primary').on(t.personId).where(sql`${t.isPrimary} = 1`),
  ],
);

export const taskPeople = sqliteTable(
  'task_people',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.personId] })],
);

export const taskNotes = sqliteTable('task_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  source: text('source', { enum: ['ui', 'mcp'] }).notNull(),
  createdAt: integer('created_at').notNull(),
});

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('tags_name_unique').on(sql`lower(${t.name})`)],
);

export const personTags = sqliteTable(
  'person_tags',
  {
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.personId, t.tagId] })],
);

export const taskTags = sqliteTable(
  'task_tags',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] })],
);

export const companies = sqliteTable(
  'companies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('companies_name_unique').on(sql`lower(${t.name})`)],
);

export const taskCompanies = sqliteTable(
  'task_companies',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.companyId] })],
);

export const companyTags = sqliteTable(
  'company_tags',
  {
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.tagId] })],
);

export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientName: text('client_name'),
  redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
});

export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    graphEventId: text('graph_event_id').notNull(),
    seriesMasterId: text('series_master_id'),
    subject: text('subject').notNull().default(''),
    bodyOriginal: text('body_original').notNull().default(''),
    bodyContentType: text('body_content_type', { enum: ['html', 'text'] }).notNull().default('text'),
    bodyText: text('body_text').notNull().default(''),
    startAt: integer('start_at').notNull(),
    endAt: integer('end_at').notNull(),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    isCancelled: integer('is_cancelled', { mode: 'boolean' }).notNull().default(false),
    location: text('location').notNull().default(''),
    onlineMeetingUrl: text('online_meeting_url').notNull().default(''),
    categories: text('categories', { mode: 'json' }).$type<string[]>().notNull().default([]),
    webLink: text('web_link').notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('calendar_events_graph_id_unique').on(t.graphEventId),
    index('calendar_events_start_at').on(t.startAt),
    index('calendar_events_series_master_id').on(t.seriesMasterId),
  ],
);

export const calendarEventParticipants = sqliteTable(
  'calendar_event_participants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    addressId: integer('address_id')
      .notNull()
      .references(() => emailAddresses.id),
    role: text('role', { enum: ['organizer', 'required', 'optional', 'resource'] }).notNull(),
    responseStatus: text('response_status', { enum: ['none', 'accepted', 'declined', 'tentative'] })
      .notNull()
      .default('none'),
    displayName: text('display_name').notNull().default(''),
  },
  (t) => [
    uniqueIndex('calendar_event_participants_event_address_role_unique').on(t.eventId, t.addressId, t.role),
    index('calendar_event_participants_address_id').on(t.addressId),
  ],
);

export const calendarSyncRuns = sqliteTable(
  'calendar_sync_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ranAt: integer('ran_at').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    source: text('source', { enum: ['web', 'mcp'] }).notNull(),
    status: text('status', { enum: ['success', 'failure'] }).notNull(),
    newCount: integer('new_count').notNull(),
    updatedCount: integer('updated_count').notNull(),
    error: text('error'),
  },
  (t) => [index('calendar_sync_runs_ran_at').on(t.ranAt)],
);
