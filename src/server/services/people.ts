import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { personInputSchema } from '../../shared/validation.js';
import { people } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;
type PersonRow = typeof people.$inferSelect;

export type CreatePersonResult = { ok: true; person: PersonRow } | { ok: false; error: 'conflict' };

function emailConflictExists(db: AppDb, email: string, excludeId?: number): boolean {
  const conditions = [sql`lower(${people.email}) = lower(${email})`];
  if (excludeId !== undefined) {
    conditions.push(ne(people.id, excludeId));
  }
  const [row] = db
    .select({ id: people.id })
    .from(people)
    .where(and(...conditions))
    .limit(1)
    .all();
  return row !== undefined;
}

function normalizeExtraFields(raw: Record<string, string> | undefined, personFields: string[]): Record<string, string> {
  const allowed = new Set(personFields);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!allowed.has(key)) continue;
    const trimmed = value.trim();
    if (trimmed === '') continue;
    result[key] = trimmed;
  }
  return result;
}

function projectExtraFields(row: PersonRow, personFields: string[]): PersonRow {
  const allowed = new Set(personFields);
  const projected: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.extraFields)) {
    if (allowed.has(key)) {
      projected[key] = value;
    }
  }
  return { ...row, extraFields: projected };
}

export function createPerson(db: AppDb, personFields: string[], rawInput: unknown): CreatePersonResult {
  const input = personInputSchema.parse(rawInput);

  if (input.email !== null && emailConflictExists(db, input.email)) {
    return { ok: false, error: 'conflict' };
  }

  const [created] = db
    .insert(people)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      extraFields: normalizeExtraFields(input.extraFields, personFields),
      createdAt: Date.now(),
    })
    .returning()
    .all();

  return { ok: true, person: projectExtraFields(created!, personFields) };
}

export function listPeople(db: AppDb, personFields: string[], q?: string) {
  const trimmed = q?.trim();

  const query = db.select().from(people);
  const filtered = trimmed
    ? query.where(
        sql`instr(lower(${people.firstName}), lower(${trimmed})) > 0 OR instr(lower(${people.lastName}), lower(${trimmed})) > 0 OR instr(lower(coalesce(${people.email}, '')), lower(${trimmed})) > 0`,
      )
    : query;

  return filtered
    .orderBy(asc(sql`${people.lastName} COLLATE NOCASE`), asc(sql`${people.firstName} COLLATE NOCASE`))
    .all()
    .map((row) => projectExtraFields(row, personFields));
}

export function getPerson(db: AppDb, personFields: string[], id: number): PersonRow | undefined {
  const [row] = db.select().from(people).where(eq(people.id, id)).limit(1).all();
  return row ? projectExtraFields(row, personFields) : undefined;
}

function personExists(db: AppDb, id: number): boolean {
  const [row] = db.select({ id: people.id }).from(people).where(eq(people.id, id)).limit(1).all();
  return row !== undefined;
}

export type UpdatePersonResult = { ok: true; person: PersonRow } | { ok: false; error: 'conflict' } | { ok: false; error: 'not-found' };

export function updatePerson(db: AppDb, personFields: string[], id: number, rawInput: unknown): UpdatePersonResult {
  const input = personInputSchema.parse(rawInput);

  if (!personExists(db, id)) {
    return { ok: false, error: 'not-found' };
  }

  if (input.email !== null && emailConflictExists(db, input.email, id)) {
    return { ok: false, error: 'conflict' };
  }

  const [updated] = db
    .update(people)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      extraFields: normalizeExtraFields(input.extraFields, personFields),
    })
    .where(eq(people.id, id))
    .returning()
    .all();

  return { ok: true, person: projectExtraFields(updated!, personFields) };
}

export type DeletePersonResult = { ok: true } | { ok: false; error: 'not-found' };

export function deletePerson(db: AppDb, id: number): DeletePersonResult {
  if (!personExists(db, id)) {
    return { ok: false, error: 'not-found' };
  }

  db.delete(people).where(eq(people.id, id)).run();

  return { ok: true };
}
