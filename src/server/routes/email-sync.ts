import type { FastifyInstance } from 'fastify';
import { listSyncRuns } from '../services/email/queries.js';
import { computeSyncWindow } from '../services/email/sync.js';

export async function emailSyncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/email-sync/runs', async () => {
    return { runs: listSyncRuns(app.db) };
  });

  app.post('/api/email-sync/runs', async (request, reply) => {
    const body = (request.body ?? {}) as { startDate?: unknown; endDate?: unknown };
    const startDate = typeof body.startDate === 'string' ? body.startDate : undefined;
    const endDate = typeof body.endDate === 'string' ? body.endDate : undefined;

    if (!startDate || !endDate) {
      reply.status(400);
      return { error: { message: 'A start date and end date are required' } };
    }

    let window;
    try {
      window = computeSyncWindow(startDate, endDate);
    } catch (error) {
      reply.status(400);
      const message = error instanceof Error && error.message.startsWith('Invalid date') ? error.message : 'Start date must not be after end date';
      return { error: { message } };
    }

    const outcome = await app.syncCoordinator.trigger({ startDate, endDate, window, source: 'web', provider: app.mailProvider });
    if (outcome.kind === 'already-running') {
      reply.status(409);
      return { error: { message: 'A sync is already running' } };
    }

    reply.status(201);
    return outcome.run;
  });
}
