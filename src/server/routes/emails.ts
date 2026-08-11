import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { people } from '../db/schema.js';
import { conversationsForPerson, getConversation, listConversations } from '../services/email/queries.js';

function personExists(app: FastifyInstance, personId: number): boolean {
  const [row] = app.db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1).all();
  return row !== undefined;
}

export async function emailRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/emails/conversations', async (request, reply) => {
    const { limit: rawLimit, cursor } = request.query as { limit?: string; cursor?: string };

    let limit = 25;
    if (rawLimit !== undefined) {
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        reply.status(400);
        return { error: { message: 'Invalid limit' } };
      }
    }

    try {
      const page = listConversations(app.db, { limit, cursor, attachmentRollup: 'non-inline' });
      return page;
    } catch {
      reply.status(400);
      return { error: { message: 'Invalid cursor' } };
    }
  });

  app.get('/api/emails/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversationId = Number(id);
    if (!Number.isInteger(conversationId)) {
      reply.status(404);
      return { error: { message: 'Conversation not found' } };
    }

    const conversation = getConversation(app.db, conversationId, { attachments: 'non-inline', includeOriginalBody: true });
    if (!conversation) {
      reply.status(404);
      return { error: { message: 'Conversation not found' } };
    }
    return conversation;
  });

  app.get('/api/people/:personId/email-conversations', async (request, reply) => {
    const { personId } = request.params as { personId: string };
    const id = Number(personId);
    if (!Number.isInteger(id) || !personExists(app, id)) {
      reply.status(404);
      return { error: { message: 'Person not found' } };
    }

    return { conversations: conversationsForPerson(app.db, id) };
  });
}
