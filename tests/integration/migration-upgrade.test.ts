import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/server/db/index.js';

/** Builds a migrations folder containing only the pre-014-email-ui baseline (0000), so we can
 * stand up a database exactly as it looked before this feature's migration existed. */
function buildBaselineOnlyMigrationsFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'work-helper-baseline-migrations-'));
  mkdirSync(join(dir, 'meta'));
  cpSync('drizzle/0000_futuristic_sunspot.sql', join(dir, '0000_futuristic_sunspot.sql'));
  cpSync('drizzle/meta/0000_snapshot.json', join(dir, 'meta', '0000_snapshot.json'));

  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf-8')) as { entries: unknown[] };
  const baselineOnly = { ...journal, entries: journal.entries.slice(0, 1) };
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(baselineOnly, null, 2));

  return dir;
}

function tableInfo(sqlite: Database.Database, table: string) {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; notnull: number; dflt_value: unknown }[]).map(
    (c) => ({ name: c.name, type: c.type, notnull: c.notnull, dflt_value: c.dflt_value }),
  );
}

describe('migration upgrade path (drizzle/0001_silly_sauron.sql, production data policy)', () => {
  let dir: string;
  let baselineMigrationsDir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (baselineMigrationsDir) rmSync(baselineMigrationsDir, { recursive: true, force: true });
  });

  it('applies 0001 to a pre-existing baseline-only database without losing data, and converges with a fresh-DB schema', () => {
    dir = mkdtempSync(join(tmpdir(), 'work-helper-upgrade-'));
    const dbPath = join(dir, 'work-helper.db');
    baselineMigrationsDir = buildBaselineOnlyMigrationsFolder();

    // Stand up the database exactly as it looked pre-014-email-ui, and store data through it.
    const baselineSqlite = new Database(dbPath);
    baselineSqlite.pragma('foreign_keys = ON');
    const baselineDb = drizzle(baselineSqlite, {});
    migrate(baselineDb, { migrationsFolder: baselineMigrationsDir });

    baselineSqlite.prepare('INSERT INTO people (first_name, last_name, extra_fields, created_at) VALUES (?, ?, ?, ?)').run('Sam', 'Rivera', '{}', 1);
    baselineSqlite
      .prepare('INSERT INTO email_conversations (graph_conversation_id, created_at) VALUES (?, ?)')
      .run('conv-1', 1);
    baselineSqlite
      .prepare(
        `INSERT INTO email_messages (conversation_id, graph_message_id, source_folder, subject, body_original, body_content_type, body_text, sent_at, received_at, is_read, created_at)
         VALUES (1, 'msg-1', 'Inbox', 'Quote attached', 'See attached', 'text', 'See attached', 1000, 1001, 0, 1)`,
      )
      .run();
    baselineSqlite
      .prepare('INSERT INTO email_attachments (message_id, name, content_type, size_bytes) VALUES (1, ?, ?, ?)')
      .run('quote.pdf', 'application/pdf', 53248);
    baselineSqlite.close();

    // Upgrade in place through the app's real migration runner (drizzle/, which now includes 0001).
    const { db: upgradedDb, sqlite: upgradedSqlite } = createDb(dbPath);

    const people = upgradedDb.all<{ first_name: string }>('SELECT first_name FROM people' as never);
    expect(people).toHaveLength(1);

    const attachments = upgradedSqlite.prepare('SELECT * FROM email_attachments').all() as { name: string; is_inline: number }[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ name: 'quote.pdf', is_inline: 0 });

    const appStateRows = upgradedSqlite.prepare('SELECT * FROM app_state').all();
    expect(appStateRows).toEqual([]);

    // Converges with a fresh :memory: DB's schema — the upgrade path and a brand-new install end up identical.
    const { sqlite: freshSqlite } = createDb(':memory:');
    expect(tableInfo(upgradedSqlite, 'email_attachments')).toEqual(tableInfo(freshSqlite, 'email_attachments'));
    expect(tableInfo(upgradedSqlite, 'app_state')).toEqual(tableInfo(freshSqlite, 'app_state'));

    upgradedSqlite.close();
    freshSqlite.close();
  });

  it('applies 0002 (calendar sync tables) to a pre-existing baseline-only database without losing data, and converges with a fresh-DB schema', () => {
    dir = mkdtempSync(join(tmpdir(), 'work-helper-upgrade-'));
    const dbPath = join(dir, 'work-helper.db');
    baselineMigrationsDir = buildBaselineOnlyMigrationsFolder();

    // Stand up the database exactly as it looked pre-019-calendar-sync, and store data through it.
    const baselineSqlite = new Database(dbPath);
    baselineSqlite.pragma('foreign_keys = ON');
    const baselineDb = drizzle(baselineSqlite, {});
    migrate(baselineDb, { migrationsFolder: baselineMigrationsDir });

    baselineSqlite.prepare('INSERT INTO people (first_name, last_name, extra_fields, created_at) VALUES (?, ?, ?, ?)').run('Sam', 'Rivera', '{}', 1);
    baselineSqlite.close();

    // Upgrade in place through the app's real migration runner (drizzle/, which now includes 0002).
    const { db: upgradedDb, sqlite: upgradedSqlite } = createDb(dbPath);

    const people = upgradedDb.all<{ first_name: string }>('SELECT first_name FROM people' as never);
    expect(people).toHaveLength(1);

    // The three new calendar tables exist and are empty (no lossy/backfill surprises on upgrade).
    for (const table of ['calendar_events', 'calendar_event_participants', 'calendar_sync_runs']) {
      expect(upgradedSqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
    }

    // Converges with a fresh :memory: DB's schema — the upgrade path and a brand-new install end up identical.
    const { sqlite: freshSqlite } = createDb(':memory:');
    for (const table of ['calendar_events', 'calendar_event_participants', 'calendar_sync_runs']) {
      expect(tableInfo(upgradedSqlite, table)).toEqual(tableInfo(freshSqlite, table));
    }

    upgradedSqlite.close();
    freshSqlite.close();
  });
});
