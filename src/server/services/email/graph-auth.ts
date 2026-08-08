import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PublicClientApplication, type AccountInfo, type ICachePlugin } from '@azure/msal-node';

const SCOPES = ['Mail.Read', 'offline_access'];
const AUTHORITY = 'https://login.microsoftonline.com/common';
const SIGN_IN_ERROR = 'Mailbox sign-in required — run npm run mail:signin';

function fileCachePlugin(path: string): ICachePlugin {
  return {
    beforeCacheAccess: async (context) => {
      if (existsSync(path)) {
        context.tokenCache.deserialize(readFileSync(path, 'utf-8'));
      }
    },
    afterCacheAccess: async (context) => {
      if (context.cacheHasChanged) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, context.tokenCache.serialize());
      }
    },
  };
}

export interface GraphAuthOptions {
  clientId: string;
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
    auth: { clientId: options.clientId, authority: AUTHORITY },
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
        deviceCodeCallback: (response) => onCode(response.verificationUri, response.userCode),
      });
      if (!result) {
        throw new Error('Sign-in did not complete');
      }
    },
  };
}
