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
