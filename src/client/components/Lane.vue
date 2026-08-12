<script setup lang="ts">
import { NEmpty } from 'naive-ui';
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
  if (!Number.isInteger(taskId) || taskId <= 0) {
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
    <h2 class="lane-header">{{ name }}</h2>
    <ul class="lane-tasks" ref="listEl">
      <li v-if="dropIndex !== null && displayIndex(dropIndex) === 0" class="drop-indicator" data-testid="drop-indicator"></li>
      <li v-if="tasks.length === 0" class="lane-empty-item">
        <NEmpty data-testid="lane-empty" description="No tasks" size="small" />
      </li>
      <template v-for="(task, index) in tasks" :key="task.id">
        <li v-if="dropIndex !== null && index > 0 && displayIndex(dropIndex) === index" class="drop-indicator" data-testid="drop-indicator"></li>
        <TaskCard :task="task" @dragstart="emit('card-dragstart', $event)" @dragend="onCardDragEnd" />
      </template>
      <li v-if="dropIndex !== null && tasks.length > 0 && displayIndex(dropIndex) === tasks.length" class="drop-indicator" data-testid="drop-indicator"></li>
    </ul>
    <div v-if="$slots.footer" class="lane-footer">
      <slot name="footer" />
    </div>
  </section>
</template>

<style scoped>
.lane {
  display: flex;
  flex-direction: column;
  flex: 0 0 280px;
  width: 280px;
  height: 100%;
  min-height: 0;
  background: var(--wh-surface);
  border-radius: 6px;
  border: 1px solid var(--wh-border-subtle);
  overflow: hidden;
}

.lane-header {
  flex: 0 0 auto;
  margin: 0;
  padding: 0.65rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  border-bottom: 1px solid var(--wh-border-subtle);
}

.lane-tasks {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.5rem;
}

.lane-footer {
  flex: 0 0 auto;
  padding: 0.5rem;
  border-top: 1px solid var(--wh-border-subtle);
}

.lane-empty-item {
  padding: 1.5rem 0;
}

.drop-indicator {
  height: 3px;
  margin: 0.25rem 0;
  border-radius: 2px;
  background: #3b82f6;
}
</style>
