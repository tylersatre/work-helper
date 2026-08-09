import { readFileSync } from 'node:fs';
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
import type { MailProvider } from './services/email/provider.js';

type AppDb = BetterSQLite3Database<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
    lanes: string[];
    personFields: string[];
    connectorPassword?: string;
    mcpKey?: Buffer;
    mailProvider?: MailProvider;
  }
}

export interface AppOptions {
  db: AppDb;
  lanes: string[];
  personFields?: string[];
  serveClient?: boolean;
  /** Directory containing the built client (with index.html). Defaults to `dist/client` under cwd. */
  clientDir?: string;
  connectorPassword?: string;
  mailProvider?: MailProvider;
}

const NON_CLIENT_PATH_PREFIXES = ['/api', '/mcp', '/oauth', '/.well-known'];

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
  app.decorate('mailProvider', options.mailProvider);

  app.register(boardRoutes);
  app.register(taskRoutes);
  app.register(peopleRoutes);
  app.register(oauthRoutes);
  app.register(mcpRoutes);

  if (options.serveClient) {
    const clientDir = options.clientDir ?? join(process.cwd(), 'dist/client');
    const indexHtml = readFileSync(join(clientDir, 'index.html'));
    app.register(fastifyStatic, {
      root: clientDir,
    });

    app.setNotFoundHandler((request, reply) => {
      const isClientNavigation =
        (request.method === 'GET' || request.method === 'HEAD') &&
        !NON_CLIENT_PATH_PREFIXES.some((prefix) => request.url.startsWith(prefix));

      if (isClientNavigation) {
        reply.type('text/html').send(indexHtml);
        return;
      }

      reply.status(404).send({ error: { message: `Route ${request.method}:${request.url} not found` } });
    });
  }

  return app;
}
