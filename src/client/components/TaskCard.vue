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
    data-testid="task-card"
    :data-task-id="task.id"
    draggable="true"
    @click="onClick"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >{{ task.title }}</li>
</template>

<style scoped>
.task-card {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
