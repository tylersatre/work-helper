import { and, asc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { titleSchema } from '../../shared/validation.js';
import { people, taskPeople, tasks } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export function createTask(db: AppDb, lanes: string[], rawTitle: unknown) {
  const title = titleSchema.parse(rawTitle);
  const firstLane = lanes[0]!;
  const createdAt = Date.now();

  const [created] = db
    .insert(tasks)
    .values({ title, lane: firstLane, createdAt })
    .returning()
    .all();

  return created!;
}

export function listTasksByLane(db: AppDb, lane: string) {
  return db.select().from(tasks).where(eq(tasks.lane, lane)).orderBy(asc(tasks.id)).all();
}

export function getTaskDetail(db: AppDb, id: number) {
  const [task] = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
  if (!task) {
    return undefined;
  }

  const linkedPeople = db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
      extraFields: people.extraFields,
      createdAt: people.createdAt,
    })
    .from(taskPeople)
    .innerJoin(people, eq(taskPeople.personId, people.id))
    .where(eq(taskPeople.taskId, id))
    .orderBy(asc(sql`${people.lastName} COLLATE NOCASE`), asc(sql`${people.firstName} COLLATE NOCASE`))
    .all();

  return { ...task, people: linkedPeople };
}

export type LinkPersonResult =
  | { ok: true; task: NonNullable<ReturnType<typeof getTaskDetail>> }
  | { ok: false; error: 'task-not-found' | 'person-not-found' };

export function linkPerson(db: AppDb, taskId: number, personId: number): LinkPersonResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  const [person] = db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1).all();
  if (!person) {
    return { ok: false, error: 'person-not-found' };
  }

  db.insert(taskPeople).values({ taskId, personId }).onConflictDoNothing().run();

  return { ok: true, task: getTaskDetail(db, taskId)! };
}

export type UnlinkPersonResult = { ok: true; task: NonNullable<ReturnType<typeof getTaskDetail>> } | { ok: false; error: 'task-not-found' };

export function unlinkPerson(db: AppDb, taskId: number, personId: number): UnlinkPersonResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  db.delete(taskPeople)
    .where(and(eq(taskPeople.taskId, taskId), eq(taskPeople.personId, personId)))
    .run();

  return { ok: true, task: getTaskDetail(db, taskId)! };
}
