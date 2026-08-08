import { createGraphAuth } from '../src/server/services/email/graph-auth.js';

async function main(): Promise<void> {
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) {
    console.error('MS_CLIENT_ID is required (Entra ID app registration client id).');
    process.exit(1);
  }

  const tokenCachePath = process.env.MAIL_TOKEN_CACHE_PATH ?? './data/mail-token-cache.json';
  const auth = createGraphAuth({ clientId, tokenCachePath });

  await auth.signIn((verificationUri, userCode) => {
    console.log(`To sign in, go to ${verificationUri} and enter the code: ${userCode}`);
  });

  console.log(`Signed in. Token cache written to ${tokenCachePath}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
