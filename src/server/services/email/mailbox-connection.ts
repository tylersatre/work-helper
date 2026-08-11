import type { MailboxAuth } from './graph-auth.js';

export type SignInAttempt =
  | { status: 'pending'; verificationUri: string; userCode: string; expiresAt: number }
  | { status: 'failed'; verificationUri: string; userCode: string; expiresAt: number; error: string };

/**
 * Singleton over an injected MailboxAuth, owning at most one pending/failed SignInAttempt
 * (data-model.md). Memory-only — a server restart discards it (spec edge case).
 */
export class MailboxConnectionManager {
  private attempt: SignInAttempt | null = null;
  /** Covers the race window between calling beginSignIn and onCode firing — this.attempt isn't set yet, so a second connect() before then would otherwise start a second device-code flow. */
  private inFlightConnect: Promise<SignInAttempt> | null = null;

  constructor(private readonly auth: MailboxAuth) {}

  getAttempt(): SignInAttempt | null {
    return this.attempt;
  }

  /** Clears a failed attempt (e.g. on disconnect) — leaves a pending attempt untouched. */
  clearFailedAttempt(): void {
    if (this.attempt?.status === 'failed') {
      this.attempt = null;
    }
  }

  /** Idempotent while pending (FR-004): returns the existing attempt instead of starting a new device-code flow. */
  async connect(): Promise<SignInAttempt> {
    if (this.attempt?.status === 'pending') {
      return this.attempt;
    }
    if (this.inFlightConnect) {
      return this.inFlightConnect;
    }

    const promise = new Promise<SignInAttempt>((resolve, reject) => {
      let codeAttempt: SignInAttempt | null = null;

      this.auth
        .beginSignIn((verificationUri, userCode, expiresAt) => {
          codeAttempt = { status: 'pending', verificationUri, userCode, expiresAt };
          this.attempt = codeAttempt;
          resolve(codeAttempt);
        })
        .then(() => {
          if (!codeAttempt) {
            // beginSignIn resolved without ever invoking onCode — violates the MailboxAuth
            // contract. Reject rather than leaving this connect() call unsettled forever.
            reject(new Error('Sign-in completed without ever issuing a device code'));
            return;
          }
          // Success — clear the attempt. Connected truth then comes from verifyConnection,
          // never from the attempt itself, which resolves the near-expiry race by construction.
          if (this.attempt === codeAttempt) {
            this.attempt = null;
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (codeAttempt) {
            const failed: SignInAttempt = { ...codeAttempt, status: 'failed', error: message };
            if (this.attempt === codeAttempt) {
              this.attempt = failed;
            }
          } else {
            // The device-code request itself was rejected before any code was ever issued.
            reject(error);
          }
        });
    });

    this.inFlightConnect = promise;
    // Cleared once the race window closes (onCode fired, or the device-code request itself was
    // rejected) — the this.attempt pending-check above takes over as the guard from then on.
    promise.then(
      () => {
        this.inFlightConnect = null;
      },
      () => {
        this.inFlightConnect = null;
      },
    );
    return promise;
  }
}
