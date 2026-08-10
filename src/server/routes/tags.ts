import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { createTag, deleteTag, listTags, updateTag } from '../services/tags.js';

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tags', async () => {
    return listTags(app.db);
  });

  app.post('/api/tags', async (request, reply) => {
    const { name } = request.body as { name?: unknown };
    try {
      const result = createTag(app.db, name);
      if (!result.ok) {
        reply.status(409);
        return { error: { message: 'That tag name is already in use' } };
      }
      reply.status(201);
      return result.tag;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'A name is required' } };
      }
      throw error;
    }
  });

  app.patch('/api/tags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: unknown; color?: unknown } | undefined;

    const result = updateTag(app.db, Number(id), body ?? {});
    if (!result.ok) {
      switch (result.error) {
        case 'nothing-to-update':
          reply.status(400);
          return { error: { message: 'Nothing to update' } };
        case 'invalid-name':
          reply.status(400);
          return { error: { message: 'A name is required' } };
        case 'invalid-color':
          reply.status(400);
          return { error: { message: 'A valid color is required' } };
        case 'name-taken':
          reply.status(409);
          return { error: { message: 'That tag name is already in use' } };
        case 'not-found':
          reply.status(404);
          return { error: { message: 'Tag not found' } };
      }
    }

    return result.tag;
  });

  app.delete('/api/tags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = deleteTag(app.db, Number(id));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: 'Tag not found' } };
    }

    reply.status(204);
    return null;
  });
}
