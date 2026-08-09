<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BoardView, Task } from '../../shared/types.js';
import Lane from './Lane.vue';

const board = ref<BoardView>({ lanes: [] });
const draggedTaskId = ref<number | null>(null);
const errorMessage = ref<string | null>(null);

let saveChain: Promise<void> = Promise.resolve();
let pendingSaves = 0;
let batchHadFailure = false;

async function fetchBoard(): Promise<void> {
  const response = await fetch('/api/board');
  if (!response.ok) {
    // Leave the last-known-good board on screen rather than blanking it with an error body.
    throw new Error(`Failed to load board: ${response.status}`);
  }
  board.value = await response.json();
}

function applyMove(current: BoardView, taskId: number, targetLaneName: string, targetIndex: number): BoardView {
  let movingTask: Task | undefined;
  const withoutTask = current.lanes.map((lane) => {
    const index = lane.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) {
      return lane;
    }
    movingTask = lane.tasks[index];
    return { ...lane, tasks: [...lane.tasks.slice(0, index), ...lane.tasks.slice(index + 1)] };
  });

  if (!movingTask) {
    return current;
  }

  const updatedTask: Task = { ...movingTask, lane: targetLaneName };

  return {
    lanes: withoutTask.map((lane) => {
      if (lane.name !== targetLaneName) {
        return lane;
      }
      const clampedIndex = Math.max(0, Math.min(targetIndex, lane.tasks.length));
      const tasks = [...lane.tasks];
      tasks.splice(clampedIndex, 0, updatedTask);
      return { ...lane, tasks };
    }),
  };
}

function onDrop(taskId: number, laneName: string, index: number): void {
  board.value = applyMove(board.value, taskId, laneName, index);
  draggedTaskId.value = null;

  pendingSaves += 1;
  saveChain = saveChain
    .then(() =>
      fetch(`/api/tasks/${taskId}/placement`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lane: laneName, index }),
      }),
    )
    .then((response) => {
      if (!response.ok) {
        batchHadFailure = true;
      }
    })
    .catch(() => {
      batchHadFailure = true;
    })
    .then(async () => {
      pendingSaves -= 1;
      // Only reconcile once every currently-queued save has settled — an earlier failure
      // must not discard a later queued move's optimistic state before its own save lands.
      if (pendingSaves > 0) {
        return;
      }
      if (!batchHadFailure) {
        errorMessage.value = null;
        return;
      }
      batchHadFailure = false;
      errorMessage.value = "Couldn't save that move — the board has been restored.";
      try {
        const response = await fetch('/api/board');
        if (!response.ok) {
          throw new Error('board refetch failed');
        }
        const freshBoard = await response.json();
        // If a new drop landed while this refetch was in flight, pendingSaves is back above
        // zero and this response is now stale relative to that drop's optimistic update —
        // applying it would silently erase that update from the screen. Leave board.value
        // alone; that drop's own reconciliation cycle (once its pendingSaves next reaches
        // zero) will run this same check again against fresher data.
        if (pendingSaves === 0) {
          board.value = freshBoard;
        }
      } catch {
        // Server unreachable: the banner alone tells the user the move did not take.
      }
    });
}

function onCardDragStart(taskId: number): void {
  draggedTaskId.value = taskId;
}

function onCardDragEnd(): void {
  draggedTaskId.value = null;
}

function dismissError(): void {
  errorMessage.value = null;
}

defineExpose({ fetchBoard });

onMounted(() => {
  void fetchBoard().catch(() => {
    // Initial load failed: the board stays in its default empty state rather than crashing.
  });
});
</script>

<template>
  <div>
    <div v-if="errorMessage" class="error-banner" data-testid="error-banner">
      {{ errorMessage }}
      <button type="button" @click="dismissError">Dismiss</button>
    </div>
    <div class="board">
      <Lane
        v-for="lane in board.lanes"
        :key="lane.name"
        :name="lane.name"
        :tasks="lane.tasks"
        :dragged-task-id="draggedTaskId"
        @drop="onDrop"
        @card-dragstart="onCardDragStart"
        @card-dragend="onCardDragEnd"
      />
    </div>
  </div>
</template>

<style scoped>
.board {
  display: flex;
  gap: 1rem;
}
</style>
