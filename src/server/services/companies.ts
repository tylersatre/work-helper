import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { companyNameSchema } from '../../shared/validation.js';
import { companies, companyTags, people, tasks, taskCompanies } from '../db/schema.js';
import { getTagsForCompany, resolveOrCreateTag, type AttachInput, type TagRecord } from './tags.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export interface CompanyRecord {
  id: number;
  name: string;
}

export interface CompanyDetailRecord extends CompanyRecord {
  people: { id: number; firstName: string; lastName: string }[];
  cards: { id: number; title: string; lane: string }[];
  tags: TagRecord[];
}

function findCompanyByNameCaseInsensitive(db: AppDb, name: string, excludeId?: number) {
  const conditions = [sql`lower(${companies.name}) = lower(${name})`];
  if (excludeId !== undefined) {
    conditions.push(ne(companies.id, excludeId));
  }
  const [row] = db
    .select()
    .from(companies)
    .where(and(...conditions))
    .limit(1)
    .all();
  return row;
}

function companyExists(db: AppDb, id: number): boolean {
  const [row] = db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1).all();
  return row !== undefined;
}

export type CreateCompanyResult = { ok: true; company: CompanyRecord } | { ok: false; error: 'name-taken' };

export function createCompany(db: AppDb, rawName: unknown): CreateCompanyResult {
  const name = companyNameSchema.parse(rawName);

  const existing = findCompanyByNameCaseInsensitive(db, name);
  if (existing) {
    return { ok: false, error: 'name-taken' };
  }

  const [created] = db
    .insert(companies)
    .values({ name, createdAt: Date.now() })
    .returning({ id: companies.id, name: companies.name })
    .all();

  return { ok: true, company: created! };
}

export function listCompanies(db: AppDb, q?: string): CompanyRecord[] {
  const trimmed = q?.trim();
  const query = db.select({ id: companies.id, name: companies.name }).from(companies);
  const filtered = trimmed ? query.where(sql`instr(lower(${companies.name}), lower(${trimmed})) > 0`) : query;
  return filtered.orderBy(asc(sql`${companies.name} COLLATE NOCASE`)).all();
}

export function getCompanyDetail(db: AppDb, id: number): CompanyDetailRecord | undefined {
  const [company] = db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, id)).limit(1).all();
  if (!company) {
    return undefined;
  }

  const linkedPeople = db
    .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
    .from(people)
    .where(eq(people.companyId, id))
    .orderBy(asc(sql`${people.lastName} COLLATE NOCASE`), asc(sql`${people.firstName} COLLATE NOCASE`))
    .all();

  const linkedCards = db
    .select({ id: tasks.id, title: tasks.title, lane: tasks.lane })
    .from(taskCompanies)
    .innerJoin(tasks, eq(taskCompanies.taskId, tasks.id))
    .where(eq(taskCompanies.companyId, id))
    .orderBy(asc(sql`${tasks.title} COLLATE NOCASE`))
    .all();

  return { ...company, people: linkedPeople, cards: linkedCards, tags: getTagsForCompany(db, id) };
}

export type RenameCompanyResult =
  | { ok: true; company: CompanyRecord }
  | { ok: false; error: 'not-found' | 'invalid-name' | 'name-taken' };

export function renameCompany(db: AppDb, id: number, rawName: unknown): RenameCompanyResult {
  if (!companyExists(db, id)) {
    return { ok: false, error: 'not-found' };
  }

  let name: string;
  try {
    name = companyNameSchema.parse(rawName);
  } catch {
    return { ok: false, error: 'invalid-name' };
  }

  const duplicate = findCompanyByNameCaseInsensitive(db, name, id);
  if (duplicate) {
    return { ok: false, error: 'name-taken' };
  }

  db.update(companies).set({ name }).where(eq(companies.id, id)).run();
  const [updated] = db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, id)).limit(1).all();
  return { ok: true, company: updated! };
}

export type LinkCompanyToTaskResult = { ok: true } | { ok: false; error: 'task-not-found' | 'company-not-found' };

export function linkCompanyToTask(db: AppDb, taskId: number, companyId: number): LinkCompanyToTaskResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }
  if (!companyExists(db, companyId)) {
    return { ok: false, error: 'company-not-found' };
  }

  db.insert(taskCompanies).values({ taskId, companyId }).onConflictDoNothing().run();
  return { ok: true };
}

export type UnlinkCompanyFromTaskResult = { ok: true } | { ok: false; error: 'task-not-found' };

export function unlinkCompanyFromTask(db: AppDb, taskId: number, companyId: number): UnlinkCompanyFromTaskResult {
  const [task] = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1).all();
  if (!task) {
    return { ok: false, error: 'task-not-found' };
  }

  db.delete(taskCompanies)
    .where(and(eq(taskCompanies.taskId, taskId), eq(taskCompanies.companyId, companyId)))
    .run();
  return { ok: true };
}

export type AttachTagToCompanyResult =
  | { ok: true; tags: TagRecord[] }
  | { ok: false; error: 'record-not-found' | 'tag-not-found' | 'invalid-name' };

export function attachTagToCompany(db: AppDb, companyId: number, input: AttachInput): AttachTagToCompanyResult {
  if (!companyExists(db, companyId)) {
    return { ok: false, error: 'record-not-found' };
  }

  const resolved = db.transaction((tx) => {
    const result = resolveOrCreateTag(tx, input);
    if (result.ok) {
      tx.insert(companyTags).values({ companyId, tagId: result.tagId }).onConflictDoNothing().run();
    }
    return result;
  });
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return { ok: true, tags: getTagsForCompany(db, companyId) };
}

export type DeleteCompanyResult = { ok: true } | { ok: false; error: 'not-found' };

export function deleteCompany(db: AppDb, id: number): DeleteCompanyResult {
  if (!companyExists(db, id)) {
    return { ok: false, error: 'not-found' };
  }

  db.delete(companies).where(eq(companies.id, id)).run();

  return { ok: true };
}

export type DetachTagFromCompanyResult = { ok: true; tags: TagRecord[] } | { ok: false; error: 'record-not-found' };

export function detachTagFromCompany(db: AppDb, companyId: number, tagId: number): DetachTagFromCompanyResult {
  if (!companyExists(db, companyId)) {
    return { ok: false, error: 'record-not-found' };
  }

  db.delete(companyTags)
    .where(and(eq(companyTags.companyId, companyId), eq(companyTags.tagId, tagId)))
    .run();

  return { ok: true, tags: getTagsForCompany(db, companyId) };
}
