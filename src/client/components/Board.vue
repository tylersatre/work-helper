<script setup lang="ts">
import { NButton } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { matchesBoardFilter } from '../../shared/board-filter.js';
import type { BoardFilter, BoardTask, BoardView, Tag } from '../../shared/types.js';
import { clearFilter as clearStoredFilter, readFilter, writeFilter } from '../utils/board-filter-storage.js';
import BoardFilterBar from './BoardFilterBar.vue';
import CreateTaskForm from './CreateTaskForm.vue';
import Lane from './Lane.vue';

const board = ref<BoardView>({ lanes: [] });
const draggedTaskId = ref<number | null>(null);
const errorMessage = ref<string | null>(null);
const filter = ref<BoardFilter>(readFilter());

watch(
  filter,
  (value) => {
    if (value.text.trim() === '' && value.tagIds.length === 0) {
      clearStoredFilter();
    } else {
      writeFilter(value);
    }
  },
  { deep: true },
);

// Names of every tag ever seen on this board, so a tag that a still-selected filter refers to
// keeps a real name in the selector even after the last card carrying it loses it (FR-007).
const knownTagNames = ref<Map<number, string>>(new Map());

watch(
  board,
  (value) => {
    for (const lane of value.lanes) {
      for (const task of lane.tasks) {
        for (const tag of task.tags) {
          knownTagNames.value.set(tag.id, tag.name);
        }
      }
    }
  },
  { immediate: true },
);

const filterActive = computed(() => filter.value.text.trim() !== '' || filter.value.tagIds.length > 0);

const visibleLanes = computed(() =>
  board.value.lanes.map((lane) => ({
    ...lane,
    tasks: lane.tasks.filter((task) => matchesBoardFilter(task, filter.value)),
  })),
);

const totalCount = computed(() => board.value.lanes.reduce((sum, lane) => sum + lane.tasks.length, 0));
const visibleCount = computed(() => visibleLanes.value.reduce((sum, lane) => sum + lane.tasks.length, 0));
const noMatches = computed(() => filterActive.value && visibleCount.value === 0);

const availableTags = computed(() => {
  const byId = new Map<number, { id: number; name: string }>();
  for (const lane of board.value.lanes) {
    for (const task of lane.tasks) {
      for (const tag of task.tags) {
        byId.set(tag.id, { id: tag.id, name: tag.name });
      }
    }
  }
  for (const tagId of filter.value.tagIds) {
    if (!byId.has(tagId)) {
      byId.set(tagId, { id: tagId, name: knownTagNames.value.get(tagId) ?? String(tagId) });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
});

function onFilterTextUpdate(value: string): void {
  filter.value = { ...filter.value, text: value };
}

function onFilterTagsUpdate(tagIds: number[]): void {
  filter.value = { ...filter.value, tagIds };
}

function clearFilter(): void {
  filter.value = { text: '', tagIds: [] };
}

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
  let movingTask: BoardTask | undefined;
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

  const updatedTask: BoardTask = { ...movingTask, lane: targetLaneName };

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
  // A filtered drag can't see the true destination length — always append past the end of the
  // lane's unfiltered task list, never the rendered/filtered one (FR-015).
  const targetIndex = filterActive.value ? (board.value.lanes.find((lane) => lane.name === laneName)?.tasks.length ?? index) : index;
  board.value = applyMove(board.value, taskId, laneName, targetIndex);
  draggedTaskId.value = null;

  pendingSaves += 1;
  saveChain = saveChain
    .then(() =>
      fetch(`/api/tasks/${taskId}/placement`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lane: laneName, index: targetIndex }),
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

function onTaskCreated(): void {
  void fetchBoard().catch(() => {
    // If the refetch fails, the board keeps showing what it had before the create.
  });
}

defineExpose({ fetchBoard });

onMounted(() => {
  // A restored filter (FR-014) can reference a tag no card on the freshly-fetched board carries
  // (or carries at all yet); seed every tag's real name up front so it never falls back to a raw id.
  void fetch('/api/tags')
    .then((response) => (response.ok ? (response.json() as Promise<Tag[]>) : []))
    .then((tags) => {
      if (!Array.isArray(tags)) {
        return;
      }
      for (const tag of tags) {
        knownTagNames.value.set(tag.id, tag.name);
      }
    })
    .catch(() => {
      // Tag names unavailable: a restored filter falls back to its id label.
    });

  void fetchBoard().catch(() => {
    // Initial load failed: the board stays in its default empty state rather than crashing.
  });
});
</script>

<template>
  <div class="board-wrapper">
    <div v-if="errorMessage" class="error-banner" data-testid="error-banner">
      {{ errorMessage }}
      <NButton size="small" @click="dismissError">Dismiss</NButton>
    </div>
    <BoardFilterBar
      :text="filter.text"
      :tag-ids="filter.tagIds"
      :tag-options="availableTags"
      :filter-active="filterActive"
      :visible-count="visibleCount"
      :total-count="totalCount"
      @update:text="onFilterTextUpdate"
      @update:tag-ids="onFilterTagsUpdate"
      @clear="clearFilter"
    />
    <p v-if="noMatches" class="board-no-matches" data-testid="board-no-matches">No cards match</p>
    <div class="board">
      <Lane
        v-for="(lane, index) in visibleLanes"
        :key="lane.name"
        :name="lane.name"
        :tasks="lane.tasks"
        :dragged-task-id="draggedTaskId"
        :filter-active="filterActive"
        @drop="onDrop"
        @card-dragstart="onCardDragStart"
        @card-dragend="onCardDragEnd"
      >
        <template v-if="index === 0" #footer>
          <CreateTaskForm @created="onTaskCreated" />
        </template>
      </Lane>
    </div>
  </div>
</template>

<style scoped>
.board-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.board {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  padding: 0.75rem;
}

.board-no-matches {
  margin: 0.75rem 0.75rem 0;
  color: var(--wh-text-secondary);
  font-size: 0.85rem;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  margin: 0.75rem 0.75rem 0;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--wh-error);
  border: 1px solid rgba(239, 68, 68, 0.4);
}
</style>
