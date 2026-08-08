import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { validateEnv } from './env.js';
import { loadLanesConfig } from './lanes-config.js';
import { loadPersonFieldsConfig } from './person-fields-config.js';

try {
  validateEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const lanes = loadLanesConfig();
const personFields = loadPersonFieldsConfig();
const { db } = createDb(process.env.DATABASE_PATH ?? './data/work-helper.db');
const app = buildApp({
  db,
  lanes,
  personFields,
  serveClient: process.env.NODE_ENV === 'production',
  connectorPassword: process.env.CONNECTOR_PASSWORD,
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
});
