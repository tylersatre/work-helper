<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { LinkedPerson, Note, TaskDetail } from '../../shared/types.js';
import LinkedPeople from '../components/LinkedPeople.vue';
import TaskNotes from '../components/TaskNotes.vue';

const route = useRoute();
const task = ref<TaskDetail | null>(null);

async function fetchTask(): Promise<void> {
  const response = await fetch(`/api/tasks/${route.params.id}`);
  task.value = await response.json();
}

function onUpdatePeople(people: LinkedPerson[]): void {
  if (task.value) {
    task.value.people = people;
  }
}

function onUpdateNotes(notes: Note[]): void {
  if (task.value) {
    task.value.notes = notes;
  }
}

onMounted(fetchTask);
</script>

<template>
  <section v-if="task">
    <h2>{{ task.title }}</h2>
    <p data-testid="task-lane">Lane: {{ task.lane }}</p>
    <LinkedPeople :task-id="task.id" :people="task.people" @update:people="onUpdatePeople" />
    <TaskNotes :task-id="task.id" :notes="task.notes" @update:notes="onUpdateNotes" />
  </section>
</template>
