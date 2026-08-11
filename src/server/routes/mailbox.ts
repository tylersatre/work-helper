import type { FastifyInstance } from 'fastify';
import type { SignInAttempt as ManagerSignInAttempt } from '../services/email/mailbox-connection.js';

type ApiSignInAttempt =
  | { status: 'pending'; verificationUri: string; userCode: string; expiresAt: number }
  | { status: 'failed'; error: string };

type MailboxStatus =
  | { state: 'not-configured'; missing: string[] }
  | { state: 'not-connected'; reason: 'never-signed-in' | 'expired'; detail?: string; attempt?: ApiSignInAttempt }
  | { state: 'connected'; account: string };

const NOT_CONFIGURED_MESSAGE = 'Mail is not configured — set MS_CLIENT_ID and MS_TENANT_ID (see .env.example)';

function toApiAttempt(attempt: ManagerSignInAttempt): ApiSignInAttempt {
  if (attempt.status === 'pending') {
    return { status: 'pending', verificationUri: attempt.verificationUri, userCode: attempt.userCode, expiresAt: attempt.expiresAt };
  }
  return { status: 'failed', error: attempt.error };
}

async function buildStatus(app: FastifyInstance): Promise<MailboxStatus> {
  if (!app.mailboxAuth) {
    return { state: 'not-configured', missing: app.mailboxMissingSettings };
  }

  const verification = await app.mailboxAuth.verifyConnection();
  if (verification.connected) {
    return { state: 'connected', account: verification.account };
  }

  const attempt = app.mailboxConnection?.getAttempt();
  if (verification.reason === 'expired') {
    return { state: 'not-connected', reason: 'expired', detail: verification.detail, attempt: attempt ? toApiAttempt(attempt) : undefined };
  }
  return { state: 'not-connected', reason: 'never-signed-in', attempt: attempt ? toApiAttempt(attempt) : undefined };
}

export async function mailboxRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/mailbox', async () => {
    return buildStatus(app);
  });

  app.post('/api/mailbox/connect', async (_request, reply) => {
    if (!app.mailboxAuth || !app.mailboxConnection) {
      reply.status(409);
      return { error: { message: NOT_CONFIGURED_MESSAGE } };
    }

    const verification = await app.mailboxAuth.verifyConnection();
    if (verification.connected) {
      return { state: 'connected', account: verification.account } satisfies MailboxStatus;
    }

    try {
      await app.mailboxConnection.connect();
    } catch (error) {
      reply.status(502);
      const message = error instanceof Error ? error.message : String(error);
      return { error: { message } };
    }

    return buildStatus(app);
  });
}
