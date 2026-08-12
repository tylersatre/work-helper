import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { attachTagToCompany, createCompany, detachTagFromCompany, getCompanyDetail, listCompanies, renameCompany } from '../services/companies.js';
import type { AttachInput } from '../services/tags.js';

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/companies', async (request) => {
    const { q } = request.query as { q?: string };
    return listCompanies(app.db, q);
  });

  app.post('/api/companies', async (request, reply) => {
    const { name } = (request.body ?? {}) as { name?: unknown };
    try {
      const result = createCompany(app.db, name);
      if (!result.ok) {
        reply.status(409);
        return { error: { message: 'That company name is already in use' } };
      }
      reply.status(201);
      return result.company;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return { error: { message: 'A name is required' } };
      }
      throw error;
    }
  });

  app.get('/api/companies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = getCompanyDetail(app.db, Number(id));
    if (!detail) {
      reply.status(404);
      return { error: { message: 'Company not found' } };
    }
    return detail;
  });

  app.patch('/api/companies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = (request.body ?? {}) as { name?: unknown };

    const result = renameCompany(app.db, Number(id), name);
    if (!result.ok) {
      switch (result.error) {
        case 'invalid-name':
          reply.status(400);
          return { error: { message: 'A name is required' } };
        case 'name-taken':
          reply.status(409);
          return { error: { message: 'That company name is already in use' } };
        case 'not-found':
          reply.status(404);
          return { error: { message: 'Company not found' } };
      }
    }

    return result.company;
  });

  app.post('/api/companies/:id/tags', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { tagId?: unknown; name?: unknown } | undefined;
    const hasTagId = body?.tagId !== undefined;
    const hasName = body?.name !== undefined;
    if (hasTagId === hasName) {
      reply.status(400);
      return { error: { message: 'Provide a tagId or a name' } };
    }

    const input: AttachInput = hasTagId ? { tagId: Number(body!.tagId) } : { name: body!.name };
    const result = attachTagToCompany(app.db, Number(id), input);
    if (!result.ok) {
      if (result.error === 'record-not-found') {
        reply.status(404);
        return { error: { message: 'Company not found' } };
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

  app.delete('/api/companies/:id/tags/:tagId', async (request, reply) => {
    const { id, tagId } = request.params as { id: string; tagId: string };
    const result = detachTagFromCompany(app.db, Number(id), Number(tagId));
    if (!result.ok) {
      reply.status(404);
      return { error: { message: 'Company not found' } };
    }
    return { tags: result.tags };
  });
}
