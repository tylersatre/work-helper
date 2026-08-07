import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createPersonInputSchema, updatePersonInputSchema } from '../../shared/validation.js';
import { people, personEmails, personPhones } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;
type PersonRow = typeof people.$inferSelect;
type EntryTable = typeof personEmails | typeof personPhones;

export interface ContactEntry {
  id: number;
  value: string;
  isPrimary: boolean;
  createdAt: number;
}

export interface PersonRecord {
  id: number;
  firstName: string;
  lastName: string;
  emails: ContactEntry[];
  phones: ContactEntry[];
  extraFields: Record<string, string>;
  createdAt: number;
}

export type CreatePersonResult =
  | { ok: true; person: PersonRecord }
  | { ok: false; error: 'email-conflict' | 'phone-conflict' };

function emailConflictExists(db: AppDb, email: string, excludeId?: number): boolean {
  const conditions = [sql`lower(${personEmails.value}) = lower(${email})`];
  if (excludeId !== undefined) {
    conditions.push(ne(personEmails.id, excludeId));
  }
  const [row] = db
    .select({ id: personEmails.id })
    .from(personEmails)
    .where(and(...conditions))
    .limit(1)
    .all();
  return row !== undefined;
}

function phoneConflictExists(db: AppDb, phone: string, excludeId?: number): boolean {
  const conditions = [eq(personPhones.value, phone)];
  if (excludeId !== undefined) {
    conditions.push(ne(personPhones.id, excludeId));
  }
  const [row] = db
    .select({ id: personPhones.id })
    .from(personPhones)
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

function loadEntries(db: AppDb, table: EntryTable, personId: number): ContactEntry[] {
  return db
    .select({ id: table.id, value: table.value, isPrimary: table.isPrimary, createdAt: table.createdAt })
    .from(table)
    .where(eq(table.personId, personId))
    .orderBy(asc(table.id))
    .all();
}

function toPersonRecord(db: AppDb, row: PersonRow, personFields: string[]): PersonRecord {
  const allowed = new Set(personFields);
  const extraFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.extraFields)) {
    if (allowed.has(key)) {
      extraFields[key] = value;
    }
  }
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    emails: loadEntries(db, personEmails, row.id),
    phones: loadEntries(db, personPhones, row.id),
    extraFields,
    createdAt: row.createdAt,
  };
}

export function createPerson(db: AppDb, personFields: string[], rawInput: unknown): CreatePersonResult {
  const input = createPersonInputSchema.parse(rawInput);

  if (input.email !== null && emailConflictExists(db, input.email)) {
    return { ok: false, error: 'email-conflict' };
  }
  if (input.phone !== null && phoneConflictExists(db, input.phone)) {
    return { ok: false, error: 'phone-conflict' };
  }

  const personId = db.transaction((tx) => {
    const [created] = tx
      .insert(people)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        extraFields: normalizeExtraFields(input.extraFields, personFields),
        createdAt: Date.now(),
      })
      .returning()
      .all();

    const createdAt = Date.now();
    if (input.email !== null) {
      tx.insert(personEmails).values({ personId: created!.id, value: input.email, isPrimary: true, createdAt }).run();
    }
    if (input.phone !== null) {
      tx.insert(personPhones).values({ personId: created!.id, value: input.phone, isPrimary: true, createdAt }).run();
    }

    return created!.id;
  });

  const [row] = db.select().from(people).where(eq(people.id, personId)).limit(1).all();
  return { ok: true, person: toPersonRecord(db, row!, personFields) };
}

export function listPeople(db: AppDb, personFields: string[], q?: string) {
  const trimmed = q?.trim();

  const primaryEmail = db
    .select({ personId: personEmails.personId, value: personEmails.value })
    .from(personEmails)
    .where(eq(personEmails.isPrimary, true))
    .as('primary_email');

  const query = db
    .select({ person: people })
    .from(people)
    .leftJoin(primaryEmail, eq(primaryEmail.personId, people.id));

  const filtered = trimmed
    ? query.where(
        sql`instr(lower(${people.firstName}), lower(${trimmed})) > 0 OR instr(lower(${people.lastName}), lower(${trimmed})) > 0 OR instr(lower(coalesce(${primaryEmail.value}, '')), lower(${trimmed})) > 0`,
      )
    : query;

  return filtered
    .orderBy(asc(sql`${people.lastName} COLLATE NOCASE`), asc(sql`${people.firstName} COLLATE NOCASE`))
    .all()
    .map((row) => toPersonRecord(db, row.person, personFields));
}

export function getPerson(db: AppDb, personFields: string[], id: number): PersonRecord | undefined {
  const [row] = db.select().from(people).where(eq(people.id, id)).limit(1).all();
  return row ? toPersonRecord(db, row, personFields) : undefined;
}

function personExists(db: AppDb, id: number): boolean {
  const [row] = db.select({ id: people.id }).from(people).where(eq(people.id, id)).limit(1).all();
  return row !== undefined;
}

export type UpdatePersonResult = { ok: true; person: PersonRecord } | { ok: false; error: 'not-found' };

export function updatePerson(db: AppDb, personFields: string[], id: number, rawInput: unknown): UpdatePersonResult {
  const input = updatePersonInputSchema.parse(rawInput);

  if (!personExists(db, id)) {
    return { ok: false, error: 'not-found' };
  }

  db.update(people)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      extraFields: normalizeExtraFields(input.extraFields, personFields),
    })
    .where(eq(people.id, id))
    .run();

  const [updated] = db.select().from(people).where(eq(people.id, id)).limit(1).all();
  return { ok: true, person: toPersonRecord(db, updated!, personFields) };
}

export type DeletePersonResult = { ok: true } | { ok: false; error: 'not-found' };

export function deletePerson(db: AppDb, id: number): DeletePersonResult {
  if (!personExists(db, id)) {
    return { ok: false, error: 'not-found' };
  }

  db.delete(people).where(eq(people.id, id)).run();

  return { ok: true };
}
