import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

function applyMigrationFile(sqlite: Database.Database, filename: string): void {
  const raw = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
  for (const statement of raw.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) sqlite.exec(trimmed);
  }
}

function findMigration0004(): string {
  const [filename] = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith('0004_') && f.endsWith('.sql'));
  if (!filename) throw new Error('migration 0004 not found');
  return filename;
}

describe('migration 0004: person_emails/person_phones carry-over', () => {
  it('carries every seeded legacy email/phone over as exactly one primary entry, nothing lost or altered', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    applyMigrationFile(sqlite, '0000_black_justin_hammer.sql');
    applyMigrationFile(sqlite, '0001_warm_red_skull.sql');
    applyMigrationFile(sqlite, '0002_low_risque.sql');
    applyMigrationFile(sqlite, '0003_fearless_quasar.sql');

    const insertPerson = sqlite.prepare(
      'INSERT INTO people (id, first_name, last_name, email, phone, extra_fields, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const T0 = 1700000000000;
    insertPerson.run(1, 'Sam', 'Rivera', 'Sam.Rivera@example.com', '555-0100', '{}', T0);
    insertPerson.run(2, 'Ana', 'Alvarez', null, null, '{}', T0 + 1);
    insertPerson.run(3, 'Bo', 'Baker', 'bo.baker@example.com', null, '{}', T0 + 2);
    insertPerson.run(4, 'Chris', 'Cole', null, '555-0199', '{}', T0 + 3);

    applyMigrationFile(sqlite, findMigration0004());

    const emails = sqlite
      .prepare('SELECT person_id, value, is_primary, created_at FROM person_emails ORDER BY id')
      .all();
    expect(emails).toEqual([
      { person_id: 1, value: 'Sam.Rivera@example.com', is_primary: 1, created_at: T0 },
      { person_id: 3, value: 'bo.baker@example.com', is_primary: 1, created_at: T0 + 2 },
    ]);

    const phones = sqlite
      .prepare('SELECT person_id, value, is_primary, created_at FROM person_phones ORDER BY id')
      .all();
    expect(phones).toEqual([
      { person_id: 1, value: '555-0100', is_primary: 1, created_at: T0 },
      { person_id: 4, value: '555-0199', is_primary: 1, created_at: T0 + 3 },
    ]);

    const columns = sqlite
      .prepare("PRAGMA table_info('people')")
      .all()
      .map((c) => (c as { name: string }).name);
    expect(columns).not.toContain('email');
    expect(columns).not.toContain('phone');

    const peopleCount = sqlite.prepare('SELECT COUNT(*) as count FROM people').get() as { count: number };
    expect(peopleCount.count).toBe(4);

    sqlite.close();
  });
});
