import type { MailFolder, MailMessage, MailProvider, MailRecipient, MailWindow } from './provider.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const SELECT_FIELDS = 'id,conversationId,subject,body,sentDateTime,receivedDateTime,from,toRecipients,ccRecipients,bccRecipients';

const FOLDER_PATH: Record<MailFolder, string> = { inbox: 'inbox', sent: 'sentitems' };
const FOLDER_TIMESTAMP_FIELD: Record<MailFolder, 'receivedDateTime' | 'sentDateTime'> = {
  inbox: 'receivedDateTime',
  sent: 'sentDateTime',
};

export interface GraphMailProviderOptions {
  getAccessToken: () => Promise<string>;
}

interface GraphRecipient {
  emailAddress?: { address?: string };
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  body: { content: string; contentType: 'html' | 'text' };
  receivedDateTime: string;
  sentDateTime: string;
  from?: GraphRecipient | null;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
}

interface GraphMessagesResponse {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
}

function toRecipient(recipient: GraphRecipient): MailRecipient {
  return { address: recipient.emailAddress?.address ?? '' };
}

function toMailMessage(message: GraphMessage): MailMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject ?? '',
    body: message.body,
    receivedDateTime: message.receivedDateTime,
    sentDateTime: message.sentDateTime,
    from: message.from ? toRecipient(message.from) : null,
    toRecipients: (message.toRecipients ?? []).map(toRecipient),
    ccRecipients: (message.ccRecipients ?? []).map(toRecipient),
    bccRecipients: (message.bccRecipients ?? []).map(toRecipient),
  };
}

function firstPageUrl(folder: MailFolder, window: MailWindow): string {
  const field = FOLDER_TIMESTAMP_FIELD[folder];
  const url = new URL(`${GRAPH_BASE}/me/mailFolders/${FOLDER_PATH[folder]}/messages`);
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$filter', `${field} ge ${window.startUtc} and ${field} lt ${window.endUtc}`);
  url.searchParams.set('$orderby', field);
  url.searchParams.set('$top', '100');
  return url.toString();
}

export class GraphMailProvider implements MailProvider {
  constructor(private readonly options: GraphMailProviderOptions) {}

  async *fetchMessages(folder: MailFolder, window: MailWindow): AsyncIterable<MailMessage[]> {
    let nextUrl: string | undefined = firstPageUrl(folder, window);

    while (nextUrl) {
      const token = await this.options.getAccessToken();

      let response: Response;
      try {
        response = await fetch(nextUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' },
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not reach the mailbox — connection failed (${detail})`);
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('Mailbox sign-in has expired or is not authorized — run npm run mail:signin');
      }
      if (!response.ok) {
        throw new Error(`Mailbox request failed with a connection error (HTTP ${response.status})`);
      }

      const body = (await response.json()) as GraphMessagesResponse;
      yield body.value.map(toMailMessage);
      nextUrl = body['@odata.nextLink'];
    }
  }
}
