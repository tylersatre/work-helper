import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TaskEffort, TaskPriority } from '../../shared/types.js';
import { noteTextSchema, taskEffortSchema, taskPrioritySchema, titleSchema } from '../../shared/validation.js';
import { companies, people, emailAddresses, personPhones, tags as tagsTable, taskCompanies, taskNotes, taskPeople, taskTags, tasks } from '../db/schema.js';
import { conversationsForTask } from './task-conversations.js';
import { getTagsForTask, type TagRecord } from './tags.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export class InvalidLaneError extends Error {
  constructor(public lane: string) {
    super(`Invalid lane: ${lane}`);
  }
}

function blankToNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function createTask(
  db: AppDb,
  lanes: string[],
  rawTitle: unknown,
  rawNote?: unknown,
  source: 'ui' | 'mcp' = 'ui',
  rawLane?: string,
  rawFields?: { dueDate?: unknown; priority?: unknown; effort?: unknown; description?: unknown },
) {
  const title = titleSchema.parse(rawTitle);
  const targetLane = rawLane === undefined ? lanes[0]! : rawLane;
  if (!lanes.includes(targetLane)) {
    throw new InvalidLaneError(targetLane);
  }
  const createdAt = Date.now();

  const trimmedNote = typeof rawNote === 'string' ? rawNote.trim() : '';

  const dueDate = blankToNull(rawFields?.dueDate);
  const description = blankToNull(rawFields?.description);
  const rawPriority = blankToNull(rawFields?.priority);
  const priority = rawPriority === null ? null : taskPrioritySchema.parse(rawPriority);
  const rawEffort = blankToNull(rawFields?.effort);
  const effort = rawEffort === null ? null : taskEffortSchema.parse(rawEffort);

  return db.transaction((tx) => {
    const [{ maxPosition } = { maxPosition: null }] = tx
      .select({ maxPosition: sql<number | null>`max(${tasks.position})` })
      .from(tasks)
      .where(eq(tasks.lane, targetLane))
      .all();
    const position = maxPosition === null ? 0 : maxPosition + 1;

    const [created] = tx
      .insert(tasks)
      .values({ title, lane: targetLane, position, createdAt, dueDate, priority, effort, description })
      .returning()
      .all();

    if (trimmedNote !== '') {
      tx.insert(taskNotes).values({ taskId: created!.id, text: rawNote as string, source, createdAt }).run();
    }

    return created!;
  });
}

export function listTasksByLane(db: AppDb, lane: string) {
  return db.select().from(tasks).where(eq(tasks.lane, lane)).orderBy(asc(tasks.position), asc(tasks.id)).all();
}

export function groupByTaskId<T extends { taskId: number }>(rows: T[]): Map<number, T[]> {
  const byTaskId = new Map<number, T[]>();
  for (const row of rows) {
    const list = byTaskId.get(row.taskId);
    if (list) {
      list.push(row);
    } else {
      byTaskId.set(row.taskId, [row]);
    }
  }
  return byTaskId;
}

export function listBoardTasksByLane(db: AppDb, lane: string) {
  const laneTasks = listTasksByLane(db, lane);
  if (laneTasks.length === 0) {
    return [];
  }
  const taskIds = laneTasks.map((task) => task.id);

  const notesByTask = groupByTaskId(
    db.select({ taskId: taskNotes.taskId, text: taskNotes.text }).from(taskNotes).where(inArray(taskNotes.taskId, taskIds)).all(),
  );

  const peopleByTask = groupByTaskId(
    db
      .select({ taskId: taskPeople.taskId, firstName: people.firstName, lastName: people.lastName })
      .from(taskPeople)
      .innerJoin(people, eq(taskPeople.personId, people.id))
      .where(inArray(taskPeople.taskId, taskIds))
      .all(),
  );

  const companiesByTask = groupByTaskId(
    db
      .select({ taskId: taskCompanies.taskId, name: companies.name })
      .from(taskCompanies)
      .innerJoin(companies, eq(taskCompanies.companyId, companies.id))
      .where(inArray(taskCompanies.taskId, taskIds))
      .all(),
  );

  const tagsByTask = groupByTaskId(
    db
      .select({ taskId: taskTags.taskId, id: tagsTable.id, name: tagsTable.name, color: tagsTable.color })
      .from(taskTags)
      .innerJoin(tagsTable, eq(taskTags.tagId, tagsTable.id))
      .where(inArray(taskTags.taskId, taskIds))
      .orderBy(asc(sql`${tagsTable.name} COLLATE NOCASE`))
      .all(),
  );

  return laneTasks.map((task) => {
    const noteTexts = (notesByTask.get(task.id) ?? []).map((row) => row.text);
    const personNames = (peopleByTask.get(task.id) ?? []).map((row) => `${row.firstName} ${row.lastName}`.trim());
    const companyNames = (companiesByTask.get(task.id) ?? []).map((row) => row.name);
    const tags: TagRecord[] = (tagsByTask.get(task.id) ?? []).map(({ id, name, color }) => ({ id, name, color }));
    const searchText = [task.title, ...noteTexts, ...personNames, ...companyNames].join('\n').toLowerCase();

    return { ...task, tags, searchText };
  });
}

export type MoveTaskResult =
  | { ok: true; task: typeof tasks.$inferSelect }
  | { ok: false; error: 'task-not-found' | 'invalid-lane' };

export function moveTask(db: AppDb, lanes: string[], taskId: number, targetLane: string, targetIndex: number): MoveTaskResult {
  return db.transaction((tx) => {
    const [task] = tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
    if (!task) {
      return { ok: false, error: 'task-not-found' };
    }
    if (!lanes.includes(targetLane)) {
      return { ok: false, error: 'invalid-lane' };
    }

    const sourceLane = task.lane;

    const destinationIds = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.lane, targetLane), ne(tasks.id, taskId)))
      .orderBy(asc(tasks.position), asc(tasks.id))
      .all()
      .map((row) => row.id);

    const clampedIndex = Math.max(0, Math.min(targetIndex, destinationIds.length));
    destinationIds.splice(clampedIndex, 0, taskId);

    destinationIds.forEach((id, position) => {
      tx.update(tasks).set({ lane: targetLane, position }).where(eq(tasks.id, id)).run();
    });

    if (sourceLane !== targetLane) {
      const sourceIds = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.lane, sourceLane))
        .orderBy(asc(tasks.position), asc(tasks.id))
        .all()
        .map((row) => row.id);

      sourceIds.forEach((id, position) => {
        tx.update(tasks).set({ position }).where(eq(tasks.id, id)).run();
      });
    }

    const [updated] = tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
    return { ok: true, task: updated! };
  });
}

export function getTaskDetail(db: AppDb, id: number) {
  const [task] = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
  if (!task) {
    return undefined;
  }

  const primaryEmail = db
    .select({ personId: emailAddresses.personId, value: emailAddresses.value })
    .from(emailAddresses)
    .where(eq(emailAddresses.isPrimary, true))
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

  const linkedCompanies = db
    .select({ id: companies.id, name: companies.name })
    .from(taskCompanies)
    .innerJoin(companies, eq(taskCompanies.companyId, companies.id))
    .where(eq(taskCompanies.taskId, id))
    .orderBy(asc(sql`${companies.name} COLLATE NOCASE`))
    .all();

  return {
    ...task,
    people: linkedPeople,
    notes,
    tags: getTagsForTask(db, id),
    companies: linkedCompanies,
    conversations: conversationsForTask(db, id),
  };
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

export type DeleteNoteByIdResult = { ok: true; taskId: number } | { ok: false; error: 'note-not-found' };

export function deleteNoteById(db: AppDb, noteId: number): DeleteNoteByIdResult {
  const [note] = db.select({ id: taskNotes.id, taskId: taskNotes.taskId }).from(taskNotes).where(eq(taskNotes.id, noteId)).limit(1).all();
  if (!note) {
    return { ok: false, error: 'note-not-found' };
  }

  db.delete(taskNotes).where(eq(taskNotes.id, noteId)).run();

  return { ok: true, taskId: note.taskId };
}

export type UpdateTaskInput = {
  title?: string;
  dueDate?: string | null;
  priority?: TaskPriority | null;
  effort?: TaskEffort | null;
  description?: string | null;
};

export type UpdateTaskResult = { ok: true; task: typeof tasks.$inferSelect } | { ok: false; error: 'task-not-found' | 'invalid-title' };

export function updateTask(db: AppDb, taskId: number, input: UpdateTaskInput): UpdateTaskResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  const patch: Partial<typeof tasks.$inferInsert> = {};

  if (input.title !== undefined) {
    const result = titleSchema.safeParse(input.title);
    if (!result.success) {
      return { ok: false, error: 'invalid-title' };
    }
    patch.title = result.data;
  }
  if ('dueDate' in input) patch.dueDate = blankToNull(input.dueDate);
  if ('priority' in input) patch.priority = input.priority;
  if ('effort' in input) patch.effort = input.effort;
  if ('description' in input) patch.description = blankToNull(input.description);

  if (Object.keys(patch).length > 0) {
    db.update(tasks).set(patch).where(eq(tasks.id, taskId)).run();
  }
  const [updated] = db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  return { ok: true, task: updated! };
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

export type DeleteTaskResult = { ok: true } | { ok: false; error: 'task-not-found' };

export function deleteTask(db: AppDb, id: number): DeleteTaskResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  db.delete(tasks).where(eq(tasks.id, id)).run();

  return { ok: true };
}

export type ArchiveTaskResult = { ok: true; task: typeof tasks.$inferSelect } | { ok: false; error: 'task-not-found' };

export function archiveTask(db: AppDb, id: number): ArchiveTaskResult {
  const [task] = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }
  if (task.archived) {
    return { ok: true, task };
  }

  db.update(tasks).set({ archived: true }).where(eq(tasks.id, id)).run();
  const [updated] = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
  return { ok: true, task: updated! };
}

export type UnarchiveTaskResult = { ok: true; task: typeof tasks.$inferSelect } | { ok: false; error: 'task-not-found' };

export function unarchiveTask(db: AppDb, id: number): UnarchiveTaskResult {
  return db.transaction((tx) => {
    const [task] = tx.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
    if (!task) {
      return { ok: false, error: 'task-not-found' };
    }
    if (!task.archived) {
      return { ok: true, task };
    }

    const [{ maxPosition } = { maxPosition: null }] = tx
      .select({ maxPosition: sql<number | null>`max(${tasks.position})` })
      .from(tasks)
      .where(eq(tasks.lane, task.lane))
      .all();
    const position = maxPosition === null ? 0 : maxPosition + 1;

    tx.update(tasks).set({ archived: false, position }).where(eq(tasks.id, id)).run();
    const [updated] = tx.select().from(tasks).where(eq(tasks.id, id)).limit(1).all();
    return { ok: true, task: updated! };
  });
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
