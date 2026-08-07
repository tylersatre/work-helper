import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { entryValueSchema } from '../../shared/validation.js';
import { people, personEmails, type personPhones } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;
export type EntryTable = typeof personEmails | typeof personPhones;

export interface ContactEntry {
  id: number;
  value: string;
  isPrimary: boolean;
  createdAt: number;
}

export type EntryMutationResult =
  | { ok: true; entries: ContactEntry[] }
  | { ok: false; error: 'person-not-found' | 'entry-not-found' | 'conflict' };

function personExists(db: AppDb, personId: number): boolean {
  const [row] = db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1).all();
  return row !== undefined;
}

function conflictExists(db: AppDb, table: EntryTable, value: string, excludeId?: number): boolean {
  const isEmailTable = table === personEmails;
  const conditions = [isEmailTable ? sql`lower(${table.value}) = lower(${value})` : eq(table.value, value)];
  if (excludeId !== undefined) {
    conditions.push(ne(table.id, excludeId));
  }
  const [row] = db
    .select({ id: table.id })
    .from(table)
    .where(and(...conditions))
    .limit(1)
    .all();
  return row !== undefined;
}

function loadEntries(db: AppDb, table: EntryTable, personId: number): ContactEntry[] {
  return db
    .select({ id: table.id, value: table.value, isPrimary: table.isPrimary, createdAt: table.createdAt })
    .from(table)
    .where(eq(table.personId, personId))
    .orderBy(asc(table.id))
    .all();
}

function entryExists(db: AppDb, table: EntryTable, personId: number, entryId: number): boolean {
  const [row] = db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, entryId), eq(table.personId, personId)))
    .limit(1)
    .all();
  return row !== undefined;
}

export function addEntry(db: AppDb, table: EntryTable, personId: number, rawValue: unknown): EntryMutationResult {
  const value = entryValueSchema.parse(rawValue);

  if (!personExists(db, personId)) {
    return { ok: false, error: 'person-not-found' };
  }
  if (conflictExists(db, table, value)) {
    return { ok: false, error: 'conflict' };
  }

  db.transaction((tx) => {
    const [existing] = tx.select({ id: table.id }).from(table).where(eq(table.personId, personId)).limit(1).all();
    tx.insert(table).values({ personId, value, isPrimary: existing === undefined, createdAt: Date.now() }).run();
  });

  return { ok: true, entries: loadEntries(db, table, personId) };
}

export function editEntry(
  db: AppDb,
  table: EntryTable,
  personId: number,
  entryId: number,
  rawValue: unknown,
): EntryMutationResult {
  const value = entryValueSchema.parse(rawValue);

  if (!personExists(db, personId)) {
    return { ok: false, error: 'person-not-found' };
  }
  if (!entryExists(db, table, personId, entryId)) {
    return { ok: false, error: 'entry-not-found' };
  }
  if (conflictExists(db, table, value, entryId)) {
    return { ok: false, error: 'conflict' };
  }

  db.update(table)
    .set({ value })
    .where(and(eq(table.id, entryId), eq(table.personId, personId)))
    .run();

  return { ok: true, entries: loadEntries(db, table, personId) };
}

export function markPrimary(db: AppDb, table: EntryTable, personId: number, entryId: number): EntryMutationResult {
  if (!personExists(db, personId)) {
    return { ok: false, error: 'person-not-found' };
  }
  if (!entryExists(db, table, personId, entryId)) {
    return { ok: false, error: 'entry-not-found' };
  }

  db.transaction((tx) => {
    const [current] = tx
      .select({ isPrimary: table.isPrimary })
      .from(table)
      .where(and(eq(table.id, entryId), eq(table.personId, personId)))
      .limit(1)
      .all();
    if (current?.isPrimary) {
      return;
    }
    tx.update(table)
      .set({ isPrimary: false })
      .where(and(eq(table.personId, personId), eq(table.isPrimary, true)))
      .run();
    tx.update(table).set({ isPrimary: true }).where(eq(table.id, entryId)).run();
  });

  return { ok: true, entries: loadEntries(db, table, personId) };
}

export function removeEntry(db: AppDb, table: EntryTable, personId: number, entryId: number): EntryMutationResult {
  if (!personExists(db, personId)) {
    return { ok: false, error: 'person-not-found' };
  }
  if (!entryExists(db, table, personId, entryId)) {
    return { ok: false, error: 'entry-not-found' };
  }

  db.transaction((tx) => {
    const [removed] = tx
      .select({ isPrimary: table.isPrimary })
      .from(table)
      .where(and(eq(table.id, entryId), eq(table.personId, personId)))
      .limit(1)
      .all();

    tx.delete(table).where(eq(table.id, entryId)).run();

    if (removed?.isPrimary) {
      const [survivor] = tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.personId, personId))
        .orderBy(asc(table.id))
        .limit(1)
        .all();
      if (survivor) {
        tx.update(table).set({ isPrimary: true }).where(eq(table.id, survivor.id)).run();
      }
    }
  });

  return { ok: true, entries: loadEntries(db, table, personId) };
}
