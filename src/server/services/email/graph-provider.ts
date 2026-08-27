import {
  MailMessageGoneError,
  type CreateDraftInput,
  type CreateReplyDraftInput,
  type MailAttachmentMeta,
  type MailFlagStatus,
  type MailFolderNode,
  type MailFolderRef,
  type MailImportance,
  type MailMessage,
  type MailProvider,
  type MailRecipient,
  type MailWindow,
  type UpdateDraftInput,
  type WellKnownFolder,
} from './provider.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const SELECT_FIELDS =
  'id,conversationId,subject,body,sentDateTime,receivedDateTime,from,toRecipients,ccRecipients,bccRecipients,isRead,importance,flag,categories,hasAttachments,webLink,internetMessageId,isDraft';

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
  isDraft?: boolean;
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

function toGraphRecipient(recipient: MailRecipient): GraphRecipient {
  return { emailAddress: { address: recipient.address, name: recipient.name } };
}

const BODY_TAG_PATTERN = /<body[^>]*>/i;

/** Inserts prefixHtml immediately after the opening <body …> tag; falls back to a plain prepend when there is none. */
function insertPrefix(content: string, prefixHtml: string): string {
  const match = BODY_TAG_PATTERN.exec(content);
  if (!match) {
    return `${prefixHtml}${content}`;
  }
  const insertAt = match.index + match[0].length;
  return `${content.slice(0, insertAt)}${prefixHtml}${content.slice(insertAt)}`;
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
    isDraft: message.isDraft ?? false,
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

  async createDraft(input: CreateDraftInput): Promise<MailMessage> {
    const token = await this.options.getWriteAccessToken();

    const response = await this.send(`${GRAPH_BASE}/me/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toRecipients: input.to.map(toGraphRecipient),
        ccRecipients: (input.cc ?? []).map(toGraphRecipient),
        bccRecipients: (input.bcc ?? []).map(toGraphRecipient),
        subject: input.subject,
        body: { contentType: 'HTML', content: input.bodyHtml },
      }),
    });

    if (!response.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${response.status})`);
    }
    const message = (await response.json()) as GraphMessage;
    return toMailMessage(message);
  }

  async createReplyDraft(graphMessageId: string, input: CreateReplyDraftInput): Promise<MailMessage> {
    const token = await this.options.getWriteAccessToken();
    const endpoint = input.replyAll ? 'createReplyAll' : 'createReply';

    const postResponse = await this.send(`${GRAPH_BASE}/me/messages/${graphMessageId}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (postResponse.status === 404) {
      throw new MailMessageGoneError(graphMessageId);
    }
    if (!postResponse.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${postResponse.status})`);
    }
    const draft = (await postResponse.json()) as GraphMessage;
    const mergedContent = insertPrefix(draft.body.content, input.prefixHtml);

    const patchResponse = await this.send(`${GRAPH_BASE}/me/messages/${draft.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: { contentType: 'HTML', content: mergedContent } }),
    });
    if (!patchResponse.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${patchResponse.status})`);
    }

    return toMailMessage({ ...draft, body: { content: mergedContent, contentType: 'html' } });
  }

  /**
   * DELETE has no server-side draft protection (works on any message — research R1), and a PATCH to
   * a sent message fails with a Graph 400, not 404. So both updateDraft and deleteDraft verify the
   * target is *currently* a draft before writing — the store's is_draft flag can be stale between
   * syncs (e.g. Tyler sent the draft from Outlook since the last sync), and without this check a
   * stale delete-draft call would delete a real sent message (FR-011/FR-019).
   */
  private async verifyStillDraft(graphMessageId: string): Promise<void> {
    const url = new URL(`${GRAPH_BASE}/me/messages/${graphMessageId}`);
    url.searchParams.set('$select', 'isDraft');
    const response = await this.authorizedFetch(url.toString(), { allowNotFound: true });
    if (response == null) {
      throw new MailMessageGoneError(graphMessageId);
    }
    const body = (await response.json()) as { isDraft?: boolean };
    if (body.isDraft !== true) {
      throw new MailMessageGoneError(graphMessageId);
    }
  }

  async updateDraft(graphMessageId: string, input: UpdateDraftInput): Promise<MailMessage> {
    await this.verifyStillDraft(graphMessageId);
    const token = await this.options.getWriteAccessToken();

    const payload: Record<string, unknown> = {};
    if (input.bodyHtml !== undefined) payload.body = { contentType: 'HTML', content: input.bodyHtml };
    if (input.to !== undefined) payload.toRecipients = input.to.map(toGraphRecipient);
    if (input.cc !== undefined) payload.ccRecipients = input.cc.map(toGraphRecipient);
    if (input.bcc !== undefined) payload.bccRecipients = input.bcc.map(toGraphRecipient);
    if (input.subject !== undefined) payload.subject = input.subject;

    const response = await this.send(`${GRAPH_BASE}/me/messages/${graphMessageId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.status === 404) {
      throw new MailMessageGoneError(graphMessageId);
    }
    if (!response.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${response.status})`);
    }
    const message = (await response.json()) as GraphMessage;
    return toMailMessage(message);
  }

  async deleteDraft(graphMessageId: string): Promise<void> {
    await this.verifyStillDraft(graphMessageId);
    const token = await this.options.getWriteAccessToken();

    const response = await this.send(`${GRAPH_BASE}/me/messages/${graphMessageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' },
    });
    if (response.status === 404) {
      throw new MailMessageGoneError(graphMessageId);
    }
    if (!response.ok) {
      throw new Error(`Mailbox request failed with a connection error (HTTP ${response.status})`);
    }
  }

  async fetchDraftMessages(onMessage: (message: MailMessage) => void | Promise<void>): Promise<void> {
    const url = new URL(`${GRAPH_BASE}/me/mailFolders/drafts/messages`);
    url.searchParams.set('$select', SELECT_FIELDS);
    let nextUrl: string | undefined = url.toString();

    while (nextUrl) {
      const response = await this.authorizedFetch(nextUrl);
      const body = (await response.json()) as GraphMessagesResponse;
      for (const message of body.value) {
        await onMessage(toMailMessage(message));
      }
      nextUrl = body['@odata.nextLink'];
    }
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
