export interface Task {
  id: number;
  title: string;
  lane: string;
  position: number;
  createdAt: number;
}

export interface BoardLane {
  name: string;
  tasks: Task[];
}

export interface BoardView {
  lanes: BoardLane[];
}

export interface ContactEntry {
  id: number;
  value: string;
  isPrimary: boolean;
  createdAt: number;
}

export interface Person {
  id: number;
  firstName: string;
  lastName: string;
  emails: ContactEntry[];
  phones: ContactEntry[];
  extraFields: Record<string, string>;
  createdAt: number;
  tags: Tag[];
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  extraFields?: Record<string, string>;
}

export interface EmailParticipantSummary {
  address: string;
  displayName: string;
  person: { id: number; name: string } | null;
}

export interface EmailConversationSummary {
  id: number;
  subject: string;
  messageCount: number;
  latestMessageAt: number;
  hasUnread: boolean;
  hasAttachments: boolean;
  participants: EmailParticipantSummary[];
}

export interface EmailConversationsPage {
  conversations: EmailConversationSummary[];
  nextCursor: string | null;
}

export interface EmailAttachmentSummary {
  name: string;
  contentType: string | null;
  sizeBytes: number;
}

export interface EmailConversationParticipant {
  address: string;
  displayName: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
  person: { id: number; name: string } | null;
}

export interface EmailConversationMessage {
  id: number;
  subject: string;
  sentAt: number;
  receivedAt: number;
  bodyOriginal: string;
  bodyContentType: 'html' | 'text';
  sourceFolder: string;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  flagStatus: 'notFlagged' | 'complete' | 'flagged';
  categories: string[];
  webLink: string;
  attachments: EmailAttachmentSummary[];
  participants: EmailConversationParticipant[];
}

export interface EmailConversationDetail {
  id: number;
  subject: string;
  messages: EmailConversationMessage[];
}

export interface PersonEmailAddress {
  address: string;
  roles: ('from' | 'to' | 'cc' | 'bcc')[];
}

export interface PersonEmailConversation {
  conversationId: number;
  subject: string;
  latestMessageAt: number;
  addresses: PersonEmailAddress[];
}

export interface PersonEmailConversationsPage {
  conversations: PersonEmailConversation[];
}

export type NoteSource = 'ui' | 'mcp';

export interface Note {
  id: number;
  taskId: number;
  text: string;
  source: NoteSource;
  createdAt: number;
}

export interface LinkedPerson {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  extraFields: Record<string, string>;
  createdAt: number;
}

export interface TaskDetail extends Task {
  people: LinkedPerson[];
  notes: Note[];
  tags: Tag[];
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface TagWithCounts extends Tag {
  peopleCount: number;
  tasksCount: number;
}

export interface Company {
  id: number;
  name: string;
}

export interface CompanyDetail extends Company {
  people: { id: number; firstName: string; lastName: string }[];
  cards: { id: number; title: string; lane: string }[];
  tags: Tag[];
}
