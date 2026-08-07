import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { oauthClients } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';

type AppDb = BetterSQLite3Database<typeof schema>;

function isAcceptedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'http:') {
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  }
  return true;
}

const registerClientSchema = z.object({
  redirect_uris: z
    .array(z.string().refine(isAcceptedRedirectUri, 'redirect_uris must be absolute URIs (http allowed only for loopback hosts)'))
    .min(1, 'redirect_uris must be a non-empty array'),
  client_name: z.string().optional(),
});

export type RegisterClientResult =
  | { ok: true; clientId: string; clientName?: string; redirectUris: string[]; createdAt: number }
  | { ok: false; error: string };

export function registerClient(db: AppDb, rawInput: unknown): RegisterClientResult {
  const result = registerClientSchema.safeParse(rawInput);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'invalid client metadata' };
  }

  const clientId = randomUUID();
  const createdAt = Date.now();

  db.insert(oauthClients)
    .values({
      clientId,
      clientName: result.data.client_name ?? null,
      redirectUris: result.data.redirect_uris,
      createdAt,
    })
    .run();

  return { ok: true, clientId, clientName: result.data.client_name, redirectUris: result.data.redirect_uris, createdAt };
}

export function findClient(db: AppDb, clientId: string) {
  const [row] = db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1).all();
  return row;
}
