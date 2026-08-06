import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { loadLanesConfig } from './lanes-config.js';

const lanes = loadLanesConfig();
const { db } = createDb(process.env.DATABASE_PATH ?? './data/work-helper.db');
const app = buildApp({ db, lanes, serveClient: process.env.NODE_ENV === 'production' });

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
});
