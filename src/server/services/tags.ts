import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { nextTagColor } from '../../shared/tag-palette.js';
import { tagColorSchema, tagNameSchema } from '../../shared/validation.js';
import { companyTags, people, personTags, tags, taskTags, tasks } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface TagRecord {
  id: number;
  name: string;
  color: string;
}

export interface TagWithCountsRecord extends TagRecord {
  peopleCount: number;
  tasksCount: number;
}

function lastCreatedTagColor(db: AppDb): string | null {
  const [row] = db.select({ color: tags.color }).from(tags).orderBy(desc(tags.id)).limit(1).all();
  return row?.color ?? null;
}

function findTagByNameCaseInsensitive(db: AppDb, name: string, excludeId?: number) {
  const conditions = [sql`lower(${tags.name}) = lower(${name})`];
  if (excludeId !== undefined) {
    conditions.push(ne(tags.id, excludeId));
  }
  const [row] = db
    .select()
    .from(tags)
    .where(and(...conditions))
    .limit(1)
    .all();
  return row;
}

export type CreateTagResult = { ok: true; tag: TagRecord } | { ok: false; error: 'name-taken' | 'invalid-color' };

export function createTag(db: AppDb, rawName: unknown, rawColor?: unknown): CreateTagResult {
  const name = tagNameSchema.parse(rawName);

  const existing = findTagByNameCaseInsensitive(db, name);
  if (existing) {
    return { ok: false, error: 'name-taken' };
  }

  let color: string;
  if (rawColor === undefined) {
    color = nextTagColor(lastCreatedTagColor(db));
  } else {
    const result = tagColorSchema.safeParse(rawColor);
    if (!result.success) {
      return { ok: false, error: 'invalid-color' };
    }
    color = result.data;
  }

  const [created] = db
    .insert(tags)
    .values({ name, color, createdAt: Date.now() })
    .returning({ id: tags.id, name: tags.name, color: tags.color })
    .all();

  return { ok: true, tag: created! };
}

export function listTags(db: AppDb): TagWithCountsRecord[] {
  const peopleCount = sql<number>`(select count(*) from ${personTags} where ${personTags.tagId} = ${tags.id})`;
  const tasksCount = sql<number>`(select count(*) from ${taskTags} where ${taskTags.tagId} = ${tags.id})`;

  return db
    .select({ id: tags.id, name: tags.name, color: tags.color, peopleCount, tasksCount })
    .from(tags)
    .orderBy(desc(sql`${peopleCount} + ${tasksCount}`), asc(sql`${tags.name} COLLATE NOCASE`))
    .all();
}

function getTagsForRecord(
  db: AppDb,
  joinTable: typeof personTags | typeof taskTags | typeof companyTags,
  idColumn: typeof personTags.personId | typeof taskTags.taskId | typeof companyTags.companyId,
  recordId: number,
): TagRecord[] {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(joinTable)
    .innerJoin(tags, eq(joinTable.tagId, tags.id))
    .where(eq(idColumn, recordId))
    .orderBy(asc(sql`${tags.name} COLLATE NOCASE`))
    .all();
}

export function getTagsForPerson(db: AppDb, personId: number): TagRecord[] {
  return getTagsForRecord(db, personTags, personTags.personId, personId);
}

export function getTagsForTask(db: AppDb, taskId: number): TagRecord[] {
  return getTagsForRecord(db, taskTags, taskTags.taskId, taskId);
}

export function getTagsForCompany(db: AppDb, companyId: number): TagRecord[] {
  return getTagsForRecord(db, companyTags, companyTags.companyId, companyId);
}

export type AttachInput = { tagId: number } | { name: unknown };

export type AttachResult = { ok: true; tags: TagRecord[] } | { ok: false; error: 'record-not-found' | 'tag-not-found' | 'invalid-name' };

export function resolveOrCreateTag(db: AppDb, input: AttachInput): { ok: true; tagId: number } | { ok: false; error: 'tag-not-found' | 'invalid-name' } {
  if ('tagId' in input) {
    const [row] = db.select({ id: tags.id }).from(tags).where(eq(tags.id, input.tagId)).limit(1).all();
    if (!row) {
      return { ok: false, error: 'tag-not-found' };
    }
    return { ok: true, tagId: row.id };
  }

  let name: string;
  try {
    name = tagNameSchema.parse(input.name);
  } catch {
    return { ok: false, error: 'invalid-name' };
  }

  const existing = findTagByNameCaseInsensitive(db, name);
  if (existing) {
    return { ok: true, tagId: existing.id };
  }

  const color = nextTagColor(lastCreatedTagColor(db));
  const [created] = db.insert(tags).values({ name, color, createdAt: Date.now() }).returning().all();
  return { ok: true, tagId: created!.id };
}

export function attachTagToPerson(db: AppDb, personId: number, input: AttachInput): AttachResult {
  const [person] = db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1).all();
  if (!person) {
    return { ok: false, error: 'record-not-found' };
  }

  const resolved = db.transaction((tx) => {
    const result = resolveOrCreateTag(tx, input);
    if (result.ok) {
      tx.insert(personTags).values({ personId, tagId: result.tagId }).onConflictDoNothing().run();
    }
    return result;
  });
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return { ok: true, tags: getTagsForPerson(db, personId) };
}

export function attachTagToTask(db: AppDb, taskId: number, input: AttachInput): AttachResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'record-not-found' };
  }

  const resolved = db.transaction((tx) => {
    const result = resolveOrCreateTag(tx, input);
    if (result.ok) {
      tx.insert(taskTags).values({ taskId, tagId: result.tagId }).onConflictDoNothing().run();
    }
    return result;
  });
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return { ok: true, tags: getTagsForTask(db, taskId) };
}

export type DetachResult = { ok: true; tags: TagRecord[] } | { ok: false; error: 'record-not-found' };

export function detachTagFromPerson(db: AppDb, personId: number, tagId: number): DetachResult {
  const [person] = db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1).all();
  if (!person) {
    return { ok: false, error: 'record-not-found' };
  }

  db.delete(personTags)
    .where(and(eq(personTags.personId, personId), eq(personTags.tagId, tagId)))
    .run();

  return { ok: true, tags: getTagsForPerson(db, personId) };
}

export function detachTagFromTask(db: AppDb, taskId: number, tagId: number): DetachResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'record-not-found' };
  }

  db.delete(taskTags)
    .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
    .run();

  return { ok: true, tags: getTagsForTask(db, taskId) };
}

export type UpdateTagResult =
  | { ok: true; tag: TagRecord }
  | { ok: false; error: 'not-found' | 'name-taken' | 'invalid-name' | 'invalid-color' | 'nothing-to-update' };

export function updateTag(db: AppDb, id: number, input: { name?: unknown; color?: unknown }): UpdateTagResult {
  const hasName = input.name !== undefined;
  const hasColor = input.color !== undefined;
  if (!hasName && !hasColor) {
    return { ok: false, error: 'nothing-to-update' };
  }

  const [existing] = db.select({ id: tags.id }).from(tags).where(eq(tags.id, id)).limit(1).all();
  if (!existing) {
    return { ok: false, error: 'not-found' };
  }

  const updates: { name?: string; color?: string } = {};

  if (hasName) {
    let name: string;
    try {
      name = tagNameSchema.parse(input.name);
    } catch {
      return { ok: false, error: 'invalid-name' };
    }
    const duplicate = findTagByNameCaseInsensitive(db, name, id);
    if (duplicate) {
      return { ok: false, error: 'name-taken' };
    }
    updates.name = name;
  }

  if (hasColor) {
    let color: string;
    try {
      color = tagColorSchema.parse(input.color);
    } catch {
      return { ok: false, error: 'invalid-color' };
    }
    updates.color = color;
  }

  db.update(tags).set(updates).where(eq(tags.id, id)).run();
  const [updated] = db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.id, id)).limit(1).all();
  return { ok: true, tag: updated! };
}

export type DeleteTagResult = { ok: true } | { ok: false; error: 'not-found' };

export function deleteTag(db: AppDb, id: number): DeleteTagResult {
  const [existing] = db.select({ id: tags.id }).from(tags).where(eq(tags.id, id)).limit(1).all();
  if (!existing) {
    return { ok: false, error: 'not-found' };
  }

  db.delete(tags).where(eq(tags.id, id)).run();

  return { ok: true };
}

export type TagIdentifier = { tagId: number } | { tagName: unknown };

export type ResolveTagResult = { ok: true; tag: TagRecord } | { ok: false; error: 'tag-not-found' | 'invalid-name' };

export function resolveExistingTag(db: AppDb, input: TagIdentifier): ResolveTagResult {
  if ('tagId' in input) {
    const [row] = db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.id, input.tagId)).limit(1).all();
    if (!row) {
      return { ok: false, error: 'tag-not-found' };
    }
    return { ok: true, tag: row };
  }

  const parsed = tagNameSchema.safeParse(input.tagName);
  if (!parsed.success) {
    return { ok: false, error: 'invalid-name' };
  }

  const existing = findTagByNameCaseInsensitive(db, parsed.data);
  if (!existing) {
    return { ok: false, error: 'tag-not-found' };
  }
  return { ok: true, tag: { id: existing.id, name: existing.name, color: existing.color } };
}

export type DeleteTagByIdentifierResult =
  | { ok: true; name: string; peopleDetached: number; tasksDetached: number; companiesDetached: number }
  | { ok: false; error: 'tag-not-found' | 'invalid-name' };

export function deleteTagByIdentifier(db: AppDb, input: TagIdentifier): DeleteTagByIdentifierResult {
  const resolved = resolveExistingTag(db, input);
  if (!resolved.ok) {
    return resolved;
  }

  const [{ peopleDetached }] = db
    .select({ peopleDetached: sql<number>`count(*)` })
    .from(personTags)
    .where(eq(personTags.tagId, resolved.tag.id))
    .all();
  const [{ tasksDetached }] = db
    .select({ tasksDetached: sql<number>`count(*)` })
    .from(taskTags)
    .where(eq(taskTags.tagId, resolved.tag.id))
    .all();
  const [{ companiesDetached }] = db
    .select({ companiesDetached: sql<number>`count(*)` })
    .from(companyTags)
    .where(eq(companyTags.tagId, resolved.tag.id))
    .all();

  db.delete(tags).where(eq(tags.id, resolved.tag.id)).run();

  return { ok: true, name: resolved.tag.name, peopleDetached, tasksDetached, companiesDetached };
}

export type AttachExistingResult = { ok: true; tags: TagRecord[] } | { ok: false; error: 'record-not-found' };

export function attachExistingTagToTask(db: AppDb, taskId: number, tagId: number): AttachExistingResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'record-not-found' };
  }

  db.insert(taskTags).values({ taskId, tagId }).onConflictDoNothing().run();
  return { ok: true, tags: getTagsForTask(db, taskId) };
}

export function attachExistingTagToPerson(db: AppDb, personId: number, tagId: number): AttachExistingResult {
  const [person] = db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1).all();
  if (!person) {
    return { ok: false, error: 'record-not-found' };
  }

  db.insert(personTags).values({ personId, tagId }).onConflictDoNothing().run();
  return { ok: true, tags: getTagsForPerson(db, personId) };
}
