import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { validateEnv } from './env.js';
import { loadLanesConfig } from './lanes-config.js';
import { createIdentityVerifier } from './mcp/auth/identity.js';
import { loadPersonFieldsConfig } from './person-fields-config.js';
import { DEV_SEED_MESSAGES } from './services/email/dev-seed.js';
import { FakeMailProvider } from './services/email/fake-provider.js';
import { createGraphAuth } from './services/email/graph-auth.js';
import { GraphMailProvider } from './services/email/graph-provider.js';
import type { MailProvider } from './services/email/provider.js';

try {
  validateEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const lanes = loadLanesConfig();
const personFields = loadPersonFieldsConfig();
const { db } = createDb(process.env.DATABASE_PATH ?? './data/work-helper.db');

// Dev-only, never in production: MAIL_PROVIDER=fake serves a seeded FakeMailProvider (browser
// evidence, no real mailbox needed); MAIL_PROVIDER=fake-unreachable simulates a broken mail
// connection (US1 scenario 5). Any other value (or unset) falls through to the real Graph provider.
function resolveDevMailProvider(): MailProvider | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  if (process.env.MAIL_PROVIDER === 'fake') return new FakeMailProvider(DEV_SEED_MESSAGES);
  if (process.env.MAIL_PROVIDER === 'fake-unreachable') return new FakeMailProvider([], { failImmediately: true });
  return undefined;
}

const devMailProvider = resolveDevMailProvider();

const msClientId = process.env.MS_CLIENT_ID;
const msTenantId = process.env.MS_TENANT_ID;
// Hoisted so the MSAL client and its in-memory token cache are shared across calls —
// GraphMailProvider.fetchMessages calls getAccessToken() once per Graph page, and
// re-creating the client each time would re-read/re-deserialize the cache file and
// lose the in-memory token cache on every page (relevant to SC-006's sync-time budget).
// In production validateEnv has already exited on this combination, so the warning is dev-only.
if (!devMailProvider && msClientId && !msTenantId) {
  console.warn('MS_CLIENT_ID is set but MS_TENANT_ID is not — email sync is disabled. See .env.example.');
}
const graphAuth = !devMailProvider && msClientId && msTenantId
  ? createGraphAuth({
      clientId: msClientId,
      tenantId: msTenantId,
      tokenCachePath: process.env.MAIL_TOKEN_CACHE_PATH ?? './data/mail-token-cache.json',
    })
  : undefined;
const mailProvider = devMailProvider ?? (graphAuth ? new GraphMailProvider({ getAccessToken: () => graphAuth.getAccessToken() }) : undefined);

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
