import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { DashboardCard } from '../../shared/types.js';
import { companies, people, tags as tagsTable, taskCompanies, taskNotes, taskPeople, taskTags, tasks } from '../db/schema.js';
import { groupByTaskId } from './tasks.js';
import type * as schema from '../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

export function listDashboardCards(db: AppDb, lanes: string[]): DashboardCard[] {
  const laneTasks = lanes.flatMap((lane) =>
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.lane, lane), eq(tasks.archived, false)))
      .orderBy(asc(tasks.position), asc(tasks.id))
      .all(),
  );

  if (laneTasks.length === 0) {
    return [];
  }

  const taskIds = laneTasks.map((task) => task.id);

  const notesByTask = groupByTaskId(
    db.select({ taskId: taskNotes.taskId, text: taskNotes.text }).from(taskNotes).where(inArray(taskNotes.taskId, taskIds)).all(),
  );

  const latestNoteByTask = new Map<number, { text: string; createdAt: number }>();
  for (const row of db
    .select({ taskId: taskNotes.taskId, text: taskNotes.text, createdAt: taskNotes.createdAt })
    .from(taskNotes)
    .where(inArray(taskNotes.taskId, taskIds))
    .orderBy(desc(taskNotes.createdAt), desc(taskNotes.id))
    .all()) {
    if (!latestNoteByTask.has(row.taskId)) {
      latestNoteByTask.set(row.taskId, { text: row.text, createdAt: row.createdAt });
    }
  }

  const peopleByTask = groupByTaskId(
    db
      .select({ taskId: taskPeople.taskId, id: people.id, firstName: people.firstName, lastName: people.lastName })
      .from(taskPeople)
      .innerJoin(people, eq(taskPeople.personId, people.id))
      .where(inArray(taskPeople.taskId, taskIds))
      .all(),
  );

  const companiesByTask = groupByTaskId(
    db
      .select({ taskId: taskCompanies.taskId, id: companies.id, name: companies.name })
      .from(taskCompanies)
      .innerJoin(companies, eq(taskCompanies.companyId, companies.id))
      .where(inArray(taskCompanies.taskId, taskIds))
      .all(),
  );

  const tagsByTask = groupByTaskId(
    db
      .select({ taskId: taskTags.taskId, id: tagsTable.id, name: tagsTable.name, color: tagsTable.color })
      .from(taskTags)
      .innerJoin(tagsTable, eq(taskTags.tagId, tagsTable.id))
      .where(inArray(taskTags.taskId, taskIds))
      .orderBy(asc(sql`${tagsTable.name} COLLATE NOCASE`))
      .all(),
  );

  return laneTasks.map((task) => {
    const noteTexts = (notesByTask.get(task.id) ?? []).map((row) => row.text);
    const personRows = peopleByTask.get(task.id) ?? [];
    const companyRows = companiesByTask.get(task.id) ?? [];
    const personNames = personRows.map((row) => `${row.firstName} ${row.lastName}`.trim());
    const companyNames = companyRows.map((row) => row.name);
    const searchText = [task.title, ...noteTexts, ...personNames, ...companyNames].join('\n').toLowerCase();

    return {
      id: task.id,
      title: task.title,
      lane: task.lane,
      position: task.position,
      createdAt: task.createdAt,
      tags: (tagsByTask.get(task.id) ?? []).map(({ id, name, color }) => ({ id, name, color })),
      searchText,
      latestNote: latestNoteByTask.get(task.id) ?? null,
      people: personRows.map((row) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim() })),
      companies: companyRows.map((row) => ({ id: row.id, name: row.name })),
    };
  });
}
