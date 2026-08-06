import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { titleSchema } from '../../shared/validation.js';
import { tasks } from '../db/schema.js';
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
