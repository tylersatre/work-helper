import type { FastifyInstance } from 'fastify';
import type { DashboardSavedView } from '../../shared/types.js';
import { dashboardSavedViewSchema } from '../../shared/validation.js';
import { getAppState, setAppState } from '../services/app-state.js';
import { listDashboardCards } from '../services/dashboard.js';

const SAVED_VIEW_KEY = 'dashboard.view';

function readSavedView(app: FastifyInstance): DashboardSavedView | null {
  const raw = getAppState(app.db, SAVED_VIEW_KEY);
  if (raw === undefined) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = dashboardSavedViewSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard', async () => {
    return {
      lanes: app.lanes,
      defaultLanes: app.dashboardLanes.defaultLanes,
      quickDoneLane: app.dashboardLanes.quickDoneLane,
      savedView: readSavedView(app),
      cards: listDashboardCards(app.db, app.lanes),
    };
  });

  app.put('/api/dashboard/view', async (request, reply) => {
    const result = dashboardSavedViewSchema.safeParse(request.body);
    if (!result.success) {
      reply.status(400);
      return { error: { message: result.error.issues[0]?.message ?? 'Invalid saved view' } };
    }

    setAppState(app.db, SAVED_VIEW_KEY, JSON.stringify(result.data));
    return result.data;
  });
}
