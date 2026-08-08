<script setup lang="ts">
import { ref } from 'vue';
import type { Task } from '../../shared/types.js';
import { computeDropIndex } from '../utils/drop-index.js';
import TaskCard from './TaskCard.vue';

const props = defineProps<{ name: string; tasks: Task[]; draggedTaskId: number | null }>();
const emit = defineEmits<{
  drop: [taskId: number, laneName: string, index: number];
  'card-dragstart': [taskId: number];
  'card-dragend': [];
}>();

const listEl = ref<HTMLElement | null>(null);
const dropIndex = ref<number | null>(null);

function otherCardMidpoints(): number[] {
  if (!listEl.value) {
    return [];
  }
  return Array.from(listEl.value.querySelectorAll<HTMLElement>('[data-testid="task-card"]'))
    .filter((el) => Number(el.dataset.taskId) !== props.draggedTaskId)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
}

function displayIndex(finalIndex: number): number {
  const draggedIndex = props.tasks.findIndex((task) => task.id === props.draggedTaskId);
  if (draggedIndex === -1) {
    return finalIndex;
  }
  return finalIndex <= draggedIndex ? finalIndex : finalIndex + 1;
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  dropIndex.value = computeDropIndex(event.clientY, otherCardMidpoints());
}

function onDragLeave(): void {
  dropIndex.value = null;
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  const taskId = Number(event.dataTransfer?.getData('text/plain'));
  const index = dropIndex.value ?? computeDropIndex(event.clientY, otherCardMidpoints());
  dropIndex.value = null;
  if (Number.isNaN(taskId)) {
    return;
  }
  emit('drop', taskId, props.name, index);
}

function onCardDragEnd(): void {
  dropIndex.value = null;
  emit('card-dragend');
}
</script>

<template>
  <section class="lane" data-testid="lane" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <h2>{{ name }}</h2>
    <ul class="lane-tasks" ref="listEl">
      <template v-for="(task, index) in tasks" :key="task.id">
        <li v-if="dropIndex !== null && displayIndex(dropIndex) === index" class="drop-indicator" data-testid="drop-indicator"></li>
        <TaskCard :task="task" @dragstart="emit('card-dragstart', $event)" @dragend="onCardDragEnd" />
      </template>
      <li v-if="dropIndex !== null && displayIndex(dropIndex) === tasks.length" class="drop-indicator" data-testid="drop-indicator"></li>
    </ul>
  </section>
</template>

<style scoped>
.lane {
  min-width: 200px;
  flex: 1;
}

.lane-tasks {
  list-style: none;
  padding: 0;
  margin: 0;
}

.drop-indicator {
  height: 3px;
  margin: 0.25rem 0;
  border-radius: 2px;
  background: #3b82f6;
}
</style>
