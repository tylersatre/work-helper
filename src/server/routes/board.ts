import type { FastifyInstance } from 'fastify';
import { listTasksByLane } from '../services/tasks.js';

export async function boardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/board', async () => {
    return {
      lanes: app.lanes.map((name) => ({
        name,
        tasks: listTasksByLane(app.db, name),
      })),
    };
  });
}
