import type { SeedMessage } from './fake-provider.js';

/**
 * Dev-only seeded mailbox for `MAIL_PROVIDER=fake` (see index.ts). Scenario-rich mailbox for
 * 014-email-ui browser evidence: the US1 "Pricing question"/"Quote attached" pair with exact
 * spec.md metadata, 30 conversations total (load-more), an inline-only-attachment message, and
 * unmatched addresses for the US3/US4 scenarios.
 */

const PRICING_QUESTION_HTML =
  'Can you send the <b>updated pricing sheet</b>? See <a href="https://example.com/pricing">the pricing page</a> for context.<script>window.__xss = true;</script>';

const pricingQuestion: SeedMessage = {
  id: 'dev-msg-pricing-question',
  conversationId: 'dev-conv-pricing',
  subject: 'Pricing question',
  body: { content: PRICING_QUESTION_HTML, contentType: 'html' },
  receivedDateTime: '2026-08-04T18:00:00Z',
  sentDateTime: '2026-08-04T18:00:00Z',
  from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
  toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
  ccRecipients: [],
  bccRecipients: [],
  folder: 'inbox',
  isRead: true,
};

const pricingReply: SeedMessage = {
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
  isRead: true,
};

const quoteAttached: SeedMessage = {
  id: 'dev-msg-quote-attached',
  conversationId: 'dev-conv-quote',
  subject: 'Quote attached',
  body: { content: 'See the attached quote.', contentType: 'text' },
  receivedDateTime: '2026-08-06T09:01:00Z',
  sentDateTime: '2026-08-06T09:00:00Z',
  from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
  toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
  ccRecipients: [{ address: 'ana.alvarez@example.com', name: 'Ana Alvarez' }],
  bccRecipients: [],
  folder: 'inbox',
  isRead: false,
  importance: 'high',
  flagStatus: 'flagged',
  categories: ['Orange category'],
  webLink: 'https://outlook.office365.com/owa/?ItemID=dev-msg-quote-attached',
  attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', sizeBytes: 52 * 1024, isInline: false }],
};

/** A message whose only attachment is inline — no attachment indicator, no attachment list entry. */
const signatureOnly: SeedMessage = {
  id: 'dev-msg-signature-only',
  conversationId: 'dev-conv-signature',
  subject: 'Meeting notes',
  body: { content: 'Notes from today.', contentType: 'text' },
  receivedDateTime: '2026-08-03T12:00:00Z',
  sentDateTime: '2026-08-03T12:00:00Z',
  from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
  toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
  ccRecipients: [],
  bccRecipients: [],
  folder: 'inbox',
  isRead: true,
  attachments: [{ name: 'signature.png', contentType: 'image/png', sizeBytes: 4096, isInline: true }],
};

/** Unmatched from-address, display name splits two-word for the create-person prefill (US4 sc2). */
const jordanSmith: SeedMessage = {
  id: 'dev-msg-jordan-smith',
  conversationId: 'dev-conv-jordan',
  subject: 'Introduction',
  body: { content: 'Nice to meet you.', contentType: 'text' },
  receivedDateTime: '2026-08-02T10:00:00Z',
  sentDateTime: '2026-08-02T10:00:00Z',
  from: { address: 'jordan.smith@example.com', name: 'Jordan Smith' },
  toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
  ccRecipients: [],
  bccRecipients: [],
  folder: 'inbox',
  isRead: true,
};

/** A draft message so the Draft chip/badge (031-mcp-email-drafts US1) are visible without any tool call. */
const followUpDraft: SeedMessage = {
  id: 'dev-msg-followup-draft',
  conversationId: 'dev-conv-followup-draft',
  subject: 'Follow-up notes',
  body: { content: '<p>A few thoughts before I send this.</p>', contentType: 'html' },
  receivedDateTime: '2026-08-07T09:00:00Z',
  sentDateTime: '2026-08-07T09:00:00Z',
  from: { address: 'tyler@example.com', name: 'Tyler Satre' },
  toRecipients: [{ address: 'sam.rivera@example.com', name: 'Sam Rivera' }],
  ccRecipients: [],
  bccRecipients: [],
  folder: 'drafts',
  isRead: true,
};

/** Sam Rivera's second address, involved via a different conversation (US3 sc1 — several addresses). */
const samPersonal: SeedMessage = {
  id: 'dev-msg-sam-personal',
  conversationId: 'dev-conv-sam-personal',
  subject: 'Weekend plans',
  body: { content: 'See you Saturday.', contentType: 'text' },
  receivedDateTime: '2026-08-01T18:00:00Z',
  sentDateTime: '2026-08-01T18:00:00Z',
  from: { address: 'friend@example.com', name: 'Alex Friend' },
  toRecipients: [{ address: 'sam.personal@example.com', name: 'Sam Rivera' }],
  ccRecipients: [],
  bccRecipients: [],
  folder: 'inbox',
  isRead: true,
};

const FIXED_MESSAGES: SeedMessage[] = [pricingQuestion, pricingReply, quoteAttached, signatureOnly, jordanSmith, samPersonal, followUpDraft];

// pricingQuestion + pricingReply share one conversation ("dev-conv-pricing"), so the 7 fixed
// messages above form only 6 distinct conversations.
const FIXED_CONVERSATION_COUNT = 6;
const FILLER_COUNT = 30 - FIXED_CONVERSATION_COUNT;

/** Filler conversations so the Emails page has 30 total (25 shown, load-more reveals the rest). */
const fillerMessages: SeedMessage[] = Array.from({ length: FILLER_COUNT }, (_, i) => {
  const day = String((i % 27) + 1).padStart(2, '0');
  return {
    id: `dev-msg-filler-${i}`,
    conversationId: `dev-conv-filler-${i}`,
    subject: `Note ${i + 1}`,
    body: { content: `Filler message ${i + 1}.`, contentType: 'text' },
    receivedDateTime: `2026-07-${day}T09:00:00Z`,
    sentDateTime: `2026-07-${day}T09:00:00Z`,
    from: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
    toRecipients: [{ address: 'tyler@example.com', name: 'Tyler Satre' }],
    ccRecipients: [],
    bccRecipients: [],
    folder: 'inbox',
    isRead: true,
  };
});

export const DEV_SEED_MESSAGES: SeedMessage[] = [...FIXED_MESSAGES, ...fillerMessages];
