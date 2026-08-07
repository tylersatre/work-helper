import { describe, expect, it } from 'vitest';
import { createLockoutTracker } from '../../src/server/mcp/auth/lockout.js';

describe('createLockoutTracker', () => {
  it('allows retry after the first two consecutive failures', () => {
    const tracker = createLockoutTracker();
    expect(tracker.isLocked('1.2.3.4')).toBe(false);

    tracker.recordFailure('1.2.3.4');
    expect(tracker.isLocked('1.2.3.4')).toBe(false);

    tracker.recordFailure('1.2.3.4');
    expect(tracker.isLocked('1.2.3.4')).toBe(false);
  });

  it('locks on the third consecutive failure', () => {
    const tracker = createLockoutTracker();
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');

    expect(tracker.isLocked('1.2.3.4')).toBe(true);
  });

  it('remains locked once locked, with no further failures recorded', () => {
    const tracker = createLockoutTracker();
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');

    expect(tracker.isLocked('1.2.3.4')).toBe(true);
    expect(tracker.isLocked('1.2.3.4')).toBe(true);
  });

  it('a correct submission resets the count to zero (two-wrong-then-right edge case)', () => {
    const tracker = createLockoutTracker();
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');
    tracker.recordSuccess('1.2.3.4');
    expect(tracker.isLocked('1.2.3.4')).toBe(false);

    // Two more failures post-reset should not lock (would be 4 total without the reset).
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');
    expect(tracker.isLocked('1.2.3.4')).toBe(false);
  });

  it('stays locked even if a success is somehow recorded — restart is the only clearing mechanism (FR-009)', () => {
    const tracker = createLockoutTracker();
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');
    tracker.recordFailure('1.2.3.4');
    expect(tracker.isLocked('1.2.3.4')).toBe(true);

    tracker.recordSuccess('1.2.3.4');
    expect(tracker.isLocked('1.2.3.4')).toBe(true);
  });

  it('scopes state strictly per IP', () => {
    const tracker = createLockoutTracker();
    tracker.recordFailure('1.1.1.1');
    tracker.recordFailure('1.1.1.1');
    tracker.recordFailure('1.1.1.1');

    expect(tracker.isLocked('1.1.1.1')).toBe(true);
    expect(tracker.isLocked('2.2.2.2')).toBe(false);
  });
});
