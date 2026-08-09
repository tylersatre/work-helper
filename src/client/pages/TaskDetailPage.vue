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
  <section v-if="task" class="task-detail">
    <h2 class="task-title">{{ task.title }}</h2>
    <p class="task-lane" data-testid="task-lane">Lane: {{ task.lane }}</p>
    <div class="task-detail-section">
      <h3>People</h3>
      <LinkedPeople :task-id="task.id" :people="task.people" @update:people="onUpdatePeople" />
    </div>
    <div class="task-detail-section">
      <h3>Notes</h3>
      <TaskNotes :task-id="task.id" :notes="task.notes" @update:notes="onUpdateNotes" />
    </div>
  </section>
</template>

<style scoped>
.task-detail {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.task-title {
  overflow-wrap: break-word;
  word-break: break-word;
}

.task-lane {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.task-detail-section {
  margin-top: 1.25rem;
}

.task-detail-section h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.5rem;
}
</style>
