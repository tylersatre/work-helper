import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { loadLanesConfig } from './lanes-config.js';
import { loadPersonFieldsConfig } from './person-fields-config.js';
import { createGraphAuth } from './services/email/graph-auth.js';
import { GraphMailProvider } from './services/email/graph-provider.js';

const lanes = loadLanesConfig();
const personFields = loadPersonFieldsConfig();
const { db } = createDb(process.env.DATABASE_PATH ?? './data/work-helper.db');

const msClientId = process.env.MS_CLIENT_ID;
const mailProvider = msClientId
  ? new GraphMailProvider({
      getAccessToken: () =>
        createGraphAuth({
          clientId: msClientId,
          tokenCachePath: process.env.MAIL_TOKEN_CACHE_PATH ?? './data/mail-token-cache.json',
        }).getAccessToken(),
    })
  : undefined;

const app = buildApp({
  db,
  lanes,
  personFields,
  serveClient: process.env.NODE_ENV === 'production',
  connectorPassword: process.env.CONNECTOR_PASSWORD,
  mailProvider,
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
});
