import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { noteTextSchema, titleSchema } from '../../shared/validation.js';
import { people, personEmails, personPhones, taskNotes, taskPeople, tasks } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export function createTask(db: AppDb, lanes: string[], rawTitle: unknown, rawNote?: unknown, source: 'ui' | 'mcp' = 'ui') {
  const title = titleSchema.parse(rawTitle);
  const firstLane = lanes[0]!;
  const createdAt = Date.now();

  const trimmedNote = typeof rawNote === 'string' ? rawNote.trim() : '';

  return db.transaction((tx) => {
    const [created] = tx
      .insert(tasks)
      .values({ title, lane: firstLane, createdAt })
      .returning()
      .all();

    if (trimmedNote !== '') {
      tx.insert(taskNotes).values({ taskId: created!.id, text: rawNote as string, source, createdAt }).run();
    }

    return created!;
  });
}

export function listTasksByLane(db: AppDb, lane: string) {
  return db.select().from(tasks).where(eq(tasks.lane, lane)).orderBy(asc(tasks.id)).all();
}

export function getTaskDetail(db: AppDb, id: number) {
  const [task] = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
  if (!task) {
    return undefined;
  }

  const primaryEmail = db
    .select({ personId: personEmails.personId, value: personEmails.value })
    .from(personEmails)
    .where(eq(personEmails.isPrimary, true))
    .as('primary_email');

  const primaryPhone = db
    .select({ personId: personPhones.personId, value: personPhones.value })
    .from(personPhones)
    .where(eq(personPhones.isPrimary, true))
    .as('primary_phone');

  const linkedPeople = db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: primaryEmail.value,
      phone: primaryPhone.value,
      extraFields: people.extraFields,
      createdAt: people.createdAt,
    })
    .from(taskPeople)
    .innerJoin(people, eq(taskPeople.personId, people.id))
    .leftJoin(primaryEmail, eq(primaryEmail.personId, people.id))
    .leftJoin(primaryPhone, eq(primaryPhone.personId, people.id))
    .where(eq(taskPeople.taskId, id))
    .orderBy(asc(sql`${people.lastName} COLLATE NOCASE`), asc(sql`${people.firstName} COLLATE NOCASE`))
    .all()
    .map((row) => ({ ...row, email: row.email ?? null, phone: row.phone ?? null }));

  const notes = db
    .select()
    .from(taskNotes)
    .where(eq(taskNotes.taskId, id))
    .orderBy(desc(taskNotes.createdAt), desc(taskNotes.id))
    .all();

  return { ...task, people: linkedPeople, notes };
}

export type AddNoteResult = { ok: true; note: typeof taskNotes.$inferSelect } | { ok: false; error: 'task-not-found' | 'invalid-text' };

export function addNote(db: AppDb, taskId: number, rawText: unknown, source: 'ui' | 'mcp' = 'ui'): AddNoteResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  const result = noteTextSchema.safeParse(rawText);
  if (!result.success) {
    return { ok: false, error: 'invalid-text' };
  }

  const [note] = db
    .insert(taskNotes)
    .values({ taskId, text: result.data, source, createdAt: Date.now() })
    .returning()
    .all();

  return { ok: true, note: note! };
}

export type DeleteNoteResult = { ok: true } | { ok: false; error: 'task-not-found' | 'note-not-found' };

export function deleteNote(db: AppDb, taskId: number, noteId: number): DeleteNoteResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  const [note] = db.select({ id: taskNotes.id }).from(taskNotes).where(and(eq(taskNotes.id, noteId), eq(taskNotes.taskId, taskId))).limit(1).all();
  if (!note) {
    return { ok: false, error: 'note-not-found' };
  }

  db.delete(taskNotes).where(eq(taskNotes.id, noteId)).run();

  return { ok: true };
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
