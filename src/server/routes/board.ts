import type { FastifyInstance } from 'fastify';
import { listBoardTasksByLane } from '../services/tasks.js';

export async function boardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/board', async () => {
    return {
      lanes: app.lanes.map((name) => ({
        name,
        tasks: listBoardTasksByLane(app.db, name),
      })),
    };
  });
}
