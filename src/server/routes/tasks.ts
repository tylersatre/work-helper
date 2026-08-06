import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { addNote, createTask, deleteNote, getTaskDetail, linkPerson, unlinkPerson } from '../services/tasks.js';

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
}
