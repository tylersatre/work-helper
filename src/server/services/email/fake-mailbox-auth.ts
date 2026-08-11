import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MailboxNotConnectedError, type ConnectionVerification, type MailboxAuth } from './graph-auth.js';

const DEVICE_CODE_EXPIRY_MS = 15 * 60 * 1000;

interface FakeMailboxState {
  status: 'not-connected' | 'connected' | 'expired';
  account?: string;
  expiredDetail?: string;
}

export interface FakeMailboxAuthAutoOutcome {
  afterMs: number;
  kind: 'connect' | 'decline';
  /** Account username when kind === 'connect'. */
  account?: string;
  /** Provider-style error text when kind === 'decline'. */
  error?: string;
}

export interface FakeMailboxAuthOptions {
  /** JSON state file path — file-backed so a second instance over the same path proves restart persistence (FR-008, FR-009). */
  statePath: string;
  /** Dev-only: auto-resolves a begun sign-in after a delay, mirroring MAIL_AUTH=fake/fake-decline (research.md D6). */
  autoOutcome?: FakeMailboxAuthAutoOutcome;
  /** Test-only: beginSignIn() rejects immediately with this message, never invoking onCode — simulates Microsoft rejecting the device-code request itself (e.g. wrong tenant). */
  rejectDeviceCodeRequest?: string;
}

/** Scriptable MailboxAuth stand-in for tests and MAIL_AUTH=fake/fake-decline dev modes — never contacts real Microsoft. */
export class FakeMailboxAuth implements MailboxAuth {
  private pending: { resolve: (account: string) => void; reject: (error: Error) => void } | null = null;

  constructor(private readonly options: FakeMailboxAuthOptions) {}

  private readState(): FakeMailboxState {
    if (!existsSync(this.options.statePath)) {
      return { status: 'not-connected' };
    }
    return JSON.parse(readFileSync(this.options.statePath, 'utf-8')) as FakeMailboxState;
  }

  private writeState(state: FakeMailboxState): void {
    mkdirSync(dirname(this.options.statePath), { recursive: true });
    writeFileSync(this.options.statePath, JSON.stringify(state));
  }

  async getAccessToken(): Promise<string> {
    const state = this.readState();
    if (state.status === 'connected' && state.account) {
      return `fake-token-${state.account}`;
    }
    if (state.status === 'expired') {
      throw new MailboxNotConnectedError('expired', state.expiredDetail ?? 'Fake sign-in expired');
    }
    throw new MailboxNotConnectedError('never-signed-in');
  }

  async verifyConnection(): Promise<ConnectionVerification> {
    const state = this.readState();
    if (state.status === 'connected' && state.account) {
      return { connected: true, account: state.account };
    }
    if (state.status === 'expired') {
      return { connected: false, reason: 'expired', detail: state.expiredDetail ?? 'Fake sign-in expired' };
    }
    return { connected: false, reason: 'never-signed-in' };
  }

  async beginSignIn(onCode: (verificationUri: string, userCode: string, expiresAt: number) => void): Promise<{ account: string }> {
    if (this.options.rejectDeviceCodeRequest) {
      throw new Error(this.options.rejectDeviceCodeRequest);
    }
    onCode('https://microsoft.com/devicelogin', 'FAKE-CODE', Date.now() + DEVICE_CODE_EXPIRY_MS);

    return new Promise((resolve, reject) => {
      this.pending = {
        resolve: (account) => {
          this.writeState({ status: 'connected', account });
          resolve({ account });
        },
        reject,
      };

      const auto = this.options.autoOutcome;
      if (auto) {
        setTimeout(() => {
          if (!this.pending) return;
          if (auto.kind === 'connect') {
            this.pending.resolve(auto.account ?? 'tyler@example.com');
          } else {
            this.pending.reject(new Error(auto.error ?? 'AADSTS70016: The user declined the device-code sign-in request.'));
          }
          this.pending = null;
        }, auto.afterMs);
      }
    });
  }

  async signOut(): Promise<void> {
    this.writeState({ status: 'not-connected' });
  }

  /** Test-only: resolves a pending beginSignIn() as a successful sign-in. */
  resolvePendingSignIn(account: string): void {
    if (!this.pending) throw new Error('No sign-in attempt is pending');
    const { resolve } = this.pending;
    this.pending = null;
    resolve(account);
  }

  /** Test-only: rejects a pending beginSignIn() with a provider-style error. */
  rejectPendingSignIn(error: string): void {
    if (!this.pending) throw new Error('No sign-in attempt is pending');
    const { reject } = this.pending;
    this.pending = null;
    reject(new Error(error));
  }

  /** Test-only: seeds the persisted state directly (e.g. a dead sign-in) without going through beginSignIn. */
  seedState(state: FakeMailboxState): void {
    this.writeState(state);
  }
}
