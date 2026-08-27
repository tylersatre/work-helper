import type { FastifyInstance } from 'fastify';
import type { EmailSignature } from '../../shared/types.js';
import { emailSignatureInputSchema } from '../../shared/validation.js';
import { getAppState, setAppState } from '../services/app-state.js';

const SIGNATURE_KEY = 'email.signature';

export async function emailSignatureRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/email-signature', async (): Promise<EmailSignature> => {
    const raw = getAppState(app.db, SIGNATURE_KEY);
    return { signature: raw && raw !== '' ? raw : null };
  });

  app.put('/api/email-signature', async (request, reply) => {
    const result = emailSignatureInputSchema.safeParse(request.body);
    if (!result.success) {
      reply.status(400);
      return { error: { message: result.error.issues[0]?.message ?? 'signature must be a string' } };
    }

    const trimmed = result.data.signature.trim();
    if (trimmed === '') {
      setAppState(app.db, SIGNATURE_KEY, '');
      return { signature: null };
    }

    setAppState(app.db, SIGNATURE_KEY, result.data.signature);
    return { signature: result.data.signature };
  });
}
