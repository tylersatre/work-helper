import type { SeedEvent } from './fake-provider.js';

/**
 * Dev-only seeded calendar for `MAIL_PROVIDER=fake` (see index.ts) — covers quickstart scenario 1:
 * a few in-range events including a recurring series and one fully-populated event, plus one
 * out-of-range event so the range filter is visibly exercised.
 */

const pricingReview: SeedEvent = {
  id: 'dev-evt-pricing-review',
  subject: 'Pricing review',
  start: '2026-08-14T16:00:00.000Z',
  end: '2026-08-14T16:30:00.000Z',
  location: 'Conference Room B',
  organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
  attendees: [
    { address: 'tyler@example.com', name: 'Tyler Satre', type: 'required', responseStatus: 'accepted' },
    { address: 'ana.alvarez@example.com', name: 'Ana Alvarez', type: 'optional', responseStatus: 'none' },
  ],
  onlineMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/dev-pricing-review',
  categories: ['Orange category'],
  webLink: 'https://outlook.office.com/calendar/item/dev-evt-pricing-review',
  body: { content: 'Agenda for the pricing review.', contentType: 'text' },
};

/** A weekly series — five Monday standups sharing one seriesMasterId, each its own occurrence (FR-009). */
const standupOccurrences: SeedEvent[] = ['03', '10', '17', '24', '31'].map((day) => ({
  id: `dev-evt-standup-2026-08-${day}`,
  seriesMasterId: 'dev-series-standup',
  subject: 'Team standup',
  start: `2026-08-${day}T15:00:00.000Z`,
  end: `2026-08-${day}T15:15:00.000Z`,
  organizer: { address: 'tyler@example.com', name: 'Tyler Satre' },
  attendees: [{ address: 'sam.rivera@example.com', name: 'Sam Rivera', type: 'required', responseStatus: 'accepted' }],
}));

/** Out of the default ±30-day sync window at the feature's reference date (2026-08-12) — never appears in a sync of August. */
const septemberPlanning: SeedEvent = {
  id: 'dev-evt-september-planning',
  subject: 'September planning',
  start: '2026-09-15T15:00:00.000Z',
  end: '2026-09-15T16:00:00.000Z',
  organizer: { address: 'sam.rivera@example.com', name: 'Sam Rivera' },
};

export const DEV_SEED_EVENTS: SeedEvent[] = [pricingReview, ...standupOccurrences, septemberPlanning];
