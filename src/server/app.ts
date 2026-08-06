import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './db/schema.js';
import { boardRoutes } from './routes/board.js';
import { taskRoutes } from './routes/tasks.js';

type AppDb = BetterSQLite3Database<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
    lanes: string[];
  }
}

export interface AppOptions {
  db: AppDb;
  lanes: string[];
  serveClient?: boolean;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify();

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({ error: { message: error.message } });
  });

  app.decorate('db', options.db);
  app.decorate('lanes', options.lanes);

  app.register(boardRoutes);
  app.register(taskRoutes);

  if (options.serveClient) {
    app.register(fastifyStatic, {
      root: join(process.cwd(), 'dist/client'),
    });
  }

  return app;
}
