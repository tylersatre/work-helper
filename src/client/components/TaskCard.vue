<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { Task } from '../../shared/types.js';

const props = defineProps<{ task: Task }>();

const router = useRouter();

function onClick(): void {
  router.push(`/tasks/${props.task.id}`);
}
</script>

<template>
  <li class="task-card" data-testid="task-card" @click="onClick">{{ task.title }}</li>
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
