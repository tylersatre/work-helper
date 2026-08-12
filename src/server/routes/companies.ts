import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { createCompany, getCompanyDetail, listCompanies, renameCompany } from '../services/companies.js';

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
}
