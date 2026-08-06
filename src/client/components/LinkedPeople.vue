<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Person } from '../../shared/types.js';

const props = defineProps<{ taskId: number; people: Person[] }>();

const emit = defineEmits<{ 'update:people': [people: Person[]] }>();

const query = ref('');
const results = ref<Person[]>([]);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer);

  const trimmed = value.trim();
  if (!trimmed) {
    results.value = [];
    return;
  }

  debounceTimer = setTimeout(async () => {
    const response = await fetch(`/api/people?q=${encodeURIComponent(trimmed)}`);
    results.value = await response.json();
  }, 300);
});

async function linkPerson(personId: number): Promise<void> {
  const response = await fetch(`/api/tasks/${props.taskId}/people`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personId }),
  });
  const task = await response.json();
  emit('update:people', task.people);
  query.value = '';
  results.value = [];
}

async function unlinkPerson(personId: number): Promise<void> {
  const response = await fetch(`/api/tasks/${props.taskId}/people/${personId}`, { method: 'DELETE' });
  const task = await response.json();
  emit('update:people', task.people);
}
</script>

<template>
  <div>
    <label for="task-detail-search">Search people</label>
    <input id="task-detail-search" v-model="query" type="text" name="search" />

    <ul v-if="results.length" class="people-list">
      <li v-for="person in results" :key="person.id" class="person-row" data-testid="search-result">
        {{ person.firstName }} {{ person.lastName }} — {{ person.email }}
        <button type="button" @click="linkPerson(person.id)">Link</button>
      </li>
    </ul>

    <ul class="people-list">
      <li v-for="person in people" :key="person.id" class="person-row" data-testid="linked-person">
        {{ person.firstName }} {{ person.lastName }}
        <button type="button" @click="unlinkPerson(person.id)">Remove</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.people-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.person-row {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
