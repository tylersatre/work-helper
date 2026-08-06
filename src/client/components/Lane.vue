<script setup lang="ts">
import type { Task } from '../../shared/types.js';
import TaskCard from './TaskCard.vue';

defineProps<{ name: string; tasks: Task[] }>();
</script>

<template>
  <section class="lane" data-testid="lane">
    <h2>{{ name }}</h2>
    <ul class="lane-tasks">
      <TaskCard v-for="task in tasks" :key="task.id" :task="task" />
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
</style>
