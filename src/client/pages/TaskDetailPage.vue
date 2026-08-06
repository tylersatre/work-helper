<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Person, TaskDetail } from '../../shared/types.js';
import LinkedPeople from '../components/LinkedPeople.vue';

const route = useRoute();
const task = ref<TaskDetail | null>(null);

async function fetchTask(): Promise<void> {
  const response = await fetch(`/api/tasks/${route.params.id}`);
  task.value = await response.json();
}

function onUpdatePeople(people: Person[]): void {
  if (task.value) {
    task.value.people = people;
  }
}

onMounted(fetchTask);
</script>

<template>
  <section v-if="task">
    <h2>{{ task.title }}</h2>
    <LinkedPeople :task-id="task.id" :people="task.people" @update:people="onUpdatePeople" />
  </section>
</template>
