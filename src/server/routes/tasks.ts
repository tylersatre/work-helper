import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { createTask } from '../services/tasks.js';

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tasks', async (request, reply) => {
    const body = request.body as { title?: unknown } | undefined;

    try {
      const task = createTask(app.db, app.lanes, body?.title);
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
}
