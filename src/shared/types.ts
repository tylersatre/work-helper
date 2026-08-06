export interface Task {
  id: number;
  title: string;
  lane: string;
  createdAt: number;
}

export interface BoardLane {
  name: string;
  tasks: Task[];
}

export interface BoardView {
  lanes: BoardLane[];
}

export interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  extraFields: Record<string, string>;
  createdAt: number;
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  extraFields?: Record<string, string>;
}

export interface TaskDetail extends Task {
  people: Person[];
}
