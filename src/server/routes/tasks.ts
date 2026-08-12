import type { FastifyInstance } from 'fastify';
import { ZodError, z } from 'zod';
import { addNote, createTask, deleteNote, getTaskDetail, linkPerson, moveTask, unlinkPerson } from '../services/tasks.js';
import { attachTagToTask, detachTagFromTask, type AttachInput } from '../services/tags.js';
import { linkCompanyToTask, unlinkCompanyFromTask } from '../services/companies.js';

const placementIndexSchema = z.number().int().nonnegative();

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tasks', async (request, reply) => {
    const body = request.body as { title?: unknown; note?: unknown } | undefined;

    try {
      const task = createTask(app.db, app.lanes, body?.title, body?.note);
      reply.status(201);
      return task;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'Title is required' } };
      }
      throw error;
    }
  });

  app.get('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = getTaskDetail(app.db, Number(id));
    if (!task) {
      reply.status(404);
      return { error: { message: 'Task not found' } };
    }
    return task;
  });

  app.put('/api/tasks/:id/placement', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { lane?: unknown; index?: unknown } | undefined;

    const indexResult = placementIndexSchema.safeParse(body?.index);
    if (!indexResult.success) {
      reply.status(400);
      return { error: { message: 'Invalid index' } };
    }

    if (typeof body?.lane !== 'string') {
      reply.status(400);
      return { error: { message: 'Unknown lane' } };
    }

    const result = moveTask(app.db, app.lanes, Number(id), body.lane, indexResult.data);
    if (!result.ok) {
      if (result.error === 'task-not-found') {
        reply.status(404);
        return { error: { message: 'Task not found' } };
      }
      reply.status(400);
      return { error: { message: 'Unknown lane' } };
    }

    return result.task;
  });

  app.post('/api/tasks/:id/notes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { text } = request.body as { text?: unknown };

    const result = addNote(app.db, Number(id), text);
    if (!result.ok) {
      if (result.error === 'task-not-found') {
        reply.status(404);
        return { error: { message: 'Task not found' } };
      }
      reply.status(400);
      return { error: { message: 'Note text is required' } };
    }

    reply.status(201);
    return result.note;
  });

  app.delete('/api/tasks/:id/notes/:noteId', async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };

    const result = deleteNote(app.db, Number(id), Number(noteId));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: result.error === 'task-not-found' ? 'Task not found' : 'Note not found' } };
    }

    reply.status(204);
    return null;
  });

  app.post('/api/tasks/:id/people', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { personId } = request.body as { personId: number };

    const result = linkPerson(app.db, Number(id), personId);
    if (!result.ok) {
      reply.status(404);
      return { error: { message: result.error === 'task-not-found' ? 'Task not found' : 'Person not found' } };
    }
    return result.task;
  });

  app.delete('/api/tasks/:id/people/:personId', async (request, reply) => {
    const { id, personId } = request.params as { id: string; personId: string };

    const result = unlinkPerson(app.db, Number(id), Number(personId));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: 'Task not found' } };
    }
    return result.task;
  });

  app.post('/api/tasks/:id/companies', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { companyId } = request.body as { companyId: number };

    const result = linkCompanyToTask(app.db, Number(id), companyId);
    if (!result.ok) {
      reply.status(404);
      return { error: { message: result.error === 'task-not-found' ? 'Task not found' : 'Company not found' } };
    }
    return getTaskDetail(app.db, Number(id));
  });

  app.delete('/api/tasks/:id/companies/:companyId', async (request, reply) => {
    const { id, companyId } = request.params as { id: string; companyId: string };

    const result = unlinkCompanyFromTask(app.db, Number(id), Number(companyId));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: 'Task not found' } };
    }
    return getTaskDetail(app.db, Number(id));
  });

  app.post('/api/tasks/:id/tags', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { tagId?: unknown; name?: unknown } | undefined;
    const hasTagId = body?.tagId !== undefined;
    const hasName = body?.name !== undefined;
    if (hasTagId === hasName) {
      reply.status(400);
      return { error: { message: 'Provide a tagId or a name' } };
    }

    const input: AttachInput = hasTagId ? { tagId: Number(body!.tagId) } : { name: body!.name };
    const result = attachTagToTask(app.db, Number(id), input);
    if (!result.ok) {
      if (result.error === 'record-not-found') {
        reply.status(404);
        return { error: { message: 'Task not found' } };
      }
      if (result.error === 'tag-not-found') {
        reply.status(404);
        return { error: { message: 'Tag not found' } };
      }
      reply.status(400);
      return { error: { message: 'A name is required' } };
    }
    return { tags: result.tags };
  });

  app.delete('/api/tasks/:id/tags/:tagId', async (request, reply) => {
    const { id, tagId } = request.params as { id: string; tagId: string };
    const result = detachTagFromTask(app.db, Number(id), Number(tagId));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: 'Task not found' } };
    }
    return { tags: result.tags };
  });
}
