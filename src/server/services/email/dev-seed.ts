import type { SeedMessage } from './fake-provider.js';

/**
 * Dev-only seeded mailbox for `MAIL_PROVIDER=fake` (see index.ts). Mirrors spec.md US1 scenario 2
 * so browser evidence can exercise a real sync against a known, reproducible mailbox.
 */
export const DEV_SEED_MESSAGES: SeedMessage[] = [
  {
    id: 'dev-msg-pricing-question',
    conversationId: 'dev-conv-pricing',
    subject: 'Pricing question',
    body: { content: 'Can you send the updated pricing sheet?', contentType: 'text' },
    receivedDateTime: '2026-08-04T18:00:00Z',
    sentDateTime: '2026-08-04T18:00:00Z',
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
  },
  {
    id: 'dev-msg-pricing-reply',
    conversationId: 'dev-conv-pricing',
    subject: 'Re: Pricing question',
    body: { content: 'Here it is.', contentType: 'text' },
    receivedDateTime: '2026-08-05T15:00:00Z',
    sentDateTime: '2026-08-05T15:00:00Z',
    from: { address: 'tyler@example.com', name: 'Tyler Satre' },
    toRecipients: [{ address: 'sam.rivera@example.com', name: 'Sam Rivera' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'sent',
  },
];
