import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { validateEnv } from './env.js';
import { loadLanesConfig } from './lanes-config.js';
import { createIdentityVerifier } from './mcp/auth/identity.js';
import { loadPersonFieldsConfig } from './person-fields-config.js';
import { createGraphAuth } from './services/email/graph-auth.js';
import { GraphMailProvider } from './services/email/graph-provider.js';

try {
  validateEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const lanes = loadLanesConfig();
const personFields = loadPersonFieldsConfig();
const { db } = createDb(process.env.DATABASE_PATH ?? './data/work-helper.db');

const msClientId = process.env.MS_CLIENT_ID;
// Hoisted so the MSAL client and its in-memory token cache are shared across calls —
// GraphMailProvider.fetchMessages calls getAccessToken() once per Graph page, and
// re-creating the client each time would re-read/re-deserialize the cache file and
// lose the in-memory token cache on every page (relevant to SC-006's sync-time budget).
const graphAuth = msClientId
  ? createGraphAuth({
      clientId: msClientId,
      tokenCachePath: process.env.MAIL_TOKEN_CACHE_PATH ?? './data/mail-token-cache.json',
    })
  : undefined;
const mailProvider = graphAuth ? new GraphMailProvider({ getAccessToken: () => graphAuth.getAccessToken() }) : undefined;

const app = buildApp({
  db,
  lanes,
  personFields,
  serveClient: process.env.NODE_ENV === 'production',
  mcpTokenSecret: process.env.MCP_TOKEN_SECRET,
  identityVerifier: process.env.AUTHENTIK_USERINFO_URL ? createIdentityVerifier(process.env.AUTHENTIK_USERINFO_URL) : undefined,
  mailProvider,
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
});
