import type { FastifyInstance } from 'fastify';

/** Exposes the shared single-flight state (research R8) so the Sync page can disable both Sync buttons during any sync, including MCP-triggered ones (FR-006). */
export async function syncStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sync/status', async () => {
    return { running: app.syncCoordinator.isRunning() };
  });
}
