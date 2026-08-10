import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/server/db/index.js';
import {
  people,
  emailAddresses,
  emailAttachments,
  emailConversations,
  emailMessages,
  emailParticipants,
  syncRuns,
  taskPeople,
  tasks,
} from '../../src/server/db/schema.js';

describe('createDb', () => {
  it('creates a tasks table supporting insert + select round-trip on :memory:', () => {
    const { db } = createDb(':memory:');

    db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1754500000000 }).run();
    const rows = db.select().from(tasks).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Follow up with Sam', lane: 'To Do', createdAt: 1754500000000 });
    expect(typeof rows[0]?.id).toBe('number');
  });

  describe('with a file-backed database', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'work-helper-db-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('is safe to apply migrations twice against the same file (idempotent)', () => {
      const dbPath = join(dir, 'work-helper.db');

      const { db: db1, sqlite: sqlite1 } = createDb(dbPath);
      db1.insert(tasks).values({ title: 'First', lane: 'To Do', position: 0, createdAt: 1 }).run();
      sqlite1.close();

      expect(() => createDb(dbPath)).not.toThrow();

      const { db: db2 } = createDb(dbPath);
      const rows = db2.select().from(tasks).all();
      expect(rows).toHaveLength(1);
    });
  });

  describe('people and task_people tables', () => {
    it('creates the people and task_people tables with foreign key enforcement enabled', () => {
      const { sqlite } = createDb(':memory:');

      const fkStatus = sqlite.pragma('foreign_keys', { simple: true });
      expect(fkStatus).toBe(1);

      const tableNames = (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('people', 'task_people')").all() as {
          name: string;
        }[]
      )
        .map((row) => row.name)
        .sort();
      expect(tableNames).toEqual(['people', 'task_people']);
    });

    it('rejects a second person email entry differing only by case, while allowing multiple people with no email', () => {
      const { db } = createDb(':memory:');

      const [sam] = db.insert(people).values({ firstName: 'Sam', lastName: 'Rivera', createdAt: 1 }).returning().all();
      const [ana] = db.insert(people).values({ firstName: 'Ana', lastName: 'Alvarez', createdAt: 2 }).returning().all();
      db.insert(people).values({ firstName: 'Bo', lastName: 'Baker', createdAt: 3 }).run();

      db.insert(emailAddresses).values({ personId: sam!.id, value: 'sam@example.com', isPrimary: true, createdAt: 1 }).run();

      expect(() =>
        db
          .insert(emailAddresses)
          .values({ personId: ana!.id, value: 'SAM@example.com', isPrimary: true, createdAt: 2 })
          .run(),
      ).toThrow();
    });

    it('rejects a duplicate (task_id, person_id) pair on task_people via the composite primary key', () => {
      const { db } = createDb(':memory:');
      const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1 }).returning().all();
      const [person] = db.insert(people).values({ firstName: 'Sam', lastName: 'Rivera', createdAt: 1 }).returning().all();

      db.insert(taskPeople).values({ taskId: task!.id, personId: person!.id }).run();

      expect(() => db.insert(taskPeople).values({ taskId: task!.id, personId: person!.id }).run()).toThrow();
    });

    it('cascades deleting a person to remove its task_people rows', () => {
      const { db } = createDb(':memory:');
      const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1 }).returning().all();
      const [person] = db.insert(people).values({ firstName: 'Sam', lastName: 'Rivera', createdAt: 1 }).returning().all();
      db.insert(taskPeople).values({ taskId: task!.id, personId: person!.id }).run();

      db.delete(people).where(eq(people.id, person!.id)).run();

      expect(db.select().from(taskPeople).all()).toHaveLength(0);
    });
  });

  describe('task_notes table', () => {
    it('creates the task_notes table with id, task_id, text, source, created_at columns', () => {
      const { sqlite } = createDb(':memory:');

      const tableNames = (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_notes'").all() as { name: string }[]
      ).map((row) => row.name);
      expect(tableNames).toEqual(['task_notes']);

      const columnNames = (sqlite.prepare('PRAGMA table_info(task_notes)').all() as { name: string }[])
        .map((row) => row.name)
        .sort();
      expect(columnNames).toEqual(['created_at', 'id', 'source', 'task_id', 'text']);
    });

    it('rejects a note row referencing a missing task (foreign key enforced)', () => {
      const { sqlite } = createDb(':memory:');

      expect(() =>
        sqlite
          .prepare('INSERT INTO task_notes (task_id, text, source, created_at) VALUES (?, ?, ?, ?)')
          .run(999, 'Orphan note', 'ui', 1),
      ).toThrow();
    });

    it('cascades deleting a task to remove its notes', () => {
      const { db, sqlite } = createDb(':memory:');
      const [task] = db.insert(tasks).values({ title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1 }).returning().all();
      sqlite
        .prepare('INSERT INTO task_notes (task_id, text, source, created_at) VALUES (?, ?, ?, ?)')
        .run(task!.id, 'First note', 'ui', 1);

      sqlite.prepare('DELETE FROM tasks WHERE id = ?').run(task!.id);

      const remaining = sqlite.prepare('SELECT * FROM task_notes').all();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('email sync improvements schema', () => {
    it('inserts and reads back a sync_runs row with every data-model.md column', () => {
      const { db } = createDb(':memory:');

      const [inserted] = db
        .insert(syncRuns)
        .values({
          ranAt: 1000,
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          source: 'web',
          status: 'success',
          newCount: 3,
          updatedCount: 1,
          error: null,
        })
        .returning()
        .all();

      expect(inserted).toMatchObject({
        ranAt: 1000,
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        source: 'web',
        status: 'success',
        newCount: 3,
        updatedCount: 1,
        error: null,
      });

      const rows = db.select().from(syncRuns).all();
      expect(rows).toHaveLength(1);
    });

    it('inserts and reads back an email_attachments row referencing its message', () => {
      const { db } = createDb(':memory:');
      const [conversation] = db.insert(emailConversations).values({ graphConversationId: 'conv-1', createdAt: 1 }).returning().all();
      const [message] = db
        .insert(emailMessages)
        .values({
          conversationId: conversation!.id,
          graphMessageId: 'msg-1',
          sourceFolder: 'Inbox',
          subject: 'Quote attached',
          bodyOriginal: 'See attached',
          bodyContentType: 'text',
          bodyText: 'See attached',
          sentAt: 1000,
          receivedAt: 1001,
          isRead: false,
          createdAt: 1,
        })
        .returning()
        .all();

      const [attachment] = db
        .insert(emailAttachments)
        .values({ messageId: message!.id, name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 })
        .returning()
        .all();

      expect(attachment).toMatchObject({ messageId: message!.id, name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 53248 });

      const [nullType] = db
        .insert(emailAttachments)
        .values({ messageId: message!.id, name: 'image.dat', contentType: null, sizeBytes: 10 })
        .returning()
        .all();
      expect(nullType?.contentType).toBeNull();
    });

    it('inserts an email_messages row carrying the new metadata columns', () => {
      const { db } = createDb(':memory:');
      const [conversation] = db.insert(emailConversations).values({ graphConversationId: 'conv-2', createdAt: 1 }).returning().all();

      const [message] = db
        .insert(emailMessages)
        .values({
          conversationId: conversation!.id,
          graphMessageId: 'msg-2',
          sourceFolder: 'Projects',
          subject: 'Site survey',
          bodyOriginal: 'body',
          bodyContentType: 'text',
          bodyText: 'body',
          sentAt: 2000,
          receivedAt: 2001,
          isRead: true,
          importance: 'high',
          flagStatus: 'flagged',
          categories: ['Orange category'],
          webLink: 'https://outlook.office.com/mail/msg-2',
          internetMessageId: '<msg-2@example.com>',
          createdAt: 1,
        })
        .returning()
        .all();

      expect(message).toMatchObject({
        sourceFolder: 'Projects',
        receivedAt: 2001,
        isRead: true,
        importance: 'high',
        flagStatus: 'flagged',
        categories: ['Orange category'],
        webLink: 'https://outlook.office.com/mail/msg-2',
        internetMessageId: '<msg-2@example.com>',
      });
    });

    it('defaults new email_messages metadata columns when not provided', () => {
      const { db } = createDb(':memory:');
      const [conversation] = db.insert(emailConversations).values({ graphConversationId: 'conv-3', createdAt: 1 }).returning().all();

      const [message] = db
        .insert(emailMessages)
        .values({
          conversationId: conversation!.id,
          graphMessageId: 'msg-3',
          sourceFolder: 'Inbox',
          subject: 'No attachments',
          bodyOriginal: 'body',
          bodyContentType: 'text',
          bodyText: 'body',
          sentAt: 3000,
          receivedAt: 3001,
          isRead: false,
          createdAt: 1,
        })
        .returning()
        .all();

      expect(message).toMatchObject({
        importance: 'normal',
        flagStatus: 'notFlagged',
        categories: [],
        webLink: '',
        internetMessageId: '',
      });
    });

    it('inserts an email_participants row carrying a displayName', () => {
      const { db } = createDb(':memory:');
      const [address] = db.insert(emailAddresses).values({ personId: null, value: 'sam@example.com', isPrimary: false, createdAt: 1 }).returning().all();
      const [conversation] = db.insert(emailConversations).values({ graphConversationId: 'conv-4', createdAt: 1 }).returning().all();
      const [message] = db
        .insert(emailMessages)
        .values({
          conversationId: conversation!.id,
          graphMessageId: 'msg-4',
          sourceFolder: 'Inbox',
          subject: 'Hi',
          bodyOriginal: 'body',
          bodyContentType: 'text',
          bodyText: 'body',
          sentAt: 4000,
          receivedAt: 4001,
          isRead: false,
          createdAt: 1,
        })
        .returning()
        .all();

      const [participant] = db
        .insert(emailParticipants)
        .values({ messageId: message!.id, addressId: address!.id, role: 'from', displayName: 'Sam Rivera' })
        .returning()
        .all();

      expect(participant?.displayName).toBe('Sam Rivera');
    });
  });
});
