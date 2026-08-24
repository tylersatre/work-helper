<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { Task } from '../../shared/types.js';

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ dragstart: [taskId: number]; dragend: [] }>();

const router = useRouter();

function onClick(): void {
  router.push(`/tasks/${props.task.id}`);
}

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', String(props.task.id));
  emit('dragstart', props.task.id);
}

function onDragEnd(): void {
  emit('dragend');
}
</script>

<template>
  <li
    class="task-card"
    :class="{ 'task-card-archived': task.archived }"
    data-testid="task-card"
    :data-task-id="task.id"
    draggable="true"
    @click="onClick"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >{{ task.title }}<span v-if="task.archived" class="archived-badge" data-testid="archived-badge">Archived</span></li>
</template>

<style scoped>
.task-card {
  display: block;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  margin-bottom: 0.5rem;
  background: var(--wh-surface-raised);
  color: var(--wh-text-primary);
  font-size: 0.82rem;
  line-height: 1.35;
  overflow-wrap: break-word;
  word-break: break-word;
  cursor: pointer;
}

.task-card:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.task-card-archived {
  opacity: 0.6;
}

.archived-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  background: var(--wh-surface);
  border: 1px solid var(--wh-border-subtle);
  color: var(--wh-text-muted);
  font-size: 0.7rem;
  vertical-align: middle;
}
</style>
