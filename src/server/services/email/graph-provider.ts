import type {
  MailAttachmentMeta,
  MailFlagStatus,
  MailFolderNode,
  MailFolderRef,
  MailImportance,
  MailMessage,
  MailProvider,
  MailRecipient,
  MailWindow,
  WellKnownFolder,
} from './provider.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const SELECT_FIELDS =
  'id,conversationId,subject,body,sentDateTime,receivedDateTime,from,toRecipients,ccRecipients,bccRecipients,isRead,importance,flag,categories,hasAttachments,webLink,internetMessageId';

const WELL_KNOWN_NAMES: Record<WellKnownFolder, string> = {
  inbox: 'inbox',
  sentitems: 'sentitems',
  archive: 'archive',
  junkemail: 'junkemail',
  deleteditems: 'deleteditems',
  drafts: 'drafts',
};

export interface GraphMailProviderOptions {
  getAccessToken: () => Promise<string>;
  getWriteAccessToken: () => Promise<string>;
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
  isInline?: boolean;
}

interface GraphAttachmentsResponse {
  value: GraphAttachment[];
}

interface GraphFolder {
  id: string;
  displayName: string;
}

interface GraphFoldersResponse {
  value: GraphFolder[];
  '@odata.nextLink'?: string;
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

function firstPageUrl(folder: MailFolderRef, window: MailWindow): string {
  const field = folder.wellKnown === 'sentitems' ? 'sentDateTime' : 'receivedDateTime';
  const url = new URL(`${GRAPH_BASE}/me/mailFolders/${folder.id}/messages`);
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$filter', `${field} ge ${window.startUtc} and ${field} lt ${window.endUtc}`);
  url.searchParams.set('$orderby', field);
  url.searchParams.set('$top', '100');
  return url.toString();
}

export class GraphMailProvider implements MailProvider {
  constructor(private readonly options: GraphMailProviderOptions) {}

  private async send(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach the mailbox — connection failed (${detail})`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Mailbox sign-in has expired or is not authorized — reconnect the mailbox on the Sync page.');
    }
    return response;
  }

  private async authorizedFetch(url: string, options: { allowNotFound: true }): Promise<Response | null>;
  private async authorizedFetch(url: string, options?: { allowNotFound?: false }): Promise<Response>;
  private async authorizedFetch(url: string, options?: { allowNotFound?: boolean }): Promise<Response | null> {
    const token = await this.options.getAccessToken();

    const response = await this.send(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' },
    });

    if (response.status === 404 && options?.allowNotFound) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${response.status})`);
    }

    return response;
  }

  async verifyWriteAccess(): Promise<void> {
    await this.options.getWriteAccessToken();
  }

  async setMessageReadState(graphMessageId: string, isRead: boolean): Promise<'updated' | 'not-found'> {
    const token = await this.options.getWriteAccessToken();

    const response = await this.send(`${GRAPH_BASE}/me/messages/${graphMessageId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead }),
    });

    if (response.status === 404) {
      return 'not-found';
    }
    if (!response.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${response.status})`);
    }
    return 'updated';
  }

  async *fetchMessages(folder: MailFolderRef, window: MailWindow): AsyncIterable<MailMessage[]> {
    let nextUrl: string | undefined = firstPageUrl(folder, window);

    while (nextUrl) {
      const response = await this.authorizedFetch(nextUrl);
      const body = (await response.json()) as GraphMessagesResponse;
      yield body.value.map(toMailMessage);
      nextUrl = body['@odata.nextLink'];
    }
  }

  async fetchAttachmentMetadata(messageId: string, options?: { allowNotFound?: boolean }): Promise<MailAttachmentMeta[] | null> {
    const url = new URL(`${GRAPH_BASE}/me/messages/${messageId}/attachments`);
    url.searchParams.set('$select', 'name,contentType,size,isInline');

    const response = options?.allowNotFound
      ? await this.authorizedFetch(url.toString(), { allowNotFound: true })
      : await this.authorizedFetch(url.toString());
    if (response == null) {
      return null;
    }
    const body = (await response.json()) as GraphAttachmentsResponse;
    return body.value.map((a) => ({ name: a.name, contentType: a.contentType ?? null, sizeBytes: a.size, isInline: a.isInline === true }));
  }

  async listFolders(): Promise<MailFolderNode[]> {
    const wellKnownIds = new Map<string, WellKnownFolder>();
    for (const [wellKnown, name] of Object.entries(WELL_KNOWN_NAMES) as [WellKnownFolder, string][]) {
      const url = new URL(`${GRAPH_BASE}/me/mailFolders/${name}`);
      url.searchParams.set('$select', 'id');
      const response = await this.authorizedFetch(url.toString(), { allowNotFound: true });
      if (response == null) {
        continue;
      }
      const body = (await response.json()) as { id: string };
      wellKnownIds.set(body.id, wellKnown);
    }

    const rootUrl = new URL(`${GRAPH_BASE}/me/mailFolders`);
    rootUrl.searchParams.set('$top', '100');
    return this.fetchFolderLevel(rootUrl.toString(), wellKnownIds);
  }

  private async fetchFolderLevel(url: string, wellKnownIds: Map<string, WellKnownFolder>): Promise<MailFolderNode[]> {
    const nodes: MailFolderNode[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
      const response = await this.authorizedFetch(nextUrl);
      const body = (await response.json()) as GraphFoldersResponse;

      for (const folder of body.value) {
        const childUrl = new URL(`${GRAPH_BASE}/me/mailFolders/${folder.id}/childFolders`);
        childUrl.searchParams.set('$top', '100');
        const children = await this.fetchFolderLevel(childUrl.toString(), wellKnownIds);
        nodes.push({ id: folder.id, name: folder.displayName, wellKnown: wellKnownIds.get(folder.id) ?? null, children });
      }

      nextUrl = body['@odata.nextLink'];
    }

    return nodes;
  }
}
