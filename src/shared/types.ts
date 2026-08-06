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
