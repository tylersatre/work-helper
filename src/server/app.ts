import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './db/schema.js';
import { oauthRoutes } from './mcp/auth/oauth-routes.js';
import { deriveKey } from './mcp/auth/tokens.js';
import { mcpRoutes } from './mcp/routes.js';
import { boardRoutes } from './routes/board.js';
import { peopleRoutes } from './routes/people.js';
import { taskRoutes } from './routes/tasks.js';

type AppDb = BetterSQLite3Database<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
    lanes: string[];
    personFields: string[];
    connectorPassword?: string;
    mcpKey?: Buffer;
  }
}

export interface AppOptions {
  db: AppDb;
  lanes: string[];
  personFields?: string[];
  serveClient?: boolean;
  connectorPassword?: string;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ trustProxy: true });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({ error: { message: error.message } });
  });

  app.decorate('db', options.db);
  app.decorate('lanes', options.lanes);
  app.decorate('personFields', options.personFields ?? []);
  app.decorate('connectorPassword', options.connectorPassword);
  app.decorate('mcpKey', options.connectorPassword ? deriveKey(options.connectorPassword) : undefined);

  app.register(boardRoutes);
  app.register(taskRoutes);
  app.register(peopleRoutes);
  app.register(oauthRoutes);
  app.register(mcpRoutes);

  if (options.serveClient) {
    app.register(fastifyStatic, {
      root: join(process.cwd(), 'dist/client'),
    });
  }

  return app;
}
