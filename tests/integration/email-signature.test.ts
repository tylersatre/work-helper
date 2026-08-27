import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { createDb } from '../../src/server/db/index.js';

const LANES = ['To Do', 'In Progress', 'Waiting', 'Done'];

function buildTestApp() {
  const { db } = createDb(':memory:');
  return buildApp({ db, lanes: LANES });
}

describe('email signature API (US4)', () => {
  it('returns { signature: null } before any save', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/email-signature' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ signature: null });
  });

  it('echoes the saved value on PUT, and a subsequent GET returns it verbatim', async () => {
    const app = buildTestApp();

    const putResponse = await app.inject({
      method: 'PUT',
      url: '/api/email-signature',
      payload: { signature: '<p>Tyler Satre</p><p>Example Corp</p>' },
    });

    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json()).toEqual({ signature: '<p>Tyler Satre</p><p>Example Corp</p>' });

    const getResponse = await app.inject({ method: 'GET', url: '/api/email-signature' });
    expect(getResponse.json()).toEqual({ signature: '<p>Tyler Satre</p><p>Example Corp</p>' });
  });

  it('a whitespace-only PUT clears the signature (GET returns null again)', async () => {
    const app = buildTestApp();
    await app.inject({ method: 'PUT', url: '/api/email-signature', payload: { signature: '<p>Tyler Satre</p>' } });

    const putResponse = await app.inject({ method: 'PUT', url: '/api/email-signature', payload: { signature: '   ' } });
    expect(putResponse.statusCode).toBe(200);

    const getResponse = await app.inject({ method: 'GET', url: '/api/email-signature' });
    expect(getResponse.json()).toEqual({ signature: null });
  });

  it('rejects a non-string body with 400 and the house { error: { message } } shape', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'PUT', url: '/api/email-signature', payload: { signature: 42 } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error.message');
  });
});
