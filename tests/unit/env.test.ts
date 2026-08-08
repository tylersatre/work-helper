import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/server/env.js';

describe('validateEnv', () => {
  it('throws naming CONNECTOR_PASSWORD when missing in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/CONNECTOR_PASSWORD/);
  });

  it('throws naming CONNECTOR_PASSWORD when empty in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', CONNECTOR_PASSWORD: '' })).toThrow(/CONNECTOR_PASSWORD/);
  });

  it('passes when CONNECTOR_PASSWORD is set in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', CONNECTOR_PASSWORD: 'secret' })).not.toThrow();
  });

  it('does not fail outside production when CONNECTOR_PASSWORD is missing', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateEnv({})).not.toThrow();
  });
});
