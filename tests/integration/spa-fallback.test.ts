import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];
const FIXTURE_CLIENT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/spa-client');

function buildSpaApp() {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES, serveClient: true, clientDir: FIXTURE_CLIENT_DIR });
}

describe('SPA history fallback (serveClient)', () => {
  it('returns the fixture index.html with 200 for GET /people', async () => {
    const app = buildSpaApp();
    const response = await app.inject({ method: 'GET', url: '/people' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('spa-fallback-fixture');
  });

  it('returns the fixture index.html with 200 for GET /tasks/1', async () => {
    const app = buildSpaApp();
    const response = await app.inject({ method: 'GET', url: '/tasks/1' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('spa-fallback-fixture');
  });

  it('keeps the JSON 404 for an unmatched API path', async () => {
    const app = buildSpaApp();
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(() => response.json()).not.toThrow();
  });

  it('does not swallow a non-GET/HEAD request to an unmatched path', async () => {
    const app = buildSpaApp();
    const response = await app.inject({ method: 'POST', url: '/people' });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('spa-fallback-fixture');
  });
});
