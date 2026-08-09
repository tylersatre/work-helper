import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApprovalTicketStore } from '../../src/server/mcp/auth/approval-tickets.js';

const PENDING = {
  clientId: 'client-123',
  redirectUri: 'http://localhost:8976/callback',
  codeChallenge: 'abc123',
  state: 'xyz',
};

describe('createApprovalTicketStore', () => {
  it('issues an unguessable base64url ticket (256-bit)', () => {
    const store = createApprovalTicketStore();
    const ticket = store.issueTicket(PENDING);

    expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(ticket, 'base64url').length).toBe(32);
  });

  it('redeem returns the bound params exactly once', () => {
    const store = createApprovalTicketStore();
    const ticket = store.issueTicket(PENDING);

    expect(store.redeemTicket(ticket)).toEqual(PENDING);
    expect(store.redeemTicket(ticket)).toBeUndefined();
  });

  it('fails to redeem an unknown ticket', () => {
    const store = createApprovalTicketStore();
    expect(store.redeemTicket('does-not-exist')).toBeUndefined();
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('expires after 10 minutes', () => {
      const store = createApprovalTicketStore();
      const ticket = store.issueTicket(PENDING);

      vi.advanceTimersByTime(10 * 60_000 + 1);

      expect(store.redeemTicket(ticket)).toBeUndefined();
    });

    it('is still redeemable just before the TTL elapses', () => {
      const store = createApprovalTicketStore();
      const ticket = store.issueTicket(PENDING);

      vi.advanceTimersByTime(10 * 60_000 - 1);

      expect(store.redeemTicket(ticket)).toEqual(PENDING);
    });
  });
});
