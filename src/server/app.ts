import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './db/schema.js';
import type { IdentityVerifier } from './mcp/auth/identity.js';
import { oauthRoutes } from './mcp/auth/oauth-routes.js';
import { deriveKey } from './mcp/auth/tokens.js';
import { mcpRoutes } from './mcp/routes.js';
import { boardRoutes } from './routes/board.js';
import { emailSyncRoutes } from './routes/email-sync.js';
import { mailboxRoutes } from './routes/mailbox.js';
import { peopleRoutes } from './routes/people.js';
import { tagRoutes } from './routes/tags.js';
import { taskRoutes } from './routes/tasks.js';
import { AttachmentBackfillService } from './services/email/attachment-backfill.js';
import type { MailboxAuth } from './services/email/graph-auth.js';
import { MailboxConnectionManager } from './services/email/mailbox-connection.js';
import type { MailProvider } from './services/email/provider.js';
import { SyncCoordinator } from './services/email/sync-coordinator.js';

type AppDb = BetterSQLite3Database<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
    lanes: string[];
    personFields: string[];
    mcpKey?: Buffer;
    identityVerifier?: IdentityVerifier;
    mailProvider?: MailProvider;
    attachmentBackfill?: AttachmentBackfillService;
    syncCoordinator: SyncCoordinator;
    mailboxAuth?: MailboxAuth;
    mailboxMissingSettings: string[];
    mailboxConnection?: MailboxConnectionManager;
  }
}

export interface AppOptions {
  db: AppDb;
  lanes: string[];
  personFields?: string[];
  serveClient?: boolean;
  /** Directory containing the built client (with index.html). Defaults to `dist/client` under cwd. */
  clientDir?: string;
  mcpTokenSecret?: string;
  identityVerifier?: IdentityVerifier;
  mailProvider?: MailProvider;
  /** Real (createGraphAuth) or injected fake mailbox auth — undefined means mail sign-in is not configured. */
  mailboxAuth?: MailboxAuth;
  /** Concrete env setting names still unset, e.g. ['MS_CLIENT_ID', 'MS_TENANT_ID'] — empty when configured (dev fakes count as configured). */
  mailboxMissingSettings?: string[];
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
  app.decorate('mcpKey', options.mcpTokenSecret ? deriveKey(options.mcpTokenSecret) : undefined);
  app.decorate('identityVerifier', options.identityVerifier);
  app.decorate('mailProvider', options.mailProvider);
  const attachmentBackfill = options.mailProvider ? new AttachmentBackfillService(options.db, options.mailProvider, app.log) : undefined;
  app.decorate('attachmentBackfill', attachmentBackfill);
  app.decorate('syncCoordinator', new SyncCoordinator(options.db, attachmentBackfill));
  app.decorate('mailboxAuth', options.mailboxAuth);
  app.decorate('mailboxMissingSettings', options.mailboxMissingSettings ?? []);
  app.decorate('mailboxConnection', options.mailboxAuth ? new MailboxConnectionManager(options.mailboxAuth) : undefined);

  app.register(boardRoutes);
  app.register(taskRoutes);
  app.register(peopleRoutes);
  app.register(tagRoutes);
  app.register(emailSyncRoutes);
  app.register(mailboxRoutes);
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
