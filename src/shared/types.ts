export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskEffort = 'S' | 'M' | 'L' | 'XL';

export interface Task {
  id: number;
  title: string;
  lane: string;
  position: number;
  createdAt: number;
  archived: boolean;
  dueDate: string | null;
  priority: TaskPriority | null;
  effort: TaskEffort | null;
  description: string | null;
}

export interface BoardTask extends Task {
  tags: Tag[];
  searchText: string;
}

export interface BoardLane {
  name: string;
  tasks: BoardTask[];
}

export interface BoardView {
  lanes: BoardLane[];
}

export interface BoardFilter {
  text: string;
  tagIds: number[];
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
  company: Company | null;
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
  hasDraft: boolean;
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
  isDraft: boolean;
  importance: 'low' | 'normal' | 'high';
  flagStatus: 'notFlagged' | 'complete' | 'flagged';
  categories: string[];
  webLink: string;
  attachments: EmailAttachmentSummary[];
  participants: EmailConversationParticipant[];
}

export interface EmailSignature {
  signature: string | null;
}

export interface EmailConversationDetail {
  id: number;
  subject: string;
  messages: EmailConversationMessage[];
  cards: LinkedCardSummary[];
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
  companies: Company[];
  conversations: LinkedConversationSummary[];
  lanes: string[];
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

export interface LinkedConversationSummary {
  id: number;
  subject: string;
  participants: EmailParticipantSummary[];
  latestMessageAt: number;
}

export interface LinkedCardSummary {
  id: number;
  title: string;
  lane: string;
}

export interface DashboardShowToggles {
  tags: boolean;
  latestNote: boolean;
  links: boolean;
  lane: boolean;
}

export interface DashboardSavedView {
  lanes: string[];
  tagIds: number[];
  text: string;
  limit: number;
  show: DashboardShowToggles;
}

export interface DashboardCard {
  id: number;
  title: string;
  lane: string;
  position: number;
  createdAt: number;
  tags: Tag[];
  searchText: string;
  latestNote: { text: string; createdAt: number } | null;
  people: { id: number; name: string }[];
  companies: { id: number; name: string }[];
}

export interface DashboardResponse {
  lanes: string[];
  defaultLanes: string[];
  quickDoneLane: string;
  savedView: DashboardSavedView | null;
  cards: DashboardCard[];
}
