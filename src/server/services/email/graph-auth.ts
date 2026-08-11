import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PublicClientApplication, type AccountInfo, type ICachePlugin } from '@azure/msal-node';

const SCOPES = ['Mail.Read', 'offline_access'];
const SIGN_IN_ERROR = 'Mailbox sign-in required — run npm run mail:signin';
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

export interface GraphAuth {
  /** Silently acquires an access token from the cached refresh token; throws the sign-in error if none is cached or valid. */
  getAccessToken: () => Promise<string>;
  /** Runs the interactive device-code flow, invoking `onCode` with the verification URL and user code to show. */
  signIn: (onCode: (verificationUri: string, userCode: string) => void) => Promise<void>;
}

export function createGraphAuth(options: GraphAuthOptions): GraphAuth {
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
        throw new Error(SIGN_IN_ERROR);
      }
      try {
        const result = await pca.acquireTokenSilent({ account, scopes: SCOPES });
        if (!result?.accessToken) {
          throw new Error(SIGN_IN_ERROR);
        }
        return result.accessToken;
      } catch {
        throw new Error(SIGN_IN_ERROR);
      }
    },
    async signIn(onCode) {
      const result = await pca.acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (response) => {
          // msal-node destructures Microsoft's response without checking for an error body,
          // so a rejected request arrives here with every field undefined. Throwing rejects
          // the acquireTokenByDeviceCode promise before the doomed token polling starts.
          if (!response.verificationUri || !response.userCode) {
            throw new Error(DEVICE_CODE_REJECTED);
          }
          onCode(response.verificationUri, response.userCode);
        },
      });
      if (!result) {
        throw new Error('Sign-in did not complete');
      }
    },
  };
}
