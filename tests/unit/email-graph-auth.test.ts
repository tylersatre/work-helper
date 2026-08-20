import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MailWritePermissionError,
  MailboxNotConnectedError,
  createGraphAuth,
  fileCachePlugin,
} from '../../src/server/services/email/graph-auth.js';

const msalConstructorConfigs: { auth?: { clientId?: string; authority?: string } }[] = [];
const acquireTokenByDeviceCode = vi.fn();
const acquireTokenSilent = vi.fn();
const removeAccount = vi.fn();
let mockAccounts: { username: string }[] = [];

vi.mock('@azure/msal-node', () => ({
  PublicClientApplication: class {
    constructor(config: never) {
      msalConstructorConfigs.push(config);
    }
    getTokenCache() {
      return { getAllAccounts: async () => mockAccounts, removeAccount };
    }
    acquireTokenByDeviceCode(request: never) {
      return acquireTokenByDeviceCode(request);
    }
    acquireTokenSilent(request: never) {
      return acquireTokenSilent(request);
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
    acquireTokenSilent.mockReset();
    removeAccount.mockReset();
    mockAccounts = [];
  });

  it('authenticates against the tenant-specific authority, not /common — single-tenant app registrations are rejected at /common (AADSTS50059)', () => {
    createGraphAuth(options);

    expect(msalConstructorConfigs).toHaveLength(1);
    expect(msalConstructorConfigs[0]?.auth?.authority).toBe('https://login.microsoftonline.com/tenant-id-guid');
  });

  describe('beginSignIn', () => {
    it('passes the verification URI, user code, and an expiry derived from expiresIn to onCode, resolving the signed-in account', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      acquireTokenByDeviceCode.mockImplementation(async (request: { deviceCodeCallback: (response: unknown) => void }) => {
        request.deviceCodeCallback({ verificationUri: 'https://login.microsoft.com/device', userCode: 'ABC123', expiresIn: 900 });
        return { account: { username: 'tyler@example.com' } };
      });
      const onCode = vi.fn();

      const result = await createGraphAuth(options).beginSignIn(onCode);

      expect(onCode).toHaveBeenCalledWith('https://login.microsoft.com/device', 'ABC123', 1_000_000 + 900_000);
      expect(result).toEqual({ account: 'tyler@example.com' });
      nowSpy.mockRestore();
    });

    it('rejects with an error naming the likely registration problems when the device-code response carries no code — never shows "undefined" to the user', async () => {
      // msal-node blindly destructures Microsoft's error body, so a rejected device-code
      // request reaches the callback as { userCode: undefined, verificationUri: undefined }.
      acquireTokenByDeviceCode.mockImplementation(async (request: { deviceCodeCallback: (response: unknown) => void }) => {
        request.deviceCodeCallback({});
        return null;
      });
      const onCode = vi.fn();

      await expect(createGraphAuth(options).beginSignIn(onCode)).rejects.toThrow(/MS_TENANT_ID|public client/i);
      expect(onCode).not.toHaveBeenCalled();
    });
  });

  describe('verifyConnection', () => {
    it('returns connected: true with the account username when silent acquisition succeeds', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      acquireTokenSilent.mockResolvedValue({ accessToken: 'token-abc' });

      const result = await createGraphAuth(options).verifyConnection();

      expect(result).toEqual({ connected: true, account: 'tyler@example.com' });
    });

    it('returns not-connected with reason never-signed-in when no account is cached', async () => {
      mockAccounts = [];

      const result = await createGraphAuth(options).verifyConnection();

      expect(result).toEqual({ connected: false, reason: 'never-signed-in' });
    });

    it('returns not-connected with reason expired and the provider detail when an account exists but silent acquisition fails', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      acquireTokenSilent.mockRejectedValue(new Error('AADSTS70008: expired refresh token'));

      const result = await createGraphAuth(options).verifyConnection();

      expect(result).toEqual({ connected: false, reason: 'expired', detail: 'AADSTS70008: expired refresh token' });
    });
  });

  describe('signOut', () => {
    it('calls getTokenCache().removeAccount with the cached account so the cache plugin persists the removal', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];

      await createGraphAuth(options).signOut();

      expect(removeAccount).toHaveBeenCalledWith(mockAccounts[0]);
    });

    it('is a no-op when no account is cached', async () => {
      mockAccounts = [];

      await createGraphAuth(options).signOut();

      expect(removeAccount).not.toHaveBeenCalled();
    });
  });

  describe('getAccessToken', () => {
    it('throws a typed MailboxNotConnectedError with reason never-signed-in when no account is cached', async () => {
      mockAccounts = [];

      const auth = createGraphAuth(options);

      await expect(auth.getAccessToken()).rejects.toThrow(MailboxNotConnectedError);
      await expect(auth.getAccessToken()).rejects.toMatchObject({ reason: 'never-signed-in' });
    });

    it('throws a typed MailboxNotConnectedError with reason expired and detail when silent acquisition fails', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      acquireTokenSilent.mockRejectedValue(new Error('AADSTS70008: expired refresh token'));

      const auth = createGraphAuth(options);

      await expect(auth.getAccessToken()).rejects.toMatchObject({ reason: 'expired', detail: 'AADSTS70008: expired refresh token' });
    });

    it('returns the access token when silent acquisition succeeds', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      acquireTokenSilent.mockResolvedValue({ accessToken: 'token-abc' });

      const token = await createGraphAuth(options).getAccessToken();

      expect(token).toBe('token-abc');
    });

    it("the thrown error's message directs to the Sync page and never mentions the CLI", async () => {
      mockAccounts = [];

      await expect(createGraphAuth(options).getAccessToken()).rejects.toThrow(/sync page/i);
      let error: Error | undefined;
      try {
        await createGraphAuth(options).getAccessToken();
      } catch (caught) {
        error = caught as Error;
      }
      expect(error?.message).not.toMatch(/mail:signin/i);
    });
  });

  describe('scope split (research R2)', () => {
    it('beginSignIn requests SIGN_IN_SCOPES: Mail.Read, Mail.ReadWrite, Calendars.Read, offline_access', async () => {
      acquireTokenByDeviceCode.mockImplementation(async (request: { deviceCodeCallback: (response: unknown) => void }) => {
        request.deviceCodeCallback({ verificationUri: 'https://login.microsoft.com/device', userCode: 'ABC123', expiresIn: 900 });
        return { account: { username: 'tyler@example.com' } };
      });

      await createGraphAuth(options).beginSignIn(() => {});

      expect(acquireTokenByDeviceCode).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ['Mail.Read', 'Mail.ReadWrite', 'Calendars.Read', 'offline_access'] }),
      );
    });

    it('getAccessToken still acquires with READ_SCOPES (Mail.Read, Calendars.Read, offline_access) — pre-feature sign-ins keep syncing', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      acquireTokenSilent.mockResolvedValue({ accessToken: 'token-abc' });

      await createGraphAuth(options).getAccessToken();

      expect(acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['Mail.Read', 'Calendars.Read', 'offline_access'] }));
    });

    it('verifyConnection still acquires with READ_SCOPES', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      acquireTokenSilent.mockResolvedValue({ accessToken: 'token-abc' });

      await createGraphAuth(options).verifyConnection();

      expect(acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['Mail.Read', 'Calendars.Read', 'offline_access'] }));
    });
  });

  describe('getWriteAccessToken (research R2)', () => {
    function mockScopedSilent(outcomes: { write: 'ok' | 'fail'; read: 'ok' | 'fail' }) {
      acquireTokenSilent.mockImplementation(async (request: { scopes: string[] }) => {
        const isWriteRequest = request.scopes.includes('Mail.ReadWrite');
        const result = isWriteRequest ? outcomes.write : outcomes.read;
        if (result === 'fail') {
          throw new Error(isWriteRequest ? 'AADSTS65001: no consent for Mail.ReadWrite' : 'AADSTS70008: expired refresh token');
        }
        return { accessToken: isWriteRequest ? 'write-token-abc' : 'read-token-abc' };
      });
    }

    it('acquires silently with WRITE_SCOPES = [Mail.ReadWrite] and returns the token when it succeeds', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      mockScopedSilent({ write: 'ok', read: 'ok' });

      const token = await createGraphAuth(options).getWriteAccessToken();

      expect(token).toBe('write-token-abc');
      expect(acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['Mail.ReadWrite'] }));
    });

    it('throws MailWritePermissionError when write-scope acquisition fails but read-scope succeeds (pre-feature sign-in)', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      mockScopedSilent({ write: 'fail', read: 'ok' });

      await expect(createGraphAuth(options).getWriteAccessToken()).rejects.toThrow(MailWritePermissionError);
    });

    it('throws MailboxNotConnectedError(expired) when both write- and read-scope acquisition fail', async () => {
      mockAccounts = [{ username: 'tyler@example.com' }];
      mockScopedSilent({ write: 'fail', read: 'fail' });

      const auth = createGraphAuth(options);
      await expect(auth.getWriteAccessToken()).rejects.toThrow(MailboxNotConnectedError);
      await expect(createGraphAuth(options).getWriteAccessToken()).rejects.toMatchObject({
        reason: 'expired',
        detail: 'AADSTS70008: expired refresh token',
      });
    });

    it('throws MailboxNotConnectedError(never-signed-in) when no account is cached', async () => {
      mockAccounts = [];

      await expect(createGraphAuth(options).getWriteAccessToken()).rejects.toMatchObject({ reason: 'never-signed-in' });
    });
  });
});
