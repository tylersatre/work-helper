import type {
  MailAttachmentMeta,
  MailFlagStatus,
  MailFolder,
  MailImportance,
  MailMessage,
  MailProvider,
  MailRecipient,
  MailWindow,
} from './provider.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const SELECT_FIELDS =
  'id,conversationId,subject,body,sentDateTime,receivedDateTime,from,toRecipients,ccRecipients,bccRecipients,isRead,importance,flag,categories,hasAttachments,webLink,internetMessageId';

const FOLDER_PATH: Record<MailFolder, string> = { inbox: 'inbox', sent: 'sentitems' };
const FOLDER_TIMESTAMP_FIELD: Record<MailFolder, 'receivedDateTime' | 'sentDateTime'> = {
  inbox: 'receivedDateTime',
  sent: 'sentDateTime',
};

export interface GraphMailProviderOptions {
  getAccessToken: () => Promise<string>;
}

interface GraphRecipient {
  emailAddress?: { address?: string; name?: string };
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
  isRead?: boolean;
  importance?: MailImportance;
  flag?: { flagStatus?: MailFlagStatus };
  categories?: string[];
  hasAttachments?: boolean;
  webLink?: string;
  internetMessageId?: string;
}

interface GraphMessagesResponse {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
}

interface GraphAttachment {
  name: string;
  contentType: string | null;
  size: number;
}

interface GraphAttachmentsResponse {
  value: GraphAttachment[];
}

function toRecipient(recipient: GraphRecipient): MailRecipient {
  return { address: recipient.emailAddress?.address ?? '', name: recipient.emailAddress?.name ?? '' };
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
    isRead: message.isRead ?? false,
    importance: message.importance ?? 'normal',
    flagStatus: message.flag?.flagStatus ?? 'notFlagged',
    categories: message.categories ?? [],
    hasAttachments: message.hasAttachments ?? false,
    webLink: message.webLink ?? '',
    internetMessageId: message.internetMessageId ?? '',
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

  private async authorizedFetch(url: string): Promise<Response> {
    const token = await this.options.getAccessToken();

    let response: Response;
    try {
      response = await fetch(url, {
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

    return response;
  }

  async *fetchMessages(folder: MailFolder, window: MailWindow): AsyncIterable<MailMessage[]> {
    let nextUrl: string | undefined = firstPageUrl(folder, window);

    while (nextUrl) {
      const response = await this.authorizedFetch(nextUrl);
      const body = (await response.json()) as GraphMessagesResponse;
      yield body.value.map(toMailMessage);
      nextUrl = body['@odata.nextLink'];
    }
  }

  async fetchAttachmentMetadata(messageId: string): Promise<MailAttachmentMeta[]> {
    const url = new URL(`${GRAPH_BASE}/me/messages/${messageId}/attachments`);
    url.searchParams.set('$select', 'name,contentType,size');

    const response = await this.authorizedFetch(url.toString());
    const body = (await response.json()) as GraphAttachmentsResponse;
    return body.value.map((a) => ({ name: a.name, contentType: a.contentType ?? null, sizeBytes: a.size }));
  }
}
