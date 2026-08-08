import type { MailFolder, MailMessage, MailProvider, MailWindow } from '../../../src/server/services/email/provider.js';

export interface SeedMessage extends MailMessage {
  folder: MailFolder;
}

export interface FakeMailProviderOptions {
  /** Messages per yielded page (mirrors Graph's `$top` paging). Defaults to 25. */
  pageSize?: number;
  /** Throws before yielding anything at all — simulates an unreachable mailbox or expired sign-in. */
  failImmediately?: boolean;
  /** Throws once this many messages (across all folders/pages, cumulative for this provider instance) have already been yielded — simulates a connection drop mid-run. */
  throwAfterMessageCount?: number;
}

function toMailMessage(seed: SeedMessage): MailMessage {
  return {
    id: seed.id,
    conversationId: seed.conversationId,
    subject: seed.subject,
    body: seed.body,
    receivedDateTime: seed.receivedDateTime,
    sentDateTime: seed.sentDateTime,
    from: seed.from,
    toRecipients: seed.toRecipients,
    ccRecipients: seed.ccRecipients,
    bccRecipients: seed.bccRecipients,
  };
}

export class FakeMailProvider implements MailProvider {
  private yieldedCount = 0;

  constructor(
    private readonly seeded: SeedMessage[],
    private readonly options: FakeMailProviderOptions = {},
  ) {}

  async *fetchMessages(folder: MailFolder, window: MailWindow): AsyncIterable<MailMessage[]> {
    if (this.options.failImmediately) {
      throw new Error('mailbox unreachable');
    }

    const pageSize = this.options.pageSize ?? 25;
    const startMs = Date.parse(window.startUtc);
    const endMs = Date.parse(window.endUtc);

    const matching = this.seeded.filter((seed) => {
      if (seed.folder !== folder) return false;
      const timestamp = Date.parse(folder === 'inbox' ? seed.receivedDateTime : seed.sentDateTime);
      return timestamp >= startMs && timestamp < endMs;
    });

    for (let i = 0; i < matching.length; i += pageSize) {
      const chunk = matching.slice(i, i + pageSize);
      yield chunk.map(toMailMessage);

      this.yieldedCount += chunk.length;
      if (this.options.throwAfterMessageCount !== undefined && this.yieldedCount >= this.options.throwAfterMessageCount) {
        throw new Error('mailbox connection lost mid-sync');
      }
    }
  }
}
