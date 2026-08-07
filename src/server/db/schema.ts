import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const personEmails = sqliteTable(
  'person_emails',
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
    uniqueIndex('person_emails_value_unique').on(sql`lower(${t.value})`),
    uniqueIndex('person_emails_one_primary').on(t.personId).where(sql`${t.isPrimary} = 1`),
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
