import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { addEntry, editEntry, type EntryTable, markPrimary, removeEntry } from '../services/contact-entries.js';
import { createPerson, deletePerson, getPerson, listPeople, updatePerson } from '../services/people.js';
import { personEmails, personPhones } from '../db/schema.js';

function conflictMessage(type: 'emails' | 'phones'): string {
  return type === 'emails' ? 'That email is already in use' : 'That phone number is already in use';
}

function entryErrorResponse(
  reply: FastifyReply,
  type: 'emails' | 'phones',
  error: 'person-not-found' | 'entry-not-found' | 'conflict',
) {
  if (error === 'conflict') {
    reply.status(409);
    return { error: { message: conflictMessage(type) } };
  }
  reply.status(404);
  return { error: { message: error === 'person-not-found' ? 'Person not found' : 'Entry not found' } };
}

function registerContactEntryRoutes(app: FastifyInstance, type: 'emails' | 'phones', table: EntryTable): void {
  const base = `/api/people/:personId/${type}`;

  app.post(base, async (request, reply) => {
    const { personId } = request.params as { personId: string };
    try {
      const { value } = request.body as { value?: unknown };
      const result = addEntry(app.db, table, Number(personId), value);
      if (!result.ok) {
        return entryErrorResponse(reply, type, result.error);
      }
      reply.status(201);
      return { entries: result.entries };
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'A value is required' } };
      }
      throw error;
    }
  });

  app.patch(`${base}/:entryId`, async (request, reply) => {
    const { personId, entryId } = request.params as { personId: string; entryId: string };
    try {
      const { value } = request.body as { value?: unknown };
      const result = editEntry(app.db, table, Number(personId), Number(entryId), value);
      if (!result.ok) {
        return entryErrorResponse(reply, type, result.error);
      }
      return { entries: result.entries };
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'A value is required' } };
      }
      throw error;
    }
  });

  app.put(`${base}/:entryId/primary`, async (request, reply) => {
    const { personId, entryId } = request.params as { personId: string; entryId: string };
    const result = markPrimary(app.db, table, Number(personId), Number(entryId));
    if (!result.ok) {
      return entryErrorResponse(reply, type, result.error);
    }
    return { entries: result.entries };
  });

  app.delete(`${base}/:entryId`, async (request, reply) => {
    const { personId, entryId } = request.params as { personId: string; entryId: string };
    const result = removeEntry(app.db, table, Number(personId), Number(entryId));
    if (!result.ok) {
      return entryErrorResponse(reply, type, result.error);
    }
    return { entries: result.entries };
  });
}

export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  registerContactEntryRoutes(app, 'emails', personEmails);
  registerContactEntryRoutes(app, 'phones', personPhones);

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
        return {
          error: { message: result.error === 'email-conflict' ? 'That email is already in use' : 'That phone number is already in use' },
        };
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
        reply.status(404);
        return { error: { message: 'Person not found' } };
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
