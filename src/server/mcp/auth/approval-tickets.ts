import { randomBytes } from 'node:crypto';

export interface PendingApproval {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  expiresAt: number;
}

export type BoundApproval = Omit<PendingApproval, 'expiresAt'>;

export interface ApprovalTicketStore {
  issueTicket(pending: BoundApproval): string;
  redeemTicket(ticket: string): BoundApproval | undefined;
}

const TICKET_TTL_MS = 10 * 60_000;

/** Fresh in-memory store — call once per app instance so a rebuilt app (simulated restart) starts empty. */
export function createApprovalTicketStore(): ApprovalTicketStore {
  const tickets = new Map<string, PendingApproval>();

  return {
    issueTicket(pending) {
      const ticket = randomBytes(32).toString('base64url');
      tickets.set(ticket, { ...pending, expiresAt: Date.now() + TICKET_TTL_MS });
      return ticket;
    },

    redeemTicket(ticket) {
      const pending = tickets.get(ticket);
      if (!pending) {
        return undefined;
      }
      tickets.delete(ticket);
      if (pending.expiresAt < Date.now()) {
        return undefined;
      }
      const { clientId, redirectUri, codeChallenge, state } = pending;
      return { clientId, redirectUri, codeChallenge, state };
    },
  };
}
