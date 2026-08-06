import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { createPerson, deletePerson, getPerson, listPeople, updatePerson } from '../services/people.js';

export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/person-fields', async () => {
    return { fields: app.personFields };
  });

  app.get('/api/people', async (request) => {
    const { q } = request.query as { q?: string };
    return listPeople(app.db, app.personFields, q);
  });

  app.post('/api/people', async (request, reply) => {
    try {
      const result = createPerson(app.db, app.personFields, request.body);
      if (!result.ok) {
        reply.status(409);
        return { error: { message: 'That email is already in use' } };
      }
      reply.status(201);
      return result.person;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'First and last name are required' } };
      }
      throw error;
    }
  });

  app.get('/api/people/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const person = getPerson(app.db, app.personFields, Number(id));
    if (!person) {
      reply.status(404);
      return { error: { message: 'Person not found' } };
    }
    return person;
  });

  app.put('/api/people/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = updatePerson(app.db, app.personFields, Number(id), request.body);
      if (!result.ok) {
        if (result.error === 'not-found') {
          reply.status(404);
          return { error: { message: 'Person not found' } };
        }
        reply.status(409);
        return { error: { message: 'That email is already in use' } };
      }
      return result.person;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'First and last name are required' } };
      }
      throw error;
    }
  });

  app.delete('/api/people/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = deletePerson(app.db, Number(id));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: 'Person not found' } };
    }
    reply.status(204);
    return null;
  });
}
