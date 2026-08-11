import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGraphAuth, fileCachePlugin } from '../../src/server/services/email/graph-auth.js';

const msalConstructorConfigs: { auth?: { clientId?: string; authority?: string } }[] = [];
const acquireTokenByDeviceCode = vi.fn();

vi.mock('@azure/msal-node', () => ({
  PublicClientApplication: class {
    constructor(config: never) {
      msalConstructorConfigs.push(config);
    }
    getTokenCache() {
      return { getAllAccounts: async () => [] };
    }
    acquireTokenByDeviceCode(request: never) {
      return acquireTokenByDeviceCode(request);
    }
  },
}));

describe('fileCachePlugin', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mail-token-cache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the token cache file and its parent directory as owner-only (0600/0700) — it holds a live mailbox refresh token', async () => {
    const cachePath = join(dir, 'nested', 'mail-token-cache.json');
    const plugin = fileCachePlugin(cachePath);

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => '{"fake":"cache"}', deserialize: () => {} },
    } as never);

    const fileMode = statSync(cachePath).mode & 0o777;
    expect(fileMode).toBe(0o600);

    const dirMode = statSync(join(dir, 'nested')).mode & 0o777;
    expect(dirMode).toBe(0o700);
  });

  it('tightens permissions on an already-existing cache file written before this fix', async () => {
    const cachePath = join(dir, 'mail-token-cache.json');
    const plugin = fileCachePlugin(cachePath);

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => '{"first":"write"}', deserialize: () => {} },
    } as never);
    // Simulate a pre-fix world-readable file already on disk.
    const { chmodSync } = await import('node:fs');
    chmodSync(cachePath, 0o644);

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => '{"second":"write"}', deserialize: () => {} },
    } as never);

    const fileMode = statSync(cachePath).mode & 0o777;
    expect(fileMode).toBe(0o600);
  });
});

describe('createGraphAuth', () => {
  const options = {
    clientId: 'client-id-guid',
    tenantId: 'tenant-id-guid',
    tokenCachePath: '/unused/mail-token-cache.json',
  };

  beforeEach(() => {
    msalConstructorConfigs.length = 0;
    acquireTokenByDeviceCode.mockReset();
  });

  it('authenticates against the tenant-specific authority, not /common — single-tenant app registrations are rejected at /common (AADSTS50059)', () => {
    createGraphAuth(options);

    expect(msalConstructorConfigs).toHaveLength(1);
    expect(msalConstructorConfigs[0]?.auth?.authority).toBe('https://login.microsoftonline.com/tenant-id-guid');
  });

  it('passes the verification URI and user code to onCode during sign-in', async () => {
    acquireTokenByDeviceCode.mockImplementation(async (request: { deviceCodeCallback: (response: unknown) => void }) => {
      request.deviceCodeCallback({ verificationUri: 'https://login.microsoft.com/device', userCode: 'ABC123' });
      return { account: {} };
    });
    const onCode = vi.fn();

    await createGraphAuth(options).signIn(onCode);

    expect(onCode).toHaveBeenCalledWith('https://login.microsoft.com/device', 'ABC123');
  });

  it('rejects with an error naming the likely registration problems when the device-code response carries no code — never shows "undefined" to the user', async () => {
    // msal-node blindly destructures Microsoft's error body, so a rejected device-code
    // request reaches the callback as { userCode: undefined, verificationUri: undefined }.
    acquireTokenByDeviceCode.mockImplementation(async (request: { deviceCodeCallback: (response: unknown) => void }) => {
      request.deviceCodeCallback({});
      return null;
    });
    const onCode = vi.fn();

    await expect(createGraphAuth(options).signIn(onCode)).rejects.toThrow(/MS_TENANT_ID|public client/i);
    expect(onCode).not.toHaveBeenCalled();
  });
});
