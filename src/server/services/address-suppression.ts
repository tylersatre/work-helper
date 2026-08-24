import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { emailAddresses, people, suppressedAddresses } from '../db/schema.js';
import { findEmailAddressByValue } from './contact-entries.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

const addressSchema = z.string().trim().min(1, 'An address is required');

export type SuppressAddressResult =
  | { ok: true; address: string; suppressedAt: number }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'linked'; personName: string };

function fullName(db: AppDb, personId: number): string {
  const [row] = db.select({ firstName: people.firstName, lastName: people.lastName }).from(people).where(eq(people.id, personId)).limit(1).all();
  return `${row!.firstName} ${row!.lastName}`;
}

export function suppressAddress(db: AppDb, rawAddress: unknown): SuppressAddressResult {
  const parsed = addressSchema.safeParse(rawAddress);
  if (!parsed.success) {
    return { ok: false, error: 'invalid' };
  }
  const address = parsed.data;

  const existing = findEmailAddressByValue(db, address);
  if (!existing) {
    return { ok: false, error: 'not-found' };
  }
  if (existing.personId !== null) {
    return { ok: false, error: 'linked', personName: fullName(db, existing.personId) };
  }

  db.insert(suppressedAddresses).values({ addressId: existing.id, suppressedAt: Date.now() }).onConflictDoNothing().run();

  const [row] = db
    .select({ address: emailAddresses.value, suppressedAt: suppressedAddresses.suppressedAt })
    .from(suppressedAddresses)
    .innerJoin(emailAddresses, eq(emailAddresses.id, suppressedAddresses.addressId))
    .where(eq(suppressedAddresses.addressId, existing.id))
    .limit(1)
    .all();

  return { ok: true, address: row!.address, suppressedAt: row!.suppressedAt };
}

export interface SuppressedAddressSummary {
  address: string;
  suppressedAt: number;
}

export function listSuppressedAddresses(db: AppDb): SuppressedAddressSummary[] {
  return db
    .select({ address: emailAddresses.value, suppressedAt: suppressedAddresses.suppressedAt })
    .from(suppressedAddresses)
    .innerJoin(emailAddresses, eq(emailAddresses.id, suppressedAddresses.addressId))
    .orderBy(desc(suppressedAddresses.suppressedAt))
    .all();
}
