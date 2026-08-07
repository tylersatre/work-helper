const MAX_CONSECUTIVE_FAILURES = 3;

export interface LockoutTracker {
  isLocked(ip: string): boolean;
  recordFailure(ip: string): void;
  recordSuccess(ip: string): void;
}

/** Fresh in-memory tracker — call once per app instance so a rebuilt app (simulated restart) starts clear. */
export function createLockoutTracker(): LockoutTracker {
  const records = new Map<string, { consecutiveFailures: number; locked: boolean }>();

  return {
    isLocked(ip) {
      return records.get(ip)?.locked ?? false;
    },

    recordFailure(ip) {
      const record = records.get(ip) ?? { consecutiveFailures: 0, locked: false };
      if (record.locked) {
        return; // FR-009: a restart is the only thing that clears a lockout
      }
      record.consecutiveFailures += 1;
      if (record.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        record.locked = true;
      }
      records.set(ip, record);
    },

    recordSuccess(ip) {
      if (records.get(ip)?.locked) {
        return; // FR-009: a restart is the only thing that clears a lockout
      }
      records.set(ip, { consecutiveFailures: 0, locked: false });
    },
  };
}
