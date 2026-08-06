import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  lane: text('lane').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    extraFields: text('extra_fields', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('people_email_unique').on(sql`lower(${t.email})`).where(sql`${t.email} IS NOT NULL`)],
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
