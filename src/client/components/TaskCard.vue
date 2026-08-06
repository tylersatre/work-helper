<script setup lang="ts">
import type { Task } from '../../shared/types.js';

defineProps<{ task: Task }>();
</script>

<template>
  <li class="task-card" data-testid="task-card">{{ task.title }}</li>
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
