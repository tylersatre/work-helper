import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { validateEnv } from './env.js';
import { loadLanesConfig } from './lanes-config.js';
import { createIdentityVerifier } from './mcp/auth/identity.js';
import { loadPersonFieldsConfig } from './person-fields-config.js';
import { DEV_SEED_EVENTS } from './services/calendar/dev-seed.js';
import { FakeCalendarProvider } from './services/calendar/fake-provider.js';
import { GraphCalendarProvider } from './services/calendar/graph-provider.js';
import type { CalendarProvider } from './services/calendar/provider.js';
import { DEV_SEED_MESSAGES } from './services/email/dev-seed.js';
import { FakeMailboxAuth } from './services/email/fake-mailbox-auth.js';
import { FakeMailProvider } from './services/email/fake-provider.js';
import { createGraphAuth, type MailboxAuth } from './services/email/graph-auth.js';
import { GraphMailProvider } from './services/email/graph-provider.js';
import type { MailProvider } from './services/email/provider.js';

try {
  validateEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const lanesConfig = loadLanesConfig();
const lanes = lanesConfig.lanes;
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

// Same MAIL_PROVIDER switch as mail (research R4/R5) — mail and calendar share one connection, so
// MAIL_PROVIDER=fake seeds both from dev-seed data and MAIL_PROVIDER=fake-unreachable breaks both.
function resolveDevCalendarProvider(): CalendarProvider | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  if (process.env.MAIL_PROVIDER === 'fake') return new FakeCalendarProvider(DEV_SEED_EVENTS);
  if (process.env.MAIL_PROVIDER === 'fake-unreachable') return new FakeCalendarProvider([], { failImmediately: true });
  return undefined;
}

const devCalendarProvider = resolveDevCalendarProvider();

const msClientId = process.env.MS_CLIENT_ID;
const msTenantId = process.env.MS_TENANT_ID;
if (!process.env.MAIL_AUTH && msClientId && !msTenantId) {
  console.warn('MS_CLIENT_ID is set but MS_TENANT_ID is not — email sync is disabled. See .env.example.');
}

// Dev-only, never in production, same guard as resolveDevMailProvider: MAIL_AUTH=fake auto-completes a begun
// sign-in as tyler@example.com after ~2s; MAIL_AUTH=fake-decline fails it after ~2s with an AADSTS-style
// decline message (research.md D6). Any other value (or unset) resolves the real MSAL auth when configured.
function resolveMailboxAuth(): MailboxAuth | undefined {
  if (process.env.NODE_ENV !== 'production') {
    const statePath = process.env.MAIL_AUTH_STATE_PATH ?? './data/mailbox-auth-state.json';
    if (process.env.MAIL_AUTH === 'fake') {
      return new FakeMailboxAuth({ statePath, autoOutcome: { afterMs: 2000, kind: 'connect', account: 'tyler@example.com' } });
    }
    if (process.env.MAIL_AUTH === 'fake-decline') {
      return new FakeMailboxAuth({
        statePath,
        autoOutcome: { afterMs: 2000, kind: 'decline', error: 'AADSTS70016: The user declined the device-code sign-in request.' },
      });
    }
  }
  return msClientId && msTenantId
    ? createGraphAuth({
        clientId: msClientId,
        tenantId: msTenantId,
        tokenCachePath: process.env.MAIL_TOKEN_CACHE_PATH ?? './data/mail-token-cache.json',
      })
    : undefined;
}

// Hoisted so the MSAL client and its in-memory token cache are shared across calls — GraphMailProvider.fetchMessages
// calls getAccessToken() once per Graph page, and the web sign-in flow shares the same client (research.md D1);
// re-creating it each time would re-read/re-deserialize the cache file and lose the in-memory token cache.
const mailboxAuth = resolveMailboxAuth();
// MAIL_AUTH dev fakes count as configured even without real MS_CLIENT_ID/MS_TENANT_ID.
const mailboxMissingSettings = process.env.MAIL_AUTH
  ? []
  : [!msClientId && 'MS_CLIENT_ID', !msTenantId && 'MS_TENANT_ID'].filter((v): v is string => Boolean(v));
const mailProvider =
  devMailProvider ??
  (mailboxAuth
    ? new GraphMailProvider({ getAccessToken: () => mailboxAuth.getAccessToken(), getWriteAccessToken: () => mailboxAuth.getWriteAccessToken() })
    : undefined);
const calendarProvider =
  devCalendarProvider ?? (mailboxAuth ? new GraphCalendarProvider({ getAccessToken: () => mailboxAuth.getAccessToken() }) : undefined);

const app = buildApp({
  db,
  lanes,
  dashboardLanes: lanesConfig.dashboard,
  personFields,
  serveClient: process.env.NODE_ENV === 'production',
  mcpTokenSecret: process.env.MCP_TOKEN_SECRET,
  identityVerifier: process.env.AUTHENTIK_USERINFO_URL ? createIdentityVerifier(process.env.AUTHENTIK_USERINFO_URL) : undefined,
  mailProvider,
  calendarProvider,
  mailboxAuth,
  mailboxMissingSettings,
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
  void app.attachmentBackfill?.run();
});
