import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  lane: text('lane').notNull(),
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
    sourceFolder: text('source_folder', { enum: ['inbox', 'sent'] }).notNull(),
    subject: text('subject').notNull().default(''),
    bodyOriginal: text('body_original').notNull(),
    bodyContentType: text('body_content_type', { enum: ['html', 'text'] }).notNull(),
    bodyText: text('body_text').notNull(),
    sentAt: integer('sent_at').notNull(),
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
  },
  (t) => [
    uniqueIndex('email_participants_message_address_role_unique').on(t.messageId, t.addressId, t.role),
    index('email_participants_address_id').on(t.addressId),
  ],
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

export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientName: text('client_name'),
  redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
});
