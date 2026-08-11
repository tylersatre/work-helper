import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { appState } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export function getAppState(db: AppDb, key: string): string | undefined {
  const [row] = db.select({ value: appState.value }).from(appState).where(eq(appState.key, key)).limit(1).all();
  return row?.value;
}

export function setAppState(db: AppDb, key: string, value: string): void {
  db.insert(appState).values({ key, value }).onConflictDoUpdate({ target: appState.key, set: { value } }).run();
}
