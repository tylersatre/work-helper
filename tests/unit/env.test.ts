import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/server/env.js';

const BOTH_SET = { NODE_ENV: 'production', MCP_TOKEN_SECRET: 'secret', AUTHENTIK_USERINFO_URL: 'http://authentik:9000/application/o/userinfo/' };

describe('validateEnv', () => {
  it('throws naming MCP_TOKEN_SECRET when missing in production', () => {
    expect(() => validateEnv({ ...BOTH_SET, MCP_TOKEN_SECRET: undefined })).toThrow(/MCP_TOKEN_SECRET/);
  });

  it('points at .env.example when MCP_TOKEN_SECRET is missing', () => {
    expect(() => validateEnv({ ...BOTH_SET, MCP_TOKEN_SECRET: undefined })).toThrow(/\.env\.example/);
  });

  it('throws naming MCP_TOKEN_SECRET when empty in production', () => {
    expect(() => validateEnv({ ...BOTH_SET, MCP_TOKEN_SECRET: '' })).toThrow(/MCP_TOKEN_SECRET/);
  });

  it('throws naming AUTHENTIK_USERINFO_URL when missing in production', () => {
    expect(() => validateEnv({ ...BOTH_SET, AUTHENTIK_USERINFO_URL: undefined })).toThrow(/AUTHENTIK_USERINFO_URL/);
  });

  it('points at .env.example when AUTHENTIK_USERINFO_URL is missing', () => {
    expect(() => validateEnv({ ...BOTH_SET, AUTHENTIK_USERINFO_URL: undefined })).toThrow(/\.env\.example/);
  });

  it('throws naming AUTHENTIK_USERINFO_URL when empty in production', () => {
    expect(() => validateEnv({ ...BOTH_SET, AUTHENTIK_USERINFO_URL: '' })).toThrow(/AUTHENTIK_USERINFO_URL/);
  });

  it('passes when both MCP_TOKEN_SECRET and AUTHENTIK_USERINFO_URL are set in production', () => {
    expect(() => validateEnv(BOTH_SET)).not.toThrow();
  });

  it('does not fail outside production when both are missing', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateEnv({})).not.toThrow();
  });

  it('throws naming MS_TENANT_ID when MS_CLIENT_ID is set without it in production', () => {
    expect(() => validateEnv({ ...BOTH_SET, MS_CLIENT_ID: 'client-id-guid' })).toThrow(/MS_TENANT_ID/);
  });

  it('points at .env.example when MS_TENANT_ID is missing', () => {
    expect(() => validateEnv({ ...BOTH_SET, MS_CLIENT_ID: 'client-id-guid' })).toThrow(/\.env\.example/);
  });

  it('passes when MS_CLIENT_ID and MS_TENANT_ID are both set in production', () => {
    expect(() => validateEnv({ ...BOTH_SET, MS_CLIENT_ID: 'client-id-guid', MS_TENANT_ID: 'tenant-id-guid' })).not.toThrow();
  });

  it('does not require MS_TENANT_ID when MS_CLIENT_ID is unset — email sync is optional', () => {
    expect(() => validateEnv({ ...BOTH_SET, MS_CLIENT_ID: undefined, MS_TENANT_ID: undefined })).not.toThrow();
    expect(() => validateEnv({ ...BOTH_SET, MS_CLIENT_ID: '', MS_TENANT_ID: undefined })).not.toThrow();
  });

  it('never mentions CONNECTOR_PASSWORD', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow();
    try {
      validateEnv({ NODE_ENV: 'production' });
    } catch (error) {
      expect(String(error)).not.toContain('CONNECTOR_PASSWORD');
    }
  });
});
