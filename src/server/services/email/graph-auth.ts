import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PublicClientApplication, type AccountInfo, type ICachePlugin } from '@azure/msal-node';

const SCOPES = ['Mail.Read', 'Calendars.Read', 'offline_access'];
const DEVICE_CODE_REJECTED =
  'Microsoft rejected the device-code request before issuing a sign-in code. Check that MS_TENANT_ID matches the app registration\'s Directory (tenant) ID, MS_CLIENT_ID matches its Application (client) ID, and "Allow public client flows" is enabled under Authentication.';

export function fileCachePlugin(path: string): ICachePlugin {
  return {
    beforeCacheAccess: async (context) => {
      if (existsSync(path)) {
        context.tokenCache.deserialize(readFileSync(path, 'utf-8'));
      }
    },
    afterCacheAccess: async (context) => {
      if (context.cacheHasChanged) {
        // Holds a long-lived Graph refresh token — never leave it group/world-readable.
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileSync(path, context.tokenCache.serialize(), { mode: 0o600 });
        chmodSync(path, 0o600);
      }
    },
  };
}

export interface GraphAuthOptions {
  clientId: string;
  /** Entra Directory (tenant) ID. Single-tenant app registrations are rejected at the /common authority, so the tenant is always named explicitly. */
  tenantId: string;
  tokenCachePath: string;
}

export type ConnectionVerification =
  | { connected: true; account: string }
  | { connected: false; reason: 'never-signed-in' }
  | { connected: false; reason: 'expired'; detail: string };

/** Thrown by getAccessToken() when the mailbox needs (re)connecting; carries the same reason/detail as ConnectionVerification (FR-011). */
export class MailboxNotConnectedError extends Error {
  readonly reason: 'never-signed-in' | 'expired';
  readonly detail?: string;

  constructor(reason: 'never-signed-in' | 'expired', detail?: string) {
    super(
      reason === 'never-signed-in'
        ? 'Mailbox is not connected (never signed in) — connect the mailbox on the Sync page.'
        : `Mailbox sign-in has expired (${detail}) — reconnect the mailbox on the Sync page.`,
    );
    this.name = 'MailboxNotConnectedError';
    this.reason = reason;
    this.detail = detail;
  }
}

export interface MailboxAuth {
  /** Silently acquires an access token from the cached refresh token; throws MailboxNotConnectedError if none is cached or valid. */
  getAccessToken: () => Promise<string>;
  /** Proves connection state right now via silent token acquisition — never cached (FR-007). */
  verifyConnection: () => Promise<ConnectionVerification>;
  /** Runs the interactive device-code flow, invoking `onCode` with the verification URL, user code, and code expiry to show; resolves the signed-in account's username. */
  beginSignIn: (onCode: (verificationUri: string, userCode: string, expiresAt: number) => void) => Promise<{ account: string }>;
  /** Removes the cached account, persisting the removal through the file cache plugin (FR-009). */
  signOut: () => Promise<void>;
}

export function createGraphAuth(options: GraphAuthOptions): MailboxAuth {
  const pca = new PublicClientApplication({
    auth: { clientId: options.clientId, authority: `https://login.microsoftonline.com/${options.tenantId}` },
    cache: { cachePlugin: fileCachePlugin(options.tokenCachePath) },
  });

  async function currentAccount(): Promise<AccountInfo | undefined> {
    const accounts = await pca.getTokenCache().getAllAccounts();
    return accounts[0];
  }

  return {
    async getAccessToken() {
      const account = await currentAccount();
      if (!account) {
        throw new MailboxNotConnectedError('never-signed-in');
      }
      try {
        const result = await pca.acquireTokenSilent({ account, scopes: SCOPES });
        if (!result?.accessToken) {
          throw new Error('Silent token acquisition returned no access token');
        }
        return result.accessToken;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new MailboxNotConnectedError('expired', detail);
      }
    },
    async verifyConnection() {
      const account = await currentAccount();
      if (!account) {
        return { connected: false, reason: 'never-signed-in' };
      }
      try {
        const result = await pca.acquireTokenSilent({ account, scopes: SCOPES });
        if (!result?.accessToken) {
          throw new Error('Silent token acquisition returned no access token');
        }
        return { connected: true, account: account.username };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { connected: false, reason: 'expired', detail };
      }
    },
    async beginSignIn(onCode) {
      const result = await pca.acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (response) => {
          // msal-node destructures Microsoft's response without checking for an error body,
          // so a rejected request arrives here with every field undefined. Throwing rejects
          // the acquireTokenByDeviceCode promise before the doomed token polling starts.
          if (!response.verificationUri || !response.userCode) {
            throw new Error(DEVICE_CODE_REJECTED);
          }
          onCode(response.verificationUri, response.userCode, Date.now() + response.expiresIn * 1000);
        },
      });
      if (!result) {
        throw new Error('Sign-in did not complete');
      }
      return { account: result.account?.username ?? '' };
    },
    async signOut() {
      const account = await currentAccount();
      if (account) {
        await pca.getTokenCache().removeAccount(account);
      }
    },
  };
}
